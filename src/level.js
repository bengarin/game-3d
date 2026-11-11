// Level content: crystals, coins, hearts, chests, laser vaults and the portal.
import * as THREE from 'three';
import { terrainHeight, WATER_LEVEL, POI } from './world.js';

export const CRYSTAL_TOTAL = 7;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.25);
  s.bezierCurveTo(0, 0.55, -0.55, 0.55, -0.55, 0.2);
  s.bezierCurveTo(-0.55, -0.1, -0.15, -0.3, 0, -0.55);
  s.bezierCurveTo(0.15, -0.3, 0.55, -0.1, 0.55, 0.2);
  s.bezierCurveTo(0.55, 0.55, 0, 0.55, 0, 0.25);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 3 });
  g.center(); g.scale(0.6, 0.6, 0.6);
  return g;
}

const floorY = (x, z) => Math.max(terrainHeight(x, z), WATER_LEVEL);

export class Level {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    world.dynCircles.length = 0;
    this.crystals = []; this.coins = []; this.hearts = []; this.chests = []; this.lasers = [];
    this.collected = 0;
    this.glowTex = glowTexture();

    this.mat = {
      crystal: new THREE.MeshStandardMaterial({ color: 0x7ff3ff, emissive: 0x25d9ff, emissiveIntensity: 2.4, roughness: 0.15, metalness: 0.2, flatShading: true, transparent: true, opacity: 0.92 }),
      coin: new THREE.MeshStandardMaterial({ color: 0xffc933, emissive: 0xff9a00, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.9 }),
      heart: new THREE.MeshStandardMaterial({ color: 0xff3355, emissive: 0xff1144, emissiveIntensity: 1.3, roughness: 0.35 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffd35a, roughness: 0.3, metalness: 0.9, emissive: 0xaa6a00, emissiveIntensity: 0.4 }),
      pylon: new THREE.MeshStandardMaterial({ color: 0x3a3f4d, roughness: 0.4, metalness: 0.8, flatShading: true }),
      beam: new THREE.MeshBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
      emitter: new THREE.MeshStandardMaterial({ color: 0x330008, emissive: 0xff2a4a, emissiveIntensity: 3 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.85, flatShading: true }),
      rune: new THREE.MeshStandardMaterial({ color: 0x1a3540, emissive: 0x25d9ff, emissiveIntensity: 0.15, roughness: 0.5 }),
    };
    this.geo = {
      crystal: new THREE.OctahedronGeometry(0.5, 0).scale(0.8, 1.5, 0.8),
      coin: new THREE.CylinderGeometry(0.32, 0.32, 0.07, 20).rotateX(Math.PI / 2),
      heart: heartGeometry(),
      beam: new THREE.CylinderGeometry(0.045, 0.045, 1, 8).rotateZ(Math.PI / 2),
      pylon: new THREE.CylinderGeometry(0.28, 0.4, 3.4, 6),
      emitter: new THREE.SphereGeometry(0.14, 10, 8),
      lightShaft: new THREE.CylinderGeometry(0.22, 0.5, 26, 12, 1, true),
    };

    this.buildCrystals();
    this.buildCoins();
    this.buildHearts();
    this.buildChests();
    this.buildVault(POI.vaultCrouch, 'crouch');
    this.buildVault(POI.vaultJump, 'jump');
    this.buildPortal();
  }

  // ---------- builders ----------
  buildCrystals() {
    const top = this.world.skySteps.at(-1);
    const spots = [
      [POI.lake.x, POI.lake.z], [top.x, top.z, top.y], [POI.vaultCrouch.x, POI.vaultCrouch.z], [POI.vaultJump.x, POI.vaultJump.z],
      [POI.camp.x, POI.camp.z], [POI.ruins.x, POI.ruins.z], [POI.hill.x, POI.hill.z],
    ];
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0x35dcff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const [x, z, yOverride] of spots) {
      const base = yOverride ?? floorY(x, z);
      const g = new THREE.Group();
      const gem = new THREE.Mesh(this.geo.crystal, this.mat.crystal); gem.castShadow = true;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x45e0ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(3.4);
      const shaft = new THREE.Mesh(this.geo.lightShaft, shaftMat); shaft.position.y = 12.5;
      g.add(gem, halo, shaft);
      g.position.set(x, base + 1.3, z);
      this.group.add(g);
      this.crystals.push({ g, gem, pos: new THREE.Vector3(x, base + 1.3, z), baseY: base + 1.3, taken: false });
    }
  }

  addCoin(x, z, y = null, pop = false) {
    const baseY = y ?? floorY(x, z) + 0.95;
    const m = new THREE.Mesh(this.geo.coin, this.mat.coin); m.castShadow = true;
    m.position.set(x, baseY, z);
    this.group.add(m);
    const coin = { m, pos: m.position, baseY, taken: false, vy: pop ? 6 : 0, phase: Math.random() * 6 };
    this.coins.push(coin);
    return coin;
  }

  buildCoins() {
    // breadcrumb trails from the spawn meadow to every landmark
    for (const key of ['lake', 'skyPath', 'vaultCrouch', 'vaultJump', 'camp', 'ruins', 'hill']) {
      const p = POI[key];
      for (let i = 0; i < 5; i++) {
        const t = 0.26 + i * 0.12;
        this.addCoin(p.x * t + Math.sin(i * 1.3 + p.x) * 1.2, p.z * t + Math.cos(i * 1.7 + p.z) * 1.2);
      }
    }
    // rewards along the sky path
    for (const s of this.world.skySteps.slice(0, -1)) this.addCoin(s.x, s.z, s.y + 1.1);
    // ring around the lake island
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.addCoin(POI.lake.x + Math.cos(a) * 12, POI.lake.z + Math.sin(a) * 12);
    }
  }

  buildHearts() {
    for (const [x, z] of [[18, -8], [-36, 30], [46, 30], [-30, -44], [70, -14]]) {
      const m = new THREE.Mesh(this.geo.heart, this.mat.heart); m.castShadow = true;
      const y = floorY(x, z) + 1.1;
      m.position.set(x, y, z);
      this.group.add(m);
      this.hearts.push({ m, pos: m.position, baseY: y, taken: false });
    }
  }

  buildChests() {
    for (const [x, z, rot] of [[-70, -30, 0.8], [58, -58, -0.6], [-8, 82, 3.1], [78, 40, -1.6]]) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.9), this.mat.wood); base.position.y = 0.35;
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.12, 0.96), this.mat.gold); trim.position.y = 0.68;
      const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.72, -0.45);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI), this.mat.wood);
      lid.rotation.x = -Math.PI / 2; lid.position.set(0, 0, 0.45);
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.08), this.mat.gold); lock.position.set(0, 0.02, 0.92);
      lidPivot.add(lid, lock);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffc040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(2.6); halo.position.y = 0.9;
      g.add(base, trim, lidPivot, halo);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.position.set(x, terrainHeight(x, z), z); g.rotation.y = rot;
      this.group.add(g);
      this.world.dynCircles.push({ x, z, r: 0.75 });
      this.chests.push({ g, lidPivot, halo, pos: new THREE.Vector3(x, g.position.y, z), open: false, t: 0 });
    }
  }

  /** A square of laser fences guarding a crystal. 'crouch' = sneak under, 'jump' = hop over a moving beam. */
  buildVault(c, kind) {
    const R = 4.2, y0 = terrainHeight(c.x, c.z);
    const corners = [[-R, -R], [R, -R], [R, R], [-R, R]].map(([dx, dz]) => ({ x: c.x + dx, z: c.z + dz }));
    for (const p of corners) {
      const pylon = new THREE.Mesh(this.geo.pylon, this.mat.pylon);
      pylon.position.set(p.x, y0 + 1.6, p.z); pylon.castShadow = true;
      this.group.add(pylon);
      this.world.dynCircles.push({ x: p.x, z: p.z, r: 0.5 });
    }
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const defs = kind === 'crouch'
        ? [{ y: 1.28 }, { y: 1.95 }, { y: 2.62 }, { y: 3.2 }]
        : [{ y: 0.38 }, { y: 0.38, sweep: 1.25, phase: i * 1.6 }];
      for (const d of defs) {
        const beam = new THREE.Mesh(this.geo.beam, this.mat.beam);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        beam.scale.set(len, 1, 1);
        beam.position.set((a.x + b.x) / 2, y0 + d.y, (a.z + b.z) / 2);
        beam.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        this.group.add(beam);
        for (const e of [a, b]) {
          const em = new THREE.Mesh(this.geo.emitter, this.mat.emitter);
          em.position.set(e.x + (beam.position.x - e.x) * 0.07, y0 + d.y, e.z + (beam.position.z - e.z) * 0.07);
          this.group.add(em); (d.ems ||= []).push(em);
        }
        this.lasers.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: y0 + d.y, y0: y0 + d.y, sweep: d.sweep || 0, phase: d.phase || 0, beam, ems: d.ems });
      }
    }
  }

  buildPortal() {
    const { x, z } = POI.portal, y = terrainHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.42, 8, 14), this.mat.stone);
    ring.position.y = 2.9; ring.castShadow = true;
    const stepA = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.3, 10), this.mat.stone); stepA.position.y = 0.05; stepA.receiveShadow = true;
    const stepB = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.6, 0.3, 10), this.mat.stone); stepB.position.y = 0.3; stepB.receiveShadow = true;
    this.runes = [];
    for (let i = 0; i < CRYSTAL_TOTAL; i++) {
      const a = (i / (CRYSTAL_TOTAL - 1)) * Math.PI * 1.5 - Math.PI * 0.25;
      const mat = this.mat.rune.clone();
      const r = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), mat);
      r.position.set(Math.cos(a) * 2.6, 2.9 + Math.sin(a) * 2.6, 0.45);
      g.add(r); this.runes.push(r);
    }
    this.portalUniforms = { uTime: { value: 0 }, uActive: { value: 0 } };
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.35, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: this.portalUniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uActive; varying vec2 vUv;
        void main(){
          float r = length(vUv), a = atan(vUv.y, vUv.x);
          float swirl = sin(a * 3.0 + r * 9.0 - uTime * 3.2) * 0.5 + 0.5;
          float swirl2 = sin(a * 5.0 - r * 14.0 + uTime * 2.1) * 0.5 + 0.5;
          vec3 col = mix(vec3(0.05, 0.5, 1.0), vec3(0.6, 1.0, 0.95), swirl) + vec3(0.7, 0.3, 1.0) * swirl2 * 0.5;
          col += vec3(0.5) * smoothstep(0.35, 0.0, r);
          float alpha = smoothstep(1.0, 0.82, r) * (0.55 + 0.45 * swirl) * uActive;
          gl_FragColor = vec4(col * 0.8, alpha * 0.9);
        }`,
    }));
    disc.position.y = 2.9;
    this.portalLight = new THREE.PointLight(0x40d0ff, 0, 22, 1.6);
    this.portalLight.position.set(0, 2.9, 1.2);
    g.add(ring, stepA, stepB, disc, this.portalLight);
    this.group.add(g);
    this.portal = { g, ring, pos: new THREE.Vector3(x, y, z), active: false, power: 0 };
    this.world.dynCircles.push({ x: x - 2.6, z, r: 0.6 }, { x: x + 2.6, z, r: 0.6 });
  }

  dropCoins(pos, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const c = this.addCoin(pos.x + Math.cos(a) * 1.1, pos.z + Math.sin(a) * 1.1, null, true);
      c.pos.y = pos.y;
    }
  }

  /** Returns the interaction currently available to the player, if any. */
  interactable(player) {
    for (const c of this.chests) {
      if (!c.open && c.pos.distanceTo(player.pos) < 2.6) return { label: 'Open chest', run: (game) => this.openChest(c, game) };
    }
    const d = Math.hypot(player.pos.x - this.portal.pos.x, player.pos.z - this.portal.pos.z);
    if (d < 4.2) {
      if (this.portal.active) return { label: 'Enter the portal', run: (game) => game.win() };
      return { label: null, hint: `The portal sleeps - ${CRYSTAL_TOTAL - this.collected} crystal${CRYSTAL_TOTAL - this.collected > 1 ? 's' : ''} missing` };
    }
    return null;
  }

  openChest(c, game) {
    c.open = true;
    game.audio.chest();
    game.addScore(50, 'Treasure!');
    game.player.heal(20);
    const p = c.pos.clone(); p.y += 1;
    game.particles.emit(p, { count: 40, color: 0xffd45a, speed: 5, life: 1.0, size: 0.3, gravity: 6, up: 0.9 });
    this.dropCoins(p, 6);
  }

  update(dt, t, player, game) {
    const pp = player.pos, alive = !player.dead && !player.celebrating;
    const chestY = pp.y + 0.9;

    // crystals
    for (const c of this.crystals) {
      if (c.taken) continue;
      c.g.position.y = c.baseY + Math.sin(t * 1.8 + c.pos.x) * 0.18;
      c.gem.rotation.y = t * 1.4;
      if (alive && Math.hypot(pp.x - c.pos.x, pp.z - c.pos.z) < 1.25 && Math.abs(chestY - c.baseY) < 1.7) {
        c.taken = true; c.g.visible = false; this.collected++;
        game.particles.emit(c.pos, { count: 70, color: 0x55e8ff, speed: 7, life: 1.1, size: 0.36, gravity: 2, up: 0.4 });
        game.onCrystal(this.collected);
        const rune = this.runes[this.collected - 1];
        rune.material.emissiveIntensity = 2.2; rune.material.color.set(0x7ff3ff);
        if (this.collected === CRYSTAL_TOTAL) { this.portal.active = true; game.onPortalAwake(); }
      }
    }
    // coins (with a little magnet)
    for (const c of this.coins) {
      if (c.taken) continue;
      c.m.rotation.y = t * 3 + c.phase;
      if (c.vy !== 0) { // popping out of a chest / enemy
        c.vy -= 20 * dt; c.pos.y += c.vy * dt;
        if (c.pos.y <= c.baseY && c.vy < 0) { c.pos.y = c.baseY; c.vy = 0; }
      } else if (!c.magnet) c.pos.y = c.baseY + Math.sin(t * 2.4 + c.phase) * 0.12;
      const dx = pp.x - c.pos.x, dy = chestY - c.pos.y, dz = pp.z - c.pos.z, d = Math.hypot(dx, dy, dz);
      if (alive && d < 3.2 && c.vy <= 0) {
        c.magnet = true; c.vy = 0;
        const sp = Math.min(1, 9 * dt / Math.max(d, 0.2));
        c.pos.x += dx * sp; c.pos.y += dy * sp; c.pos.z += dz * sp;
      }
      if (alive && d < 0.9) {
        c.taken = true; c.m.visible = false;
        game.particles.emit(c.pos, { count: 10, color: 0xffd040, speed: 2.5, life: 0.45, size: 0.2, gravity: 2 });
        game.onCoin();
      }
    }
    // hearts
    for (const h of this.hearts) {
      if (h.taken) continue;
      h.m.rotation.y = t * 1.6; h.m.position.y = h.baseY + Math.sin(t * 2 + h.pos.x) * 0.15;
      const s = 1 + Math.sin(t * 6) * 0.06; h.m.scale.setScalar(s);
      if (alive && player.health < 100 && Math.hypot(pp.x - h.pos.x, pp.z - h.pos.z) < 1.2 && Math.abs(chestY - h.baseY) < 1.6) {
        h.taken = true; h.m.visible = false;
        player.heal(30);
        game.particles.emit(h.pos, { count: 26, color: 0xff5577, speed: 3.5, life: 0.8, size: 0.28, gravity: -2 });
        game.onHeal();
      }
    }
    // chests
    for (const c of this.chests) {
      if (c.open && c.t < 1) {
        c.t = Math.min(1, c.t + dt * 2.5);
        c.lidPivot.rotation.x = -1.9 * (1 - Math.pow(1 - c.t, 3));
      }
      c.halo.material.opacity = c.open ? Math.max(0, 0.55 - c.t) : 0.4 + Math.sin(t * 3) * 0.15;
    }
    // lasers
    this.mat.beam.opacity = 0.8 + Math.sin(t * 40) * 0.15;
    for (const l of this.lasers) {
      if (l.sweep) {
        l.y = l.y0 + (Math.sin(t * 1.5 + l.phase) * 0.5 + 0.5) * l.sweep;
        l.beam.position.y = l.y; for (const e of l.ems) e.position.y = l.y;
      }
      if (!alive) continue;
      const ex = l.bx - l.ax, ez = l.bz - l.az, len = Math.hypot(ex, ez);
      const u = Math.min(1, Math.max(0, ((pp.x - l.ax) * ex + (pp.z - l.az) * ez) / (len * len)));
      const cx = l.ax + ex * u, cz = l.az + ez * u;
      const nx = -ez / len, nz = ex / len;
      const touching = Math.hypot(pp.x - cx, pp.z - cz) < 0.42;
      // remember which side the player approached from, so the fence always pushes back that way
      if (!touching) { l.side = Math.sign((pp.x - l.ax) * nx + (pp.z - l.az) * nz) || 1; continue; }
      if (l.y < pp.y + 0.04 || l.y > pp.y + player.height) continue;
      const side = l.side || 1;
      const from = new THREE.Vector3(pp.x - nx * side, 0, pp.z - nz * side);
      if (player.takeDamage(20, from, 7.5)) {
        game.audio.zap();
        game.particles.emit(new THREE.Vector3(cx, l.y, cz), { count: 30, color: 0xff3355, speed: 5, life: 0.5, size: 0.24 });
      }
    }
    // portal
    const P = this.portal;
    P.power += ((P.active ? 1 : 0) - P.power) * Math.min(1, dt * 1.5);
    this.portalUniforms.uTime.value = t; this.portalUniforms.uActive.value = P.power;
    this.portalLight.intensity = P.power * 22;
    if (P.active && Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2;
      const p = new THREE.Vector3(P.pos.x + Math.cos(a) * 2.5, P.pos.y + 2.9 + Math.sin(a) * 2.5, P.pos.z);
      game.particles.emit(p, { count: 1, color: 0x66e0ff, speed: 0.8, life: 1.2, size: 0.22, gravity: -1.5 });
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.world.dynCircles.length = 0;
  }
}
