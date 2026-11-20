import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/* camera travels u ∈ [0, U_END]; the core sits at u = 1 */
const U_END = 0.93;
const uOf = (p) => p * U_END;

const C = {
  bg: new THREE.Color('#05060d'),
  violet: new THREE.Color('#7c5cff'),
  cyan: new THREE.Color('#3de0ff'),
  pink: new THREE.Color('#ff4fd8'),
  white: new THREE.Color('#ffffff'),
};
const hdr = (c, k) => c.clone().multiplyScalar(k);

/* ---------- GLSL ---------- */
const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

function blobMaterial(a, b, c) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uAmp: { value: 0.45 }, uFreq: { value: 0.42 },
      uA: { value: a }, uB: { value: b }, uC: { value: c }, uGlow: { value: 1.6 },
    },
    vertexShader: /* glsl */`
      uniform float uTime, uAmp, uFreq;
      varying vec3 vNormal; varying vec3 vView; varying float vN;
      ${NOISE}
      float disp(vec3 p){
        return (snoise(p*uFreq + vec3(uTime*.22, uTime*.17, 0.)) + .35*snoise(p*uFreq*2.4 - uTime*.28)) * uAmp;
      }
      vec3 orth(vec3 v){ return abs(v.x) > abs(v.z) ? vec3(-v.y, v.x, 0.) : vec3(0., -v.z, v.y); }
      void main(){
        vec3 n = normalize(normal);
        vec3 t = normalize(orth(n));
        vec3 b = normalize(cross(n, t));
        float e = .02;
        float d0 = disp(position);
        vec3 p0 = position + n*d0;
        vec3 p1 = position + t*e; p1 += n*disp(p1);
        vec3 p2 = position + b*e; p2 += n*disp(p2);
        vec3 nn = normalize(cross(p1 - p0, p2 - p0));
        vN = d0 / max(uAmp, .001);
        vec4 wp = modelMatrix * vec4(p0, 1.);
        vNormal = normalize(mat3(modelMatrix) * nn);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uA, uB, uC; uniform float uTime, uGlow;
      varying vec3 vNormal; varying vec3 vView; varying float vN;
      void main(){
        vec3 n = normalize(vNormal); vec3 v = normalize(vView);
        float fr = pow(1. - max(dot(n, v), 0.), 2.4);
        float band = .5 + .5*sin(vN*5.5 + uTime*.7);
        vec3 base = mix(uA, uB, band);
        base = mix(base, uC, smoothstep(.1, 1.2, vN)*.7);
        vec3 L = normalize(vec3(.4, .85, .5));
        float diff = max(dot(n, L), 0.);
        float spec = pow(max(dot(reflect(-L, n), v), 0.), 40.);
        vec3 col = base*(.08 + .5*diff) + spec*.9 + fr*mix(uB, uC, band)*uGlow;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
}

function nebulaMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uBg: { value: C.bg }, uV: { value: C.violet }, uC: { value: C.cyan }, uP: { value: C.pink } },
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uBg, uV, uC, uP; varying vec3 vDir;
      ${NOISE}
      float fbm(vec3 p){ float f = 0., a = .5; for(int i = 0; i < 4; i++){ f += a*snoise(p); p *= 2.03; a *= .5; } return f; }
      void main(){
        vec3 d = normalize(vDir);
        float n1 = fbm(d*1.6 + vec3(0., 0., uTime*.01));
        float n2 = fbm(d*2.4 + 7.3);
        vec3 col = uBg;
        col += uV * smoothstep(.0, .75, n1) * .16;
        col += uC * smoothstep(.15, .85, n2) * .07;
        col += uP * smoothstep(.45, .95, n1*n2*2.) * .06;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
}

function spriteTexture() {
  const s = 64, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeLabel(container, cls, num, title, sub) {
  const el = document.createElement('div');
  el.className = `label ${cls}`;
  el.innerHTML = `<span class="label-num">${num}</span><span class="label-title">${title}</span>${sub ? `<span class="label-sub">${sub}</span>` : ''}`;
  container.appendChild(el);
  return el;
}

/* =================================================================== */
export async function createWorld({ canvas, labels, projects, mobile, reduced, onProgress, onReady }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  const DPR = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = C.bg;
  scene.fog = new THREE.FogExp2(C.bg, 0.011);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const portrait = () => innerWidth / innerHeight < 0.9;
  const baseFov = () => (portrait() ? 72 : 52);
  const camera = new THREE.PerspectiveCamera(baseFov(), innerWidth / innerHeight, 0.1, 900);

  /* ---------- Path ---------- */
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 40),
    new THREE.Vector3(1, 0.4, 12),
    new THREE.Vector3(-3, 1, -22),
    new THREE.Vector3(5, -1, -62),
    new THREE.Vector3(-5, 1.6, -108),
    new THREE.Vector3(4, -0.6, -155),
    new THREE.Vector3(-4, 1, -202),
    new THREE.Vector3(2, 0, -248),
    new THREE.Vector3(0, 0, -292),
    new THREE.Vector3(0, 0, -330),
  ], false, 'centripetal');
  curve.arcLengthDivisions = 2000;
  const L = curve.getLength();

  const UP = new THREE.Vector3(0, 1, 0);
  function frameAt(u) {
    const pos = curve.getPointAt(clamp(u));
    const tan = curve.getTangentAt(clamp(u)).normalize();
    const side = new THREE.Vector3().crossVectors(tan, UP).normalize();
    const up = new THREE.Vector3().crossVectors(side, tan).normalize();
    return { pos, tan, side, up };
  }

  const updaters = [];
  const labelItems = [];

  /* ---------- Sky ---------- */
  const nebula = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 32), nebulaMaterial());
  nebula.renderOrder = -1;
  scene.add(nebula);
  updaters.push((t) => { nebula.position.copy(camera.position); nebula.material.uniforms.uTime.value = t; });

  const sprite = spriteTexture();
  {
    const N = mobile ? 1600 : 3600;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const pal = [C.white, C.white, C.violet, C.cyan, C.pink];
    for (let i = 0; i < N; i++) {
      const r = 120 + Math.random() * 260, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.7;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 150;
      const c = pal[(Math.random() * pal.length) | 0].clone().multiplyScalar(0.6 + Math.random() * 0.9);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    scene.add(stars);
    updaters.push((t) => { stars.rotation.z = t * 0.004; });
  }

  /* dust along the path */
  {
    const N = mobile ? 900 : 2200;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const f = frameAt(Math.random());
      const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 18;
      const p = f.pos.addScaledVector(f.side, Math.cos(a) * r).addScaledVector(f.up, Math.sin(a) * r * 0.7);
      pos.set([p.x, p.y, p.z], i * 3);
      const c = (Math.random() < 0.5 ? C.violet : C.cyan).clone().lerp(C.white, Math.random() * 0.5).multiplyScalar(0.5 + Math.random());
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.18, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  }

  /* ---------- Lights ---------- */
  scene.add(new THREE.AmbientLight(0x6a6aff, 0.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 10, 6);
  scene.add(key);

  /* ---------- 00 Hero blob ---------- */
  const detail = mobile ? 48 : 96;
  {
    const f = frameAt(uOf(0.055));
    const offset = portrait() ? f.up.clone().multiplyScalar(6.4) : f.side.clone().multiplyScalar(6.2).addScaledVector(f.up, 0.6);
    const group = new THREE.Group();
    group.position.copy(f.pos).add(offset);
    const mat = blobMaterial(hdr(C.violet, 0.9), hdr(C.cyan, 1.0), hdr(C.pink, 1.1));
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, detail), mat);
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(4.4, 2), new THREE.MeshBasicMaterial({ color: hdr(C.cyan, 1.2), wireframe: true, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.018, 8, 200), new THREE.MeshBasicMaterial({ color: hdr(C.violet, 2.4) }));
    orbit.rotation.x = Math.PI / 2.3;
    const orbit2 = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.012, 8, 200), new THREE.MeshBasicMaterial({ color: hdr(C.cyan, 2.0) }));
    orbit2.rotation.set(Math.PI / 1.7, 0.4, 0);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), new THREE.MeshBasicMaterial({ color: hdr(C.cyan, 4) }));
    group.add(blob, shell, orbit, orbit2, moon);
    scene.add(group);
    const pl = new THREE.PointLight(C.violet, 60, 30, 2); pl.position.copy(group.position); scene.add(pl);
    updaters.push((t, s) => {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uAmp.value = lerp(mat.uniforms.uAmp.value, 0.42 + Math.min(Math.abs(s.vel) * 6, 0.9), 0.08);
      blob.rotation.y = t * 0.12 + s.smx * 0.4;
      blob.rotation.x = s.smy * 0.3;
      shell.rotation.y = -t * 0.07; shell.rotation.z = t * 0.05;
      orbit.rotation.z = t * 0.25;
      orbit2.rotation.z = -t * 0.18;
      moon.position.set(Math.cos(t * 0.8) * 5.4, Math.sin(t * 0.8) * 5.4 * Math.cos(Math.PI / 2.3), Math.sin(t * 0.8) * 5.4 * Math.sin(Math.PI / 2.3) * -1);
      group.position.y += Math.sin(t * 0.8) * 0.003;
    });
  }

  /* ---------- 01 Ring gates ---------- */
  {
    const gates = [];
    const n = 8;
    const ticksPer = 40;
    const tickGeo = new THREE.BoxGeometry(0.05, 0.36, 0.05);
    const ticks = new THREE.InstancedMesh(tickGeo, new THREE.MeshBasicMaterial({ color: hdr(C.white, 1.4), transparent: true, opacity: 0.55 }), n * ticksPer);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), tmp = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const u = uOf(0.13 + (i / (n - 1)) * 0.17);
      const f = frameAt(u);
      const k = i / (n - 1);
      const color = C.violet.clone().lerp(C.cyan, k);
      const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 2.2), transparent: true });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.045, 10, 160), mat);
      ring.position.copy(f.pos);
      ring.lookAt(f.pos.clone().add(f.tan));
      scene.add(ring);
      gates.push({ ring, mat, color, pos: f.pos.clone(), spin: (i % 2 ? 1 : -1) * (0.2 + Math.random() * 0.2) });
      tmp.position.copy(f.pos); tmp.lookAt(f.pos.clone().add(f.tan)); tmp.updateMatrix();
      for (let j = 0; j < ticksPer; j++) {
        const a = (j / ticksPer) * Math.PI * 2;
        const local = new THREE.Vector3(Math.cos(a) * 5.15, Math.sin(a) * 5.15, 0);
        q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
        sc.set(1, j % 5 === 0 ? 2.2 : 1, 1);
        m.compose(local, q, sc).premultiply(tmp.matrix);
        ticks.setMatrixAt(i * ticksPer + j, m);
      }
    }
    scene.add(ticks);
    updaters.push((t) => {
      for (const g of gates) {
        const d = g.pos.distanceTo(camera.position);
        const near = 1 - smooth(6, 30, d);
        g.ring.rotation.z = t * g.spin;
        const s = 1 + near * 0.12;
        g.ring.scale.set(s, s, s);
        g.mat.color.copy(g.color).multiplyScalar(1.25 + near * 1.4);
      }
    });
  }

  /* ---------- 02 Services ---------- */
  {
    const services = [
      { num: '02.1', title: 'Marketing websites', sub: 'Landing · Multi-page · SEO' },
      { num: '02.2', title: '3D & WebGL', sub: 'Three.js · Shaders · Scenes' },
      { num: '02.3', title: 'E-commerce', sub: 'Catalog · Cart · Checkout' },
      { num: '02.4', title: 'Web apps', sub: 'Dashboards · Booking · Portals' },
    ];
    const builders = [
      () => { // torus knot
        const g = new THREE.Group();
        const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.25, 0.4, mobile ? 160 : 260, 36), new THREE.MeshPhysicalMaterial({ color: 0x9d86ff, metalness: 0.55, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 1, iridescenceIOR: 1.7, envMapIntensity: 1.4 }));
        g.add(knot);
        return { g, tick: (t) => { knot.rotation.x = t * 0.35; knot.rotation.y = t * 0.5; } };
      },
      () => { // crystal
        const g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 0), new THREE.MeshPhysicalMaterial({ color: 0x3de0ff, metalness: 0.1, roughness: 0.05, clearcoat: 1, flatShading: true, emissive: 0x0b5a70, emissiveIntensity: 0.6, envMapIntensity: 1.6 }));
        const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 1), new THREE.MeshBasicMaterial({ color: hdr(C.cyan, 2.2), wireframe: true, transparent: true, opacity: 0.5 }));
        const nodes = new THREE.Points(new THREE.IcosahedronGeometry(2.3, 1), new THREE.PointsMaterial({ size: 0.22, map: sprite, color: hdr(C.white, 3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        g.add(core, cage, nodes);
        return { g, tick: (t) => { core.rotation.y = t * 0.8; core.rotation.x = Math.sin(t * 0.6) * 0.4; cage.rotation.y = nodes.rotation.y = -t * 0.25; cage.rotation.z = nodes.rotation.z = t * 0.15; } };
      },
      () => { // cube stack
        const g = new THREE.Group();
        const geo = new RoundedBoxGeometry(1.3, 1.3, 1.3, 4, 0.18);
        const mats = [0xff4fd8, 0x7c5cff, 0xe9e8ff].map((c) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.3, roughness: 0.18, clearcoat: 1, envMapIntensity: 1.2 }));
        const cubes = mats.map((mt, i) => { const c = new THREE.Mesh(geo, mt); c.position.y = (i - 1) * 1.45; g.add(c); return c; });
        return { g, tick: (t) => { cubes.forEach((c, i) => { c.rotation.y = t * (0.4 + i * 0.25) * (i % 2 ? -1 : 1); c.position.x = Math.sin(t * 1.2 + i) * 0.18; }); } };
      },
      () => { // planet with orbits
        const g = new THREE.Group();
        const planet = new THREE.Mesh(new THREE.SphereGeometry(1.25, 64, 48), new THREE.MeshPhysicalMaterial({ color: 0x1a1d3a, metalness: 0.8, roughness: 0.25, clearcoat: 1, envMapIntensity: 1.1, emissive: 0x2a1a66, emissiveIntensity: 0.4 }));
        const rings = [], sats = [];
        for (let i = 0; i < 3; i++) {
          const r = new THREE.Mesh(new THREE.TorusGeometry(1.9 + i * 0.45, 0.015, 8, 160), new THREE.MeshBasicMaterial({ color: hdr(i === 1 ? C.cyan : C.violet, 2.6) }));
          r.rotation.set(Math.PI / 2 + (i - 1) * 0.5, i * 0.6, 0);
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), new THREE.MeshBasicMaterial({ color: hdr(C.white, 4) }));
          r.add(s);
          rings.push(r); sats.push({ s, rad: 1.9 + i * 0.45, sp: 0.7 + i * 0.35 });
          g.add(r);
        }
        g.add(planet);
        return { g, tick: (t) => { planet.rotation.y = t * 0.3; sats.forEach((o, i) => { const a = t * o.sp + i * 2; o.s.position.set(Math.cos(a) * o.rad, Math.sin(a) * o.rad, 0); }); } };
      },
    ];
    services.forEach((sv, i) => {
      const u = uOf(0.345 + i * 0.038);
      const f = frameAt(u);
      const side = portrait() ? (i % 2 === 0 ? 1 : -1) : -1;
      const off = portrait() ? 2.6 : 5 + (i % 2) * 2.4;
      const { g, tick } = builders[i]();
      g.position.copy(f.pos).addScaledVector(f.side, side * off).addScaledVector(f.up, portrait() ? (i % 2 ? -0.4 : 0.6) : (i % 2 ? -1.3 : 1.1));
      if (portrait()) g.scale.setScalar(0.72);
      scene.add(g);
      const base = g.position.clone();
      updaters.push((t) => { tick(t); g.position.y = base.y + Math.sin(t * 0.9 + i) * 0.25; });
      const pl = new THREE.PointLight(i % 2 ? C.cyan : C.violet, 40, 18, 2);
      pl.position.copy(base).addScaledVector(f.up, 3);
      scene.add(pl);
      labelItems.push({ el: makeLabel(labels, 'service', sv.num, sv.title, sv.sub), anchor: base.clone().addScaledVector(f.up, portrait() ? 2.1 : 2.8).addScaledVector(f.side, side * (portrait() ? 0 : 0.8)), range: [0.28, 0.5] });
    });
  }

  /* ---------- 03 Work screens ---------- */
  const screens = [];
  const manager = new THREE.LoadingManager();
  const loadPromise = new Promise((res) => {
    manager.onProgress = (_u, l, t) => onProgress && onProgress(l / t);
    manager.onLoad = res;
    manager.onError = () => {};
  });
  {
    const tl = new THREE.TextureLoader(manager);
    const W = 6.2, H = 4.65;
    const frameGeo = new THREE.PlaneGeometry(W + 0.5, H + 0.5);
    const glowTex = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const g = cv.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(cv);
    })();
    projects.forEach((pr, i) => {
      const u = uOf(0.535 + i * 0.03);
      const f = frameAt(u);
      const side = portrait() ? (i % 2 === 0 ? -1 : 1) : 1;
      const off = portrait() ? 0.4 : 5.6 + (i % 2) * 1.6;
      const g = new THREE.Group();
      const y = portrait() ? (i % 2 ? -1.6 : 1.9) : (i % 2 ? -1.5 : 1.6);
      g.position.copy(f.pos).addScaledVector(f.side, side * off).addScaledVector(f.up, y);
      if (portrait()) { g.position.addScaledVector(f.side, side * 1.1); g.scale.setScalar(0.62); }
      const look = frameAt(u - 0.045).pos;
      g.lookAt(look);
      g.rotateY(side * -0.22);

      const tex = tl.load(`assets/work/${pr.id}.jpg`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const screenMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.86, 0.86, 0.9), toneMapped: false, side: THREE.DoubleSide });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), screenMat);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.9, H * 1.9), new THREE.MeshBasicMaterial({ map: glowTex, color: hdr(i % 2 ? C.cyan : C.violet, 0.5), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.z = -0.25;
      const edgeMat = new THREE.LineBasicMaterial({ color: hdr(i % 2 ? C.cyan : C.violet, 2.4), transparent: true });
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(frameGeo), edgeMat);
      edge.position.z = -0.02;
      const back = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ color: 0x0b0d1c, side: THREE.DoubleSide }));
      back.position.z = -0.05;
      g.add(glow, back, edge, screen);
      scene.add(g);
      screen.userData.project = pr;
      const item = { g, screen, edgeMat, base: g.position.clone(), hover: 0, phase: i * 1.3, color: i % 2 ? C.cyan : C.violet, baseScale: g.scale.x };
      screens.push(item);
      labelItems.push({ el: makeLabel(labels, 'work', `03.${i + 1} · ${pr.tier}`, pr.title, `${pr.type} — live demo ↗`), anchor: g.position.clone().addScaledVector(f.up, (H / 2 + 0.7) * g.scale.x), range: [0.48, 0.73] });
    });
    updaters.push((t) => {
      for (const s of screens) {
        s.hover = lerp(s.hover, s === hovered ? 1 : 0, 0.12);
        s.g.position.y = s.base.y + Math.sin(t * 0.7 + s.phase) * 0.2;
        const k = s.baseScale * (1 + s.hover * 0.07);
        s.g.scale.setScalar(k);
        s.edgeMat.color.copy(s.color).multiplyScalar(2 + s.hover * 4);
        s.screen.material.color.setScalar(0.86 + s.hover * 0.12);
      }
    });
  }
  let hovered = null;

  /* ---------- 04 Process warp tunnel ---------- */
  {
    const N = mobile ? 700 : 1600;
    const pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const u = uOf(0.735 + Math.random() * 0.17);
      const f = frameAt(u);
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 12;
      const p = f.pos.clone().addScaledVector(f.side, Math.cos(a) * r).addScaledVector(f.up, Math.sin(a) * r);
      const len = 1.5 + Math.random() * 7;
      const q = p.clone().addScaledVector(f.tan, len);
      pos.set([p.x, p.y, p.z, q.x, q.y, q.z], i * 6);
      const c = (Math.random() < 0.6 ? C.cyan : Math.random() < 0.5 ? C.violet : C.pink).clone().multiplyScalar(1 + Math.random() * 1.8);
      col.set([0, 0, 0, c.r, c.g, c.b], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));

    const steps = [['04.1', 'Discover', 'Week 1'], ['04.2', 'Design', 'Weeks 1–2'], ['04.3', 'Build', 'Weeks 2–4'], ['04.4', 'Launch', 'Go live + support']];
    const hexes = [];
    steps.forEach((st, i) => {
      const u = uOf(0.755 + i * 0.033);
      const f = frameAt(u);
      const hex = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.06, 6, 6), new THREE.MeshBasicMaterial({ color: hdr(i % 2 ? C.cyan : C.pink, 2.4) }));
      hex.position.copy(f.pos);
      hex.lookAt(f.pos.clone().add(f.tan));
      const inner = new THREE.Mesh(new THREE.TorusGeometry(5.9, 0.015, 4, 6), new THREE.MeshBasicMaterial({ color: hdr(C.white, 1.6), transparent: true, opacity: 0.5 }));
      hex.add(inner);
      scene.add(hex);
      hexes.push({ hex, inner, pos: f.pos.clone(), i });
      const cornerA = Math.PI / 6;
      const anchor = f.pos.clone().addScaledVector(f.side, Math.cos(cornerA) * 5.4 * (i % 2 ? -1 : 1)).addScaledVector(f.up, Math.sin(cornerA) * 5.4);
      labelItems.push({ el: makeLabel(labels, 'step', st[0], st[1], st[2]), anchor, range: [0.7, 0.9] });
    });
    updaters.push((t) => {
      for (const h of hexes) {
        h.hex.rotation.z = t * 0.12 * (h.i % 2 ? 1 : -1);
        h.inner.rotation.z = -t * 0.3;
      }
    });
  }

  /* ---------- 05 Core ---------- */
  const corePos = curve.getPointAt(1).clone();
  {
    const g = new THREE.Group();
    g.position.copy(corePos);
    const mat = blobMaterial(hdr(C.cyan, 0.8), hdr(C.violet, 1.1), hdr(C.pink, 1.2));
    mat.uniforms.uFreq.value = 0.3;
    mat.uniforms.uAmp.value = 0.8;
    mat.uniforms.uGlow.value = 2.2;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(5, detail), mat);
    g.add(core);
    const rings = [];
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(8 + i * 1.6, 0.025 + (i === 1 ? 0.03 : 0), 8, 256), new THREE.MeshBasicMaterial({ color: hdr([C.violet, C.cyan, C.pink, C.white][i], 2.4), transparent: true, opacity: i === 3 ? 0.4 : 1 }));
      r.rotation.set(Math.PI / 2 + (i - 1.5) * 0.35, (i - 1.5) * 0.45, 0);
      g.add(r); rings.push(r);
    }
    const N = mobile ? 1400 : 3200;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 6.5 + Math.pow(Math.random(), 2) * 16, th = Math.random() * Math.PI * 2;
      const yy = (Math.random() - 0.5) * (Math.random() < 0.75 ? 1.2 : 14);
      pos.set([Math.cos(th) * r, yy, Math.sin(th) * r], i * 3);
      const c = (Math.random() < 0.5 ? C.violet : C.cyan).clone().lerp(C.white, Math.random() * 0.6).multiplyScalar(0.8 + Math.random() * 1.6);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    hg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const halo = new THREE.Points(hg, new THREE.PointsMaterial({ size: 0.22, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.rotation.x = 0.35; halo.rotation.z = -0.2;
    g.add(halo);
    scene.add(g);
    const pl = new THREE.PointLight(C.cyan, 120, 60, 2); pl.position.copy(corePos); scene.add(pl);
    updaters.push((t, s) => {
      mat.uniforms.uTime.value = t * 0.8;
      core.rotation.y = t * 0.08;
      rings.forEach((r, i) => { r.rotation.z = t * (0.08 + i * 0.03) * (i % 2 ? -1 : 1); });
      halo.rotation.y = t * 0.05;
      const pulse = 1 + s.postT * 0.15;
      g.scale.setScalar(pulse);
    });
  }

  /* ---------- Post-processing ---------- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloomScale = mobile ? 0.5 : 0.75;
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * bloomScale, innerHeight * bloomScale), 0.85, 0.55, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = innerWidth, h = innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w * bloomScale, h * bloomScale);
  }
  addEventListener('resize', resize);

  /* ---------- Picking ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const screenMeshes = screens.map((s) => s.screen);
  function pick(x, y) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(screenMeshes, false)[0];
    if (!hit || hit.distance > 60) return null;
    return hit.object.userData.project;
  }
  function setHover(pr) {
    hovered = pr ? screens.find((s) => s.screen.userData.project === pr) : null;
  }

  /* ---------- Camera ---------- */
  const coreLook = new THREE.Vector3(), camPos = new THREE.Vector3(), look = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  let bank = 0, fov = baseFov();
  const proj = new THREE.Vector3();

  function updateCamera(s) {
    const u = uOf(s.p);
    curve.getPointAt(u, camPos);
    curve.getPointAt(Math.min(u + 0.02, 1), look);
    coreLook.copy(corePos);
    if (portrait()) coreLook.y -= 5.5; else coreLook.x -= 7.5;
    look.lerp(coreLook, smooth(0.8, 1, s.p));
    // after the flight: rise and orbit slightly around the core
    const pt = s.postT;
    camPos.y += pt * 5;
    camPos.x += Math.sin(pt * Math.PI) * 6;
    camPos.z -= pt * 4;
    camera.position.copy(camPos);
    camera.lookAt(look);

    curve.getTangentAt(u, t1); curve.getTangentAt(Math.min(u + 0.035, 1), t2);
    const bankTarget = clamp((t2.x - t1.x) * 3.2, -0.35, 0.35) * (1 - smooth(0.85, 1, s.p));
    bank = lerp(bank, bankTarget, 0.05);
    camera.rotateZ(bank);
    camera.translateX(s.smx * 0.7);
    camera.translateY(-s.smy * 0.45);

    const f = baseFov() + clamp(Math.abs(s.vel) * 55, 0, reduced ? 0 : 16);
    fov = lerp(fov, f, 0.08);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  function updateLabels(s) {
    const W = innerWidth, H = innerHeight;
    for (const it of labelItems) {
      const inRange = s.p > it.range[0] && s.p < it.range[1] && s.post < 10;
      if (!inRange) { if (it.vis !== false) { it.el.style.opacity = 0; it.vis = false; } continue; }
      const d = it.anchor.distanceTo(camera.position);
      proj.copy(it.anchor).project(camera);
      const behind = proj.z > 1;
      let o = behind ? 0 : (1 - smooth(34, 52, d)) * smooth(3, 7, d);
      const x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * H;
      if (x < -200 || x > W + 50 || y < -50 || y > H + 50) o = 0;
      if (W < 760) o *= 1 - smooth(H * 0.36, H * 0.46, y);
      it.el.style.opacity = o.toFixed(3);
      it.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(0,-100%)`;
      it.vis = o > 0;
    }
  }

  /* ---------- Warm up ---------- */
  updateCamera({ p: 0, postT: 0, smx: 0, smy: 0, vel: 0 });
  renderer.compile(scene, camera);
  loadPromise.then(() => { onProgress && onProgress(1); onReady && onReady(); });

  let time = 0;
  return {
    pick, setHover,
    update(dt, s) {
      time += reduced ? dt * 0.35 : dt;
      updateCamera(s);
      for (const fn of updaters) fn(time, s);
      updateLabels(s);
      composer.render();
      return camera.position;
    },
  };
}
