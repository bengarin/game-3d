// Crystal Vale - game bootstrap, state machine, camera and render loop.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World, terrainHeight, WATER_LEVEL } from './world.js';
import { Particles } from './particles.js';
import { Input } from './input.js';
import { AudioFX } from './audio.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Level, CRYSTAL_TOTAL } from './level.js';
import { UI } from './ui.js';

const QUALITY = {
  low: { pixelRatio: 1, shadows: 0, bloom: false, grass: 0.3 },
  medium: { pixelRatio: 1.5, shadows: 1024, bloom: true, grass: 0.65 },
  high: { pixelRatio: 2, shadows: 2048, bloom: true, grass: 1 },
};
const DEFAULTS = { sensitivity: 1, volume: 0.7, quality: 'high', music: true, invertY: false };
const SAVE_KEY = 'crystal-vale';

class Game {
  constructor() {
    const save = this.loadSave();
    this.settings = { ...DEFAULTS, ...save.settings };
    if (!QUALITY[this.settings.quality]) this.settings.quality = 'high';
    this.bestScore = save.best || 0;
    this.state = 'loading';
    this.time = 0; this.playTime = 0; this.score = 0;
    this.camYaw = 0; this.camPitch = 0.32; this.camDist = 6.5; this.shake = 0;
    this.camTarget = new THREE.Vector3(0, 2, 0);
    this.timers = [];

    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);

    this.audio = new AudioFX();
    this.input = new Input(this.canvas);
    this.ui = new UI(this);
    this.input.onLockChange = (locked) => {
      if (locked) this.wasLocked = true;
      else if (this.wasLocked && this.state === 'playing') this.pause();
    };
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused' && this.ui.current === 'pause') this.resume();
      else if (['settings', 'howto'].includes(this.ui.current)) this.ui.show(this.ui.backTo);
    });
  }

  loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ settings: this.settings, best: this.bestScore })); } catch { /* private mode */ } }

  async init() {
    this.ui.loading(0.1, 'Waking the robot…');
    const url = import.meta.env.BASE_URL + 'models/RobotExpressive.glb';
    const gltf = await new GLTFLoader().loadAsync(url, (e) => { if (e.total) this.ui.loading(0.1 + 0.5 * (e.loaded / e.total)); });
    this.ui.loading(0.65, 'Growing the forest…');
    await new Promise((r) => setTimeout(r, 30));

    this.world = new World(this.scene);
    this.particles = new Particles(this.scene);
    this.player = new Player(this.scene, gltf, this.world, this);
    this.newRun();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.applySettings();
    this.resize();
    this.ui.loading(0.9, 'Lighting the crystals…');
    this.renderer.compile(this.scene, this.camera);
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
    this.ui.loading(1);
    await new Promise((r) => setTimeout(r, 350));
    this.toMenu(true);
  }

  // ---------- settings ----------
  applySettings() {
    const s = this.settings, q = QUALITY[s.quality];
    this.audio.setVolume(s.volume);
    this.audio.musicOn = s.music;
    if (!s.music) this.audio.stopMusic(); else if (this.state === 'playing' && !this.audio.musicTimer) this.audio.startMusic();
    if (this.world) {
      const sun = this.world.sun;
      sun.castShadow = q.shadows > 0;
      if (q.shadows && sun.shadow.mapSize.x !== q.shadows) {
        sun.shadow.mapSize.set(q.shadows, q.shadows);
        sun.shadow.map?.dispose(); sun.shadow.map = null;
      }
      this.world.setGrassDensity(q.grass);
      this.useComposer = q.bloom;
      this.resize();
    }
    this.save();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, QUALITY[this.settings.quality].pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    if (this.particles) {
      const scale = (h * pr) / 900;
      this.particles.material.uniforms.uScale.value = scale;
      this.world.fireflies.material.uniforms.uScale.value = scale;
    }
  }

  // ---------- flow ----------
  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  newRun() {
    this.level?.dispose(); this.enemies?.dispose();
    this.level = new Level(this.scene, this.world);
    this.enemies = new Enemies(this.scene, this.world);
    this.player.reset();
    this.particles.clear();
    this.timers.length = 0;
    this.score = 0; this.playTime = 0; this.coinsTaken = 0; this.kills = 0;
    this.camYaw = 0; this.camPitch = 0.32; this.camDist = 6.5;
    this.camTarget.copy(this.player.pos).y += 1.5;
    this.ui.setScore(0); this.ui.setCrystals(0); this.ui.setTime(0);
    this.ui.setObjective(`Find the energy crystals  0 / ${CRYSTAL_TOTAL}`);
    this.ui.setPrompt(null, null);
  }

  start() {
    this.audio.ensure();
    this.input.lock(); // must happen inside the click gesture
    this.ui.fade(() => {
      this.newRun();
      this.state = 'playing';
      this.ui.show(null); this.ui.hud(true);
      this.audio.startMusic();
      this.ui.toast('Find the 7 crystals', 'big');
      this.input.endFrame();
    });
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.unlock();
    this.ui.show('pause');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.show(null);
    this.input.lock();
    this.input.endFrame();
    this.last = performance.now();
  }
  toMenu(instant = false) {
    const go = () => {
      this.input.unlock(); this.wasLocked = false;
      this.audio.stopMusic();
      this.newRun();
      this.state = 'menu';
      this.ui.hud(false); this.ui.best(this.bestScore); this.ui.show('menu');
    };
    if (instant) go(); else this.ui.fade(go);
  }

  win() {
    if (this.state !== 'playing') return;
    this.state = 'victory';
    this.player.celebrate();
    this.audio.stopMusic(); this.audio.win();
    const bonus = Math.max(0, Math.round((900 - this.playTime) * 2)) + Math.round(this.player.health) * 3;
    const base = this.score;
    this.score += bonus;
    const isBest = this.score > this.bestScore;
    if (isBest) { this.bestScore = this.score; this.save(); }
    this.ui.setPrompt(null, null);
    this.after(3.2, () => { this.input.unlock(); this.wasLocked = false; this.ui.hud(false); this.ui.victory(this.score, bonus, this.playTime, isBest); });
    this.lastResult = { base, bonus };
  }

  // ---------- gameplay events ----------
  addScore(n, label) {
    this.score += n; this.ui.setScore(this.score, true);
    if (label) this.ui.toast(`${label}  +${n}`, 'gold');
  }
  onCoin() { this.coinsTaken++; this.addScore(10); this.audio.coin(); }
  onHeal() { this.audio.heal(); this.ui.toast('Health restored', ''); }
  onCrystal(n) {
    this.audio.crystal();
    this.addScore(100);
    this.ui.setCrystals(n);
    this.ui.toast(`Crystal ${n} / ${CRYSTAL_TOTAL}`, 'big');
    if (n < CRYSTAL_TOTAL) this.ui.setObjective(`Find the energy crystals  ${n} / ${CRYSTAL_TOTAL}`);
  }
  onPortalAwake() {
    this.audio.portal();
    this.ui.setObjective('The portal is awake - return to it!', true);
    this.after(1.2, () => this.ui.toast('The portal is awake!', 'big'));
  }
  onEnemyKilled(e) {
    this.kills++;
    this.addScore(50, 'Sentinel destroyed');
    this.level.dropCoins(e.pos, 2);
    this.shake = Math.max(this.shake, 0.25);
  }
  onPunch() { if (this.enemies.punch(this.player, this)) this.shake = Math.max(this.shake, 0.2); }
  onPlayerHurt() { this.audio.hurt(); this.ui.hurtFlash(); this.shake = 0.45; }
  onPlayerDied() {
    this.state = 'dead';
    this.audio.stopMusic(); this.audio.lose();
    this.ui.setPrompt(null, null);
    this.after(2.4, () => { this.input.unlock(); this.wasLocked = false; this.ui.hud(false); this.ui.gameOver(this.score, this.level.collected); });
  }

  // ---------- camera ----------
  updateCamera(dt) {
    const p = this.player, inp = this.input, s = this.settings;
    if (this.state === 'menu') {
      this.camYaw += dt * 0.12; this.camPitch = 0.2; this.camDist = 7.5;
    } else if (this.state === 'victory') {
      this.camYaw += dt * 0.5; this.camDist += (5.5 - this.camDist) * dt * 2;
    } else if (this.state === 'playing' || this.state === 'dead') {
      const k = 0.0024 * s.sensitivity;
      this.camYaw -= inp.dx * k;
      this.camPitch += inp.dy * k * (s.invertY ? -1 : 1);
      this.camPitch = Math.min(1.25, Math.max(-0.12, this.camPitch));
      this.camDist = Math.min(11, Math.max(3, this.camDist + inp.wheel * 0.7));
    }
    const tx = p.pos.x, ty = p.pos.y + 1.55 - p.crouchT * 0.5, tz = p.pos.z;
    const k = Math.min(1, dt * 10);
    this.camTarget.x += (tx - this.camTarget.x) * k; this.camTarget.z += (tz - this.camTarget.z) * k;
    this.camTarget.y += (ty - this.camTarget.y) * Math.min(1, dt * 7);

    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dx = Math.sin(this.camYaw) * cp, dz = Math.cos(this.camYaw) * cp;
    // pull the camera in when terrain would block the view
    let dist = this.camDist;
    for (let i = 1; i <= 10; i++) {
      const d = (this.camDist * i) / 10;
      const x = this.camTarget.x + dx * d, y = this.camTarget.y + sp * d, z = this.camTarget.z + dz * d;
      if (this.world.blocksCamera(x, y, z)) { dist = Math.max(1.2, (this.camDist * (i - 1)) / 10); break; }
    }
    this.camSmoothDist = this.camSmoothDist === undefined ? dist : dist < this.camSmoothDist ? dist : this.camSmoothDist + (dist - this.camSmoothDist) * Math.min(1, dt * 4);
    const D = this.camSmoothDist;
    const cam = this.camera.position;
    cam.set(this.camTarget.x + dx * D, this.camTarget.y + sp * D, this.camTarget.z + dz * D);
    cam.y = Math.max(cam.y, Math.max(terrainHeight(cam.x, cam.z), WATER_LEVEL) + 0.35);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const a = this.shake * 0.5;
      cam.x += (Math.random() - 0.5) * a; cam.y += (Math.random() - 0.5) * a; cam.z += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(this.camTarget);
  }

  // ---------- main loop ----------
  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    if (this.useComposer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    if (this.state === 'paused') { this.input.endFrame(); return; }
    this.time += dt;
    const active = this.state === 'playing';
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if ((tm.t -= dt) <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }

    this.player.update(dt, active ? this.input : null, this.camYaw);
    if (this.state !== 'menu') {
      this.enemies.update(dt, this.time, this.player, this);
      this.level.update(dt, this.time, this.player, this);
    } else {
      this.level.update(dt, this.time, { pos: new THREE.Vector3(0, -999, 0), dead: true, height: 1.7, vel: new THREE.Vector3(), health: 100 }, this);
      this.enemies.update(dt, this.time, { pos: new THREE.Vector3(0, -999, 0), dead: true, crouching: false, height: 1.7, vel: new THREE.Vector3() }, this);
    }
    if (active) {
      this.playTime += dt;
      const it = this.level.interactable(this.player);
      this.ui.setPrompt(it?.label || null, it?.hint || null);
      if (it?.run && this.input.hit('KeyE', 'Enter')) it.run(this);
    }
    this.particles.update(dt);
    this.updateCamera(dt);
    this.world.update(dt, this.time, this.player.pos, this.camera);

    if (this.state !== 'menu') {
      this.ui.setHealth(this.player.health, this.player.stamina, this.player.exhausted);
      if (active) this.ui.setTime(this.playTime);
      if ((this.frameNo = (this.frameNo || 0) + 1) % 3 === 0) this.ui.drawMinimap(this);
    }
    this.input.endFrame();
  }
}

const game = new Game();
window.__game = game; // handy for debugging & automated tests
game.init().catch((err) => {
  console.error(err);
  document.getElementById('load-text').textContent = 'Failed to load the game: ' + err.message;
});
