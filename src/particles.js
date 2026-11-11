// Pooled GPU point-sprite particle system (additive glow).
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 2400) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.grav = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.baseCol = new Float32Array(max * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1 } },
      vertexShader: `
        uniform float uScale; attribute vec4 aColor; attribute float aSize; varying vec4 vColor;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale * 420.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor.rgb, vColor.a * a);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  /**
   * @param {THREE.Vector3} p origin
   * @param {object} o count, color, speed, life, size, gravity, spread (origin jitter), up (upward bias)
   */
  emit(p, o = {}) {
    const { count = 12, color = 0xffffff, speed = 3, life = 0.8, size = 0.25, gravity = 6, spread = 0.2, up = 0.5, dir = null } = o;
    const c = this._c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.35 + Math.random() * 0.65);
      let vx = Math.sin(ph) * Math.cos(th) * sp, vy = Math.cos(ph) * sp + up * speed, vz = Math.sin(ph) * Math.sin(th) * sp;
      if (dir) { vx = vx * 0.4 + dir.x * sp; vy = vy * 0.4 + dir.y * sp; vz = vz * 0.4 + dir.z * sp; }
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * spread * 2;
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread * 2;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread * 2;
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      const l = life * (0.6 + Math.random() * 0.6);
      this.life[i] = l; this.maxLife[i] = l; this.grav[i] = gravity;
      this.baseSize[i] = size * (0.6 + Math.random() * 0.8);
      this.baseCol[i * 3] = c.r; this.baseCol[i * 3 + 1] = c.g; this.baseCol[i * 3 + 2] = c.b;
    }
  }

  update(dt) {
    const { pos, vel, life, maxLife, grav, col, size, baseSize, baseCol } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (size[i] !== 0) size[i] = 0; continue; }
      life[i] -= dt;
      vel[i * 3 + 1] -= grav[i] * dt;
      const drag = 1 - 1.4 * dt;
      vel[i * 3] *= drag; vel[i * 3 + 2] *= drag;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = Math.max(0, life[i] / maxLife[i]);
      size[i] = baseSize[i] * (0.4 + 0.6 * t);
      col[i * 4] = baseCol[i * 3] * 2; col[i * 4 + 1] = baseCol[i * 3 + 1] * 2; col[i * 4 + 2] = baseCol[i * 3 + 2] * 2;
      col[i * 4 + 3] = t;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}
