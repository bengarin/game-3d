// Player: skinned glTF character driven by an AnimationMixer + kinematic character controller.
import * as THREE from 'three';
import { WATER_LEVEL } from './world.js';

const GRAVITY = 26, JUMP_V = 9.4, WALK = 4.6, RUN = 8.6, SNEAK = 2.3, RADIUS = 0.45;
export const MAX_HEALTH = 100;

export class Player {
  constructor(scene, gltf, world, game) {
    this.world = world; this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.root = new THREE.Group();
    scene.add(this.root);

    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    model.scale.setScalar(1.75 / (box.max.y - box.min.y));
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    this.root.add(model);
    this.model = model;

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const n of ['Jump', 'Punch', 'Death']) {
      this.actions[n].setLoop(THREE.LoopOnce, 1);
      this.actions[n].clampWhenFinished = true;
    }
    this.current = null;
    this.reset();
  }

  reset() {
    const y = this.world.groundAt(0, 0, 50);
    this.pos.set(0, y, 0); this.vel.set(0, 0, 0);
    this.health = MAX_HEALTH; this.stamina = 1;
    this.heading = Math.PI; this.grounded = true; this.coyote = 0;
    this.crouching = false; this.crouchT = 0;
    this.invuln = 0; this.punchT = 0; this.punchHit = false;
    this.dead = false; this.celebrating = false; this.exhausted = false;
    this.stepT = 0;
    this.root.visible = true;
    this.mixer.stopAllAction(); this.current = null;
    this.play('Idle', 0);
    this.sync();
  }

  get height() { return this.crouching ? 1.0 : 1.7; }

  play(name, fade = 0.18) {
    if (this.current === name) return;
    const next = this.actions[name], prev = this.actions[this.current];
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.current = name;
  }

  takeDamage(amount, from, knock = 7) {
    if (this.dead || this.celebrating) return false;
    // knockback always applies so hazards stay solid even during invulnerability
    if (from) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      this.vel.x = (dx / d) * knock; this.vel.z = (dz / d) * knock;
      if (this.grounded) { this.vel.y = 5; this.grounded = false; }
    }
    if (this.invuln > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.invuln = 1.1;
    this.game.onPlayerHurt(amount);
    if (this.health <= 0) { this.dead = true; this.play('Death', 0.1); this.game.onPlayerDied(); }
    return true;
  }

  heal(n) { this.health = Math.min(MAX_HEALTH, this.health + n); }

  celebrate() { this.celebrating = true; this.vel.set(0, 0, 0); this.play('Dance', 0.3); }

  update(dt, input, camYaw) {
    const w = this.world;
    const controllable = !this.dead && !this.celebrating && input;
    let mx = 0, mz = 0, wantRun = false;

    if (controllable) {
      const { f, s } = input.axis();
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      mx = fx * f + rx * s; mz = fz * f + rz * s;
      const len = Math.hypot(mx, mz);
      if (len > 0) { mx /= len; mz /= len; }
      this.crouching = input.down('KeyC', 'ControlLeft') && this.grounded;
      wantRun = input.down('ShiftLeft', 'ShiftRight') && len > 0 && !this.crouching;

      if (input.hit('Space') && (this.grounded || this.coyote > 0) && !this.crouching) {
        this.vel.y = JUMP_V; this.grounded = false; this.coyote = 0;
        this.actions.Jump.reset(); this.current = this.current === 'Jump' ? null : this.current;
        this.game.audio.jump();
        this.game.particles.emit(this.pos, { count: 8, color: 0xd8c9a0, speed: 1.6, life: 0.4, size: 0.2, gravity: 1, up: 0.2 });
      }
      if (input.hit('KeyF', 'Mouse0') && this.punchT <= 0 && !this.crouching) {
        this.punchT = 0.5; this.punchHit = false;
        this.actions.Punch.reset(); if (this.current === 'Punch') this.current = null;
        this.game.audio.punch();
      }
    } else {
      this.crouching = false;
    }

    // stamina
    if (this.stamina <= 0) this.exhausted = true;
    if (this.stamina > 0.3) this.exhausted = false;
    const running = wantRun && !this.exhausted;
    this.stamina = Math.min(1, Math.max(0, this.stamina + (running ? -0.22 : 0.3) * dt));

    const wading = this.pos.y < WATER_LEVEL - 0.35;
    let speed = this.crouching ? SNEAK : running ? RUN : WALK;
    if (wading) speed *= 0.6;
    if (this.punchT > 0.15) speed *= 0.35;
    const accel = this.grounded ? 12 : 3.5;
    const k = Math.min(1, accel * dt);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;

    // integrate
    const wasGrounded = this.grounded;
    this.vel.y -= GRAVITY * dt;
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
    if (w.resolve(this.pos, RADIUS, this.height) && this.vel.y > 0) this.vel.y = 0;

    const ground = w.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
    const snap = wasGrounded && this.vel.y <= 0 && this.pos.y - ground < 0.4;
    if (this.pos.y <= ground || snap) {
      if (!wasGrounded && this.vel.y < -7) {
        this.game.audio.land();
        this.game.particles.emit(this.pos, { count: 10, color: 0xd8c9a0, speed: 2, life: 0.45, size: 0.22, gravity: 1, up: 0.15 });
      }
      this.pos.y = ground; this.vel.y = 0; this.grounded = true; this.coyote = 0.12;
    } else {
      this.grounded = false; this.coyote -= dt;
    }

    // facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.5 && (mx || mz)) {
      const target = Math.atan2(mx, mz);
      let d = target - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, 12 * dt);
    }

    // timers
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.punchT > 0) {
      this.punchT -= dt;
      if (!this.punchHit && this.punchT < 0.38) { this.punchHit = true; this.game.onPunch(); }
    }
    this.crouchT += ((this.crouching ? 1 : 0) - this.crouchT) * Math.min(1, 14 * dt);

    // footsteps / water splashes
    if (this.grounded && hs > 1) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) {
        this.stepT = 2.4;
        if (wading) this.game.particles.emit(new THREE.Vector3(this.pos.x, WATER_LEVEL + 0.1, this.pos.z), { count: 8, color: 0xbfe9ff, speed: 2.2, life: 0.5, size: 0.18, gravity: 7, up: 0.7 });
        else if (running) this.game.particles.emit(this.pos, { count: 3, color: 0xcdbb95, speed: 0.8, life: 0.4, size: 0.18, gravity: 0.5, up: 0.3 });
      }
    }

    // animation state machine
    if (this.dead) this.play('Death', 0.1);
    else if (this.celebrating) this.play('Dance', 0.3);
    else if (this.punchT > 0) this.play('Punch', 0.08);
    else if (!this.grounded && (this.coyote <= 0)) this.play('Jump', 0.1);
    else if (hs > 6) this.play('Running', 0.15);
    else if (hs > 0.5) this.play('Walking', 0.15);
    else this.play('Idle', 0.2);
    if (this.current === 'Walking') this.actions.Walking.setEffectiveTimeScale(Math.max(0.6, hs / 3.4));
    if (this.current === 'Running') this.actions.Running.setEffectiveTimeScale(hs / 8.2);
    this.mixer.update(dt);
    this.sync();
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    const c = this.crouchT || 0;
    this.root.scale.set(1 + c * 0.1, 1 - c * 0.4, 1 + c * 0.1);
    this.root.visible = this.invuln <= 0 || this.dead || Math.floor(this.invuln * 14) % 2 === 0;
  }
}
