// World: terrain, vegetation, water, sky, lighting and static collision data.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WATER_LEVEL = -1.4;
export const WORLD_RADIUS = 96;

// Points of interest. Everything in the level is laid out around these.
export const POI = {
  spawn: { x: 0, z: 0 },
  portal: { x: 0, z: -22 },
  lake: { x: 40, z: -36 },
  skyPath: { x: -24, z: 26 },
  vaultCrouch: { x: -50, z: -8 },
  vaultJump: { x: 30, z: 48 },
  camp: { x: 64, z: 10 },
  ruins: { x: -12, z: -64 },
  hill: { x: -62, z: 46 },
};

// Flattened areas so structures sit on level ground.
const FLATS = [
  { x: POI.portal.x, z: POI.portal.z, h: 1.0, r0: 5, r1: 11 },
  { x: POI.vaultCrouch.x, z: POI.vaultCrouch.z, h: 0.8, r0: 8, r1: 15 },
  { x: POI.vaultJump.x, z: POI.vaultJump.z, h: 1.2, r0: 8, r1: 15 },
  { x: POI.camp.x, z: POI.camp.z, h: 1.5, r0: 8, r1: 16 },
  { x: POI.ruins.x, z: POI.ruins.z, h: 1.0, r0: 9, r1: 17 },
  { x: POI.hill.x, z: POI.hill.z, h: 6.5, r0: 5, r1: 20 },
  { x: POI.skyPath.x, z: POI.skyPath.z, h: 0.6, r0: 6, r1: 14 },
];

// ---------- deterministic noise ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(ix, iz) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  let amp = 0.5, f = 1, s = 0;
  for (let i = 0; i < 4; i++) { s += amp * vnoise(x * f, z * f); f *= 2; amp *= 0.5; }
  return s / 0.9375;
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.025 + 11.3, z * 0.025 + 4.7) - 0.45) * 13;
  h += (fbm(x * 0.11, z * 0.11) - 0.5) * 0.9;
  h = lerp(0.4, h, smoothstep(7, 20, r)); // level spawn meadow
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    h = lerp(f.h, h, smoothstep(f.r0, f.r1, d));
  }
  // lake basin with a small island in the middle
  const dl = Math.hypot(x - POI.lake.x, z - POI.lake.z);
  h = lerp(-2.25, h, smoothstep(9, 24, dl));
  h = lerp(0.5, h, smoothstep(2.5, 6.5, dl));
  h = Math.max(h, -2.3); // water is always wadeable
  h += smoothstep(82, 120, r) * 24; // surrounding mountains
  return h;
}

function paint(geo, color, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (Math.random() - 0.5) * jitter;
    for (let k = 0; k < 3; k++) {
      arr[(i + k) * 3] = c.r * j; arr[(i + k) * 3 + 1] = c.g * j; arr[(i + k) * 3 + 2] = c.b * j;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.circles = [];      // static cylinder colliders {x,z,r}
    this.dynCircles = [];   // owned by the level (pylons, chests...)
    this.canopies = [];     // tree crowns, only used to keep the camera out of foliage
    this.boxes = [];        // platforms {minX,maxX,minY,maxY,minZ,maxZ}
    this.rng = mulberry32(20241);
    this.uniforms = { uTime: { value: 0 } };
    this.group = new THREE.Group();
    scene.add(this.group);

    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildWater();
    this.buildIslands();
    this.buildRuins();
    this.buildTrees();
    this.buildRocks();
    this.buildGrass();
    this.buildClouds();
    this.buildFireflies();
  }

  // ---------- sky & light ----------
  buildSky() {
    this.sunDir = new THREE.Vector3(-0.55, 0.36, -0.75).normalize();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: this.sunDir } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 zenith = vec3(0.16, 0.33, 0.62);
          vec3 mid = vec3(0.50, 0.66, 0.86);
          vec3 horizon = vec3(1.0, 0.74, 0.50);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
          col = mix(col, zenith, smoothstep(0.15, 0.85, h));
          col = mix(col, vec3(0.80, 0.62, 0.46), smoothstep(0.0, -0.25, h));
          float sd = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.72, 0.42) * (pow(sd, 6.0) * 0.22 + pow(sd, 90.0) * 0.3);
          col += vec3(1.0, 0.9, 0.7) * smoothstep(0.9991, 0.9996, sd) * 2.2;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(0xe6bd96, 0.0062);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x5b5a3c, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffdcae, 3.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -38; c.right = 38; c.top = 38; c.bottom = -38; c.near = 1; c.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun, this.sun.target);
  }

  // ---------- terrain ----------
  buildTerrain() {
    const size = 300, seg = 220;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xd9c38a), grassA = new THREE.Color(0x4f8f3a), grassB = new THREE.Color(0x79a843),
      rock = new THREE.Color(0x7d7468), snow = new THREE.Color(0xe9e4dc), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = fbm(x * 0.08 + 3, z * 0.08 + 9);
      c.copy(grassA).lerp(grassB, n);
      c.lerp(sand, 1 - smoothstep(WATER_LEVEL + 0.15, WATER_LEVEL + 1.0, y));
      c.lerp(rock, smoothstep(0.86, 0.68, nor.getY(i)));
      c.lerp(rock, smoothstep(11, 17, y));
      c.lerp(snow, smoothstep(19, 24, y + n * 3));
      const shade = 0.92 + n * 0.16;
      col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(300, 300, 80, 80);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2f8fa3, roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.78,
    });
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.uniforms.uTime;
      s.vertexShader = 'uniform float uTime;\n' + s.vertexShader
        .replace('#include <beginnormal_vertex>', `
          float wx = cos(position.x * 0.55 + uTime * 1.3) * 0.06;
          float wz = cos(position.z * 0.45 + uTime * 1.1) * 0.06;
          vec3 objectNormal = normalize(vec3(-wx, 1.0, -wz));`)
        .replace('#include <begin_vertex>', `
          vec3 transformed = vec3(position);
          transformed.y += sin(position.x * 0.55 + uTime * 1.3) * 0.07 + sin(position.z * 0.45 + uTime * 1.1) * 0.07;`);
    };
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = WATER_LEVEL;
    this.water.receiveShadow = true;
    this.group.add(this.water);
  }

  // ---------- floating islands (jumping path) ----------
  addIsland(x, top, z, w, d) {
    const stone = this.stoneMat ||= new THREE.MeshStandardMaterial({ color: 0x8c8375, roughness: 0.9, flatShading: true });
    const moss = this.mossMat ||= new THREE.MeshStandardMaterial({ color: 0x5f9a3c, roughness: 1 });
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), stone);
    slab.position.y = -0.3;
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.14, d + 0.12), moss);
    lawn.position.y = -0.05;
    const root = new THREE.Mesh(new THREE.ConeGeometry(Math.min(w, d) * 0.62, 2.4, 6), stone);
    root.rotation.x = Math.PI; root.position.y = -1.8;
    g.add(slab, lawn, root);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.position.set(x, top, z);
    this.group.add(g);
    this.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minY: top - 0.6, maxY: top + 0.02, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  buildIslands() {
    const { x, z } = POI.skyPath;
    const base = terrainHeight(x, z);
    this.skySteps = [];
    const steps = [[0, 0, 1.1, 3.2], [4.6, 1.5, 2.2, 3], [8.8, 4.6, 3.3, 3], [9.6, 9.4, 4.4, 3], [6.2, 13.2, 5.5, 3], [1.2, 15.4, 6.6, 5.2]];
    for (const [dx, dz, dy, s] of steps) {
      this.addIsland(x + dx, base + dy, z + dz, s, s);
      this.skySteps.push(new THREE.Vector3(x + dx, base + dy, z + dz));
    }
  }

  // ---------- ruins ----------
  buildRuins() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xa39a8a, roughness: 0.85, flatShading: true });
    const pillarGeo = new THREE.CylinderGeometry(0.55, 0.65, 1, 8);
    const capGeo = new THREE.BoxGeometry(1.6, 0.35, 1.6);
    const addPillar = (x, z, h, tilt = 0) => {
      const y = terrainHeight(x, z);
      const p = new THREE.Mesh(pillarGeo, mat);
      p.scale.y = h; p.position.set(x, y + h / 2 - 0.1, z); p.rotation.z = tilt;
      const cap = new THREE.Mesh(capGeo, mat);
      cap.position.set(x + Math.sin(-tilt) * h, y + h, z); cap.rotation.z = tilt;
      const base = new THREE.Mesh(capGeo, mat);
      base.position.set(x, y + 0.1, z);
      for (const m of [p, cap, base]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
      this.circles.push({ x, z, r: 0.85 });
    };
    // ring of pillars at the ruins and around the portal
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      addPillar(POI.ruins.x + Math.cos(a) * 8, POI.ruins.z + Math.sin(a) * 8, 2.2 + ((i * 7) % 5) * 0.7, 0);
    }
    for (const s of [-1, 1]) {
      addPillar(POI.portal.x + s * 5.2, POI.portal.z + 2.5, 4.2);
      addPillar(POI.portal.x + s * 6.4, POI.portal.z - 3, 2.6);
    }
    // walkable steps of the portal dais (the meshes are built by the level)
    const py = terrainHeight(POI.portal.x, POI.portal.z);
    for (const [half, top] of [[3.3, 0.2], [2.6, 0.45]]) {
      this.boxes.push({ minX: POI.portal.x - half, maxX: POI.portal.x + half, minY: py - 1, maxY: py + top, minZ: POI.portal.z - half, maxZ: POI.portal.z + half });
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      addPillar(POI.camp.x + Math.cos(a) * 9.5, POI.camp.z + Math.sin(a) * 9.5, 1.8 + (i % 3) * 0.9);
    }
  }

  nearPOI(x, z, margin) {
    for (const k in POI) {
      const p = POI[k];
      const m = k === 'lake' ? 7 : k === 'skyPath' ? 20 : margin;
      if (Math.hypot(x - p.x, z - p.z) < m) return true;
    }
    return false;
  }

  // ---------- vegetation ----------
  buildTrees() {
    const pine = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.16, 0.3, 1.8, 6).translate(0, 0.9, 0), 0x6b4a2e, 0.15),
      paint(new THREE.ConeGeometry(1.55, 2.3, 7).translate(0, 2.5, 0), 0x2f6b35, 0.22),
      paint(new THREE.ConeGeometry(1.2, 2.0, 7).translate(0, 3.7, 0), 0x3a7d3c, 0.22),
      paint(new THREE.ConeGeometry(0.78, 1.7, 7).translate(0, 4.8, 0), 0x4a9145, 0.22),
    ]);
    const oak = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.22, 0.36, 2.2, 6).translate(0, 1.1, 0), 0x70502f, 0.15),
      paint(new THREE.IcosahedronGeometry(1.5, 1).translate(0, 3.2, 0), 0x5c9c3b, 0.25),
      paint(new THREE.IcosahedronGeometry(1.05, 1).translate(1.0, 2.7, 0.3), 0x6aa842, 0.25),
      paint(new THREE.IcosahedronGeometry(1.0, 1).translate(-0.9, 2.9, -0.4), 0x4f8f38, 0.25),
      paint(new THREE.IcosahedronGeometry(0.9, 1).translate(0.1, 4.2, 0.2), 0x79b24a, 0.25),
    ]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const lists = [[], []];
    const rng = this.rng;
    let guard = 0;
    while (lists[0].length + lists[1].length < 300 && guard++ < 6000) {
      const a = rng() * Math.PI * 2, r = 9 + Math.sqrt(rng()) * 104;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = terrainHeight(x, z);
      if (y < WATER_LEVEL + 0.5 || y > 17 || this.nearPOI(x, z, 12)) continue;
      // keep clearings: forests grow in noise-defined patches
      if (fbm(x * 0.03 + 40, z * 0.03 + 40) < 0.47 && r < 92) continue;
      const type = fbm(x * 0.02 + 90, z * 0.02) > 0.5 ? 0 : 1;
      const s = 0.85 + rng() * 0.9;
      lists[type].push({ x, y, z, s, rot: rng() * Math.PI * 2, tint: 0.82 + rng() * 0.3 });
      this.circles.push({ x, z, r: 0.42 * s });
      this.canopies.push({ x, z, r: 1.15 * s, y0: y + 1.3 * s, y1: y + 5.6 * s });
    }
    const dummy = new THREE.Object3D(), c = new THREE.Color();
    [pine, oak].forEach((geo, t) => {
      const mesh = new THREE.InstancedMesh(geo, mat, lists[t].length);
      lists[t].forEach((o, i) => {
        dummy.position.set(o.x, o.y - 0.15, o.z); dummy.rotation.set(0, o.rot, 0); dummy.scale.setScalar(o.s);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, c.setRGB(o.tint, o.tint * (0.95 + (i % 5) * 0.025), o.tint * 0.9));
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
    });
  }

  buildRocks() {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9, flatShading: true });
    const rng = this.rng, items = [];
    let guard = 0;
    while (items.length < 70 && guard++ < 3000) {
      const a = rng() * Math.PI * 2, r = 10 + Math.sqrt(rng()) * 92;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = terrainHeight(x, z);
      if (y < WATER_LEVEL - 0.3 || this.nearPOI(x, z, 10)) continue;
      const s = 0.6 + rng() * rng() * 2.2;
      items.push({ x, y, z, s, rx: rng() * 3, ry: rng() * 6 });
      this.circles.push({ x, z, r: s * 0.95 });
    }
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const dummy = new THREE.Object3D(), c = new THREE.Color();
    items.forEach((o, i) => {
      dummy.position.set(o.x, o.y + o.s * 0.15, o.z); dummy.rotation.set(o.rx, o.ry, 0);
      dummy.scale.set(o.s * 1.15, o.s * 0.8, o.s); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      const t = 0.8 + (i % 7) * 0.05; mesh.setColorAt(i, c.setRGB(t, t, t * 0.97));
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildGrass() {
    const H = 0.75;
    const geo = new THREE.PlaneGeometry(0.13, H, 1, 3);
    geo.translate(0, H / 2, 0);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    const a = new THREE.Color(0x356f2c), b = new THREE.Color(0xa8cf5a), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / H;
      p.setX(i, p.getX(i) * (1 - t * 0.85));
      c.copy(a).lerp(b, t); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      geo.attributes.normal.setXYZ(i, 0, 1, 0);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.uniforms.uTime;
      s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
        float bend = uv.y * uv.y;
        transformed.x += (sin(uTime * 1.7 + ph) * 0.16 + sin(uTime * 3.1 + ph * 1.7) * 0.05) * bend;
        transformed.z += cos(uTime * 1.3 + ph * 0.8) * 0.1 * bend;`);
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
    };
    const MAX = 42000;
    const mesh = new THREE.InstancedMesh(geo, mat, MAX);
    const dummy = new THREE.Object3D(), rng = this.rng;
    let n = 0, guard = 0;
    while (n < MAX && guard++ < MAX * 4) {
      const ang = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 98;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r, y = terrainHeight(x, z);
      if (y < WATER_LEVEL + 0.6 || y > 13) continue;
      if (fbm(x * 0.06 + 70, z * 0.06 + 20) < 0.36) continue;
      if (Math.hypot(x - POI.portal.x, z - POI.portal.z) < 4.9) continue; // keep the portal dais clear
      dummy.position.set(x, y - 0.03, z); dummy.rotation.set(0, rng() * Math.PI, 0);
      const s = 0.6 + rng() * 1.0; dummy.scale.set(s, s * (0.7 + rng() * 0.7), s);
      dummy.updateMatrix(); mesh.setMatrixAt(n++, dummy.matrix);
    }
    this.grassTotal = n;
    mesh.count = n;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.grass = mesh;
    this.group.add(mesh);
  }

  buildClouds() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, fog: false, emissive: 0xfff0e2, emissiveIntensity: 0.78 });
    this.clouds = [];
    const rng = this.rng;
    for (let i = 0; i < 16; i++) {
      const parts = [];
      const n = 4 + Math.floor(rng() * 4);
      for (let j = 0; j < n; j++) {
        const s = 6 + rng() * 8;
        parts.push(new THREE.IcosahedronGeometry(1, 1).scale(s * 1.6, s * 0.5, s * 1.1).translate((j - n / 2) * 9 + rng() * 4, rng() * 2, rng() * 8 - 4));
      }
      const m = new THREE.Mesh(mergeGeometries(parts), mat);
      m.position.set(rng() * 560 - 280, 85 + rng() * 45, rng() * 560 - 280);
      m.userData.speed = 0.8 + rng() * 1.4;
      this.clouds.push(m); this.scene.add(m);
    }
  }

  buildFireflies() {
    const N = 320, pos = new Float32Array(N * 3), seed = new Float32Array(N), rng = this.rng;
    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 95;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos[i * 3] = x; pos[i * 3 + 1] = Math.max(terrainHeight(x, z), WATER_LEVEL) + 0.5 + rng() * 2.6; pos[i * 3 + 2] = z;
      seed[i] = rng() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.uniforms.uTime, uScale: { value: 1 } },
      vertexShader: `
        uniform float uTime; uniform float uScale; attribute float aSeed; varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime * 0.6 + aSeed) * 1.2; p.y += sin(uTime * 0.9 + aSeed * 2.0) * 0.5; p.z += cos(uTime * 0.5 + aSeed * 1.3) * 1.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = 0.45 + 0.55 * sin(uTime * 2.2 + aSeed * 5.0);
          gl_PointSize = uScale * 70.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.45) * 2.2, a * a * vA);
        }`,
    });
    this.fireflies = new THREE.Points(geo, mat);
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
  }

  /** True when a camera position would be buried in terrain, water or a tree crown. */
  blocksCamera(x, y, z) {
    if (y < Math.max(terrainHeight(x, z), WATER_LEVEL) + 0.35) return true;
    for (const c of this.canopies) {
      const dx = x - c.x, dz = z - c.z;
      if (y > c.y0 && y < c.y1 && dx * dx + dz * dz < c.r * c.r) return true;
    }
    return false;
  }

  setGrassDensity(f) { this.grass.count = Math.floor(this.grassTotal * f); this.grass.visible = f > 0; }

  // ---------- collision queries ----------
  groundAt(x, z, feetY) {
    let g = terrainHeight(x, z);
    for (const b of this.boxes) {
      if (x >= b.minX - 0.25 && x <= b.maxX + 0.25 && z >= b.minZ - 0.25 && z <= b.maxZ + 0.25 &&
        b.maxY <= feetY + 0.45 && b.maxY > g) g = b.maxY;
    }
    return g;
  }

  /** Pushes a vertical capsule out of static geometry. Mutates pos. Returns true when a ceiling was hit. */
  resolve(pos, radius, height) {
    const push = (list) => {
      for (const c of list) {
        const dx = pos.x - c.x, dz = pos.z - c.z, min = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-8) {
          const d = Math.sqrt(d2), k = (min - d) / d;
          pos.x += dx * k; pos.z += dz * k;
        }
      }
    };
    push(this.circles); push(this.dynCircles);
    let bumped = false;
    for (const b of this.boxes) {
      if (pos.y >= b.maxY - 0.4 || pos.y + height <= b.minY) continue;
      const ox = Math.min(pos.x + radius - b.minX, b.maxX - (pos.x - radius));
      const oz = Math.min(pos.z + radius - b.minZ, b.maxZ - (pos.z - radius));
      if (ox <= 0 || oz <= 0) continue;
      // jumping up into the underside of a platform
      if (pos.y + height - b.minY < 0.35 && ox > radius && oz > radius) { pos.y = b.minY - height; bumped = true; continue; }
      if (ox < oz) pos.x += pos.x < (b.minX + b.maxX) / 2 ? -ox : ox;
      else pos.z += pos.z < (b.minZ + b.maxZ) / 2 ? -oz : oz;
    }
    const r = Math.hypot(pos.x, pos.z);
    if (r > WORLD_RADIUS) { pos.x *= WORLD_RADIUS / r; pos.z *= WORLD_RADIUS / r; }
    return bumped;
  }

  update(dt, time, focus, camera) {
    this.uniforms.uTime.value = time;
    this.sky.position.copy(camera.position);
    // shadow frustum follows the player, snapped to texels to avoid shimmering
    const snap = 76 / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(this.sunDir, 110);
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 290) c.position.x = -290;
    }
  }
}
