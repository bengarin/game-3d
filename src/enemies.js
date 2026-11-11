// Sentinels: hovering guardian drones that patrol, spot the player and give chase.
import * as THREE from 'three';
import { terrainHeight, WATER_LEVEL, POI } from './world.js';

const SPAWNS = [
  [POI.camp.x - 3, POI.camp.z + 2], [POI.camp.x + 4, POI.camp.z - 3], [POI.camp.x, POI.camp.z + 5],
  [POI.ruins.x + 4, POI.ruins.z + 1], [POI.ruins.x - 4, POI.ruins.z - 2],
  [POI.hill.x + 2, POI.hill.z - 3],
  [-30, -34], [26, 18], [-34, 4], [12, 62], [58, -22], [-58, 22],
];

let sharedGeo = null;
function geo() {
  return sharedGeo ||= {
    body: new THREE.IcosahedronGeometry(0.55, 0),
    eye: new THREE.SphereGeometry(0.2, 16, 12),
    blade: new THREE.ConeGeometry(0.13, 0.55, 4),
    ring: new THREE.TorusGeometry(0.78, 0.035, 6, 28),
    glow: new THREE.CircleGeometry(0.7, 20),
  };
}

class Sentinel {
  constructor(scene, x, z, index) {
    const g = geo();
    this.home = new THREE.Vector2(x, z);
    this.pos = new THREE.Vector3(x, 0, z);
    this.knock = new THREE.Vector2();
    this.way = new THREE.Vector2(x, z);
    this.state = 'patrol'; this.hp = 2; this.dead = false; this.dying = 0;
    this.phase = index * 1.7; this.flash = 0; this.cooldown = 0; this.heading = 0; this.wait = 0;

    this.group = new THREE.Group();
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3d, roughness: 0.35, metalness: 0.8, flatShading: true, emissive: 0xff2200, emissiveIntensity: 0 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff5a1f, emissiveIntensity: 2.2 });
    const body = new THREE.Mesh(g.body, this.bodyMat);
    const eye = new THREE.Mesh(g.eye, this.eyeMat);
    eye.position.set(0, 0.05, 0.46);
    this.spin = new THREE.Group();
    const ring = new THREE.Mesh(g.ring, this.eyeMat); ring.rotation.x = Math.PI / 2;
    this.spin.add(ring);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(g.blade, this.bodyMat);
      const a = (i / 4) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82);
      b.rotation.z = -Math.PI / 2; b.rotation.y = -a;
      this.spin.add(b);
    }
    this.shadowGlow = new THREE.Mesh(g.glow, new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.shadowGlow.rotation.x = -Math.PI / 2;
    this.group.add(body, eye, this.spin);
    this.group.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    scene.add(this.group, this.shadowGlow);
    this.scene = scene;
    this.place(0);
  }

  floor() { return Math.max(terrainHeight(this.pos.x, this.pos.z), WATER_LEVEL); }
  place(t) {
    const f = this.floor();
    this.pos.y = f + 1.25 + Math.sin(t * 2.2 + this.phase) * 0.18;
    this.group.position.copy(this.pos);
    this.shadowGlow.position.set(this.pos.x, f + 0.06, this.pos.z);
  }

  hurt(from, game) {
    if (this.dead) return;
    this.hp--; this.flash = 0.25;
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    this.knock.set((dx / d) * 9, (dz / d) * 9);
    this.cooldown = 0; // stagger: it comes straight back instead of retreating
    this.state = 'chase';
    game.particles.emit(this.pos, { count: 14, color: 0xffa040, speed: 4, life: 0.45, size: 0.22 });
    if (this.hp <= 0) this.kill(game); else game.audio.hit();
  }

  kill(game) {
    if (this.dead) return;
    this.dead = true; this.dying = 0.35;
    game.audio.enemyDie();
    game.particles.emit(this.pos, { count: 46, color: 0xff7a2a, speed: 6.5, life: 0.9, size: 0.34, gravity: 5 });
    game.particles.emit(this.pos, { count: 18, color: 0xfff2c0, speed: 3, life: 0.6, size: 0.5, gravity: 0 });
    game.onEnemyKilled(this);
  }

  update(dt, t, player, world, game) {
    if (this.dead) {
      if (this.dying > 0) {
        this.dying -= dt;
        const s = Math.max(0.001, this.dying / 0.35);
        this.group.scale.setScalar(s); this.spin.rotation.y += dt * 30;
        if (this.dying <= 0) { this.group.visible = false; this.shadowGlow.visible = false; }
      }
      return;
    }
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const sight = player.crouching ? 5.5 : 15;
    const canSee = !player.dead && !player.celebrating && dist < sight && Math.abs(player.pos.y - this.pos.y) < 7;
    this.cooldown = Math.max(0, this.cooldown - dt);

    let tx = this.way.x, tz = this.way.y, speed = 2.4;
    if (this.state === 'patrol') {
      if (canSee) { this.state = 'chase'; game.audio.alert(); game.particles.emit(this.pos, { count: 8, color: 0xff4020, speed: 2, life: 0.4, size: 0.2, up: 1 }); }
      this.wait -= dt;
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 0.8 || this.wait < -9) {
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 7;
        this.way.set(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
        this.wait = 0.8 + Math.random() * 1.6;
      }
      if (this.wait > 0) speed = 0;
    } else {
      tx = player.pos.x; tz = player.pos.z; speed = this.cooldown > 0 ? -2.5 : 5.7;
      const far = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.y);
      if (player.dead || player.celebrating || dist > 26 || far > 42 || (player.crouching && dist > 9)) {
        this.state = 'patrol'; this.way.copy(this.home); this.wait = 0;
      }
    }
    const mx = tx - this.pos.x, mz = tz - this.pos.z, ml = Math.hypot(mx, mz) || 1;
    this.pos.x += ((mx / ml) * speed + this.knock.x) * dt;
    this.pos.z += ((mz / ml) * speed + this.knock.y) * dt;
    this.knock.multiplyScalar(Math.max(0, 1 - 5 * dt));
    // slide around trees / rocks
    const y = this.pos.y; world.resolve(this.pos, 0.6, 1); this.pos.y = y;
    this.place(t);

    if (speed !== 0) {
      const target = Math.atan2(mx, mz);
      let d = target - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, 6 * dt);
    }
    this.group.rotation.y = this.heading;
    this.group.rotation.x = this.state === 'chase' ? 0.25 : 0;
    this.spin.rotation.y += dt * (this.state === 'chase' ? 9 : 2.5);
    this.flash = Math.max(0, this.flash - dt);
    this.bodyMat.emissiveIntensity = this.flash * 12;
    this.eyeMat.emissiveIntensity = this.state === 'chase' ? 4.5 + Math.sin(t * 14) * 1.5 : 1.8;

    // contact with the player
    const feet = player.pos.y, top = feet + player.height;
    if (dist < 1.15 && feet < this.pos.y + 0.95 && top > this.pos.y - 0.7 && !player.dead && !player.celebrating) {
      if (player.vel.y < -1.5 && feet > this.pos.y + 0.05) {
        player.vel.y = 8.5; // stomp bounce
        this.kill(game);
      } else if (this.cooldown <= 0) {
        if (player.takeDamage(15, this.pos, 8)) game.particles.emit(player.pos.clone().setY(feet + 1), { count: 16, color: 0xff3020, speed: 4, life: 0.5, size: 0.25 });
        this.cooldown = 0.9;
      }
    }
  }

  dispose() { this.scene.remove(this.group, this.shadowGlow); }
}

export class Enemies {
  constructor(scene, world) {
    this.world = world;
    this.list = SPAWNS.map(([x, z], i) => new Sentinel(scene, x, z, i));
  }
  update(dt, t, player, game) { for (const e of this.list) e.update(dt, t, player, this.world, game); }
  /** Punch: damages sentinels in a cone in front of the player. */
  punch(player, game) {
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    let any = false;
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.6 && Math.abs(e.pos.y - player.pos.y - 1) < 2 && (d < 0.8 || (dx * fx + dz * fz) / d > 0.25)) { e.hurt(player.pos, game); any = true; }
    }
    return any;
  }
  get alive() { return this.list.filter((e) => !e.dead).length; }
  dispose() { this.list.forEach((e) => e.dispose()); }
}
