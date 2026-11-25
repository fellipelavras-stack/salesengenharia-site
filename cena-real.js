/* Sales Engenharia: cena realista de infraestrutura (three.js r170, MIT) */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lerp = (a, b, t) => a + (b - a) * t;
const col = h => new THREE.Color(h);

function webglOk() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }

/* ruído determinístico para texturas e relevo */
function makeNoise(seed = 1) {
  const p = new Uint8Array(512); const r = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(seed);
  const perm = [...Array(256).keys()].sort(() => r() - .5); for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  const n2 = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u), lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u), v);
  };
  const fbm = (x, y, o = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * n2(x * f, y * f); a *= .5; f *= 2; } return s; };
  return { n2, fbm };
}
const NZ = makeNoise(7);

function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function speckle(g, w, h, base, amp, n, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = NZ.fbm(x / 40, y / 40, 4) * amp + (Math.random() - .5) * amp * .7, i = (y * w + x) * 4;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < n; k++) { const v = Math.random(); g.fillStyle = v > .5 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.22)'; g.fillRect(Math.random() * w, Math.random() * h, size, size); }
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .8, metalness: 0 }, o));
function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function cyl(r, h, mat, seg = 14) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.castShadow = true; m.receiveShadow = true; return m; }

/* junta geometrias não indexadas em uma só */
function merge(geoms) {
  const parts = geoms.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; parts.forEach(g => n += g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  parts.forEach(g => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out;
}
function canopyGeo(seed) {
  const r = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(seed);
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const g = new THREE.IcosahedronGeometry(.11 + r() * .07, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(1 + NZ.n2(v.x * 14 + k, v.y * 14 + v.z * 11) * .42); p.setXYZ(i, v.x, v.y, v.z); }
    g.translate((r() - .5) * .28, .34 + r() * .24, (r() - .5) * .28); g.computeVertexNormals(); parts.push(g);
  }
  const out = merge(parts), P = out.attributes.position, c = new Float32Array(P.count * 3);
  /* copa mais escura por baixo e por dentro (oclusão), com variação de tom */
  for (let i = 0; i < P.count; i++) { const y = P.getY(i), rr = Math.hypot(P.getX(i), P.getZ(i)), k = clamp(.38 + .75 * clamp((y - .22) / .42) + .25 * clamp(rr / .3)) * (.9 + .2 * NZ.n2(P.getX(i) * 20, P.getZ(i) * 20 + y * 9)); c[3 * i] = k; c[3 * i + 1] = k; c[3 * i + 2] = k * .92; }
  out.setAttribute('color', new THREE.BufferAttribute(c, 3)); return out;
}

function dragOrbit(el, st) {
  let down = false, x0 = 0, a0 = 0;
  el.addEventListener('pointerdown', e => { down = true; x0 = e.clientX; a0 = st.drag; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (down) st.drag = a0 + (e.clientX - x0) * .005; });
  const up = () => { down = false; }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
function loopWhenVisible(el, tick) {
  let visible = false, raf = 0, last = performance.now();
  const frame = now => { const dt = Math.min(.05, (now - last) / 1000); last = now; tick(dt); raf = requestAnimationFrame(frame); };
  const start = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? start() : stop(); }, { threshold: .05 }).observe(el);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  return { kick: () => { stop(); start(); } };
}


/* cena base: renderizador, céu físico, reflexos do céu, neblina e sol de fim de tarde */
function baseScene(canvas, small, opt = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = opt.exposure || .62;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opt.fov || 34, 1, .1, 400);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - (opt.sunEl || 17)), THREE.MathUtils.degToRad(opt.sunAz || -62));
  const sky = new Sky(); sky.scale.setScalar(300);
  const su = sky.material.uniforms; su.turbidity.value = 5.5; su.rayleigh.value = 1.4; su.mieCoefficient.value = .006; su.mieDirectionalG.value = .82; su.sunPosition.value.copy(sunDir);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(), sky2 = new Sky(); sky2.scale.setScalar(300); Object.keys(su).forEach(k => sky2.material.uniforms[k].value = su[k].value); envScene.add(sky2);
  scene.environment = pmrem.fromScene(envScene, 0, .1, 400).texture; scene.environmentIntensity = .55;
  scene.fog = new THREE.Fog(0xb9c2cc, opt.fogNear || 22, opt.fogFar || 78);
  const sun = new THREE.DirectionalLight(0xffe2bd, 3.2); sun.position.copy(sunDir).multiplyScalar(30); sun.castShadow = true;
  const sm = small ? 2048 : 4096; sun.shadow.mapSize.set(sm, sm);
  const b = opt.shadowBox || 9;
  Object.assign(sun.shadow.camera, { left: -b, right: b, top: b, bottom: -b, near: 5, far: 70 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .025;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x4a3a22, .55));
  return { renderer, scene, camera, sun };
}
/* sombreamento com ruído e relevo fino (grama, terra, reboco) */
function noisy(mat, o = {}) {
  const s1 = (o.s1 || 2.2).toFixed(2), s2 = (o.s2 || 11).toFixed(2), s3 = (o.s3 || 55).toFixed(2), amp = (o.amp || 1).toFixed(2), bump = (o.bump || .018).toFixed(3), bs = (o.bs || 16).toFixed(2);
  const key = ['noisy', s1, s2, s3, amp, bump, bs].join('|');
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n#ifdef USE_INSTANCING\nvW = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).xyz;\n#else\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vW;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fb(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float g1=fb(vW.xz*${s1}), g2=fb(vW.xz*${s2}), g3=vn(vW.xz*${s3});
  diffuseColor.rgb *= 1. + ${amp}*(-.22 + .34*g1 + .16*(g2-.5) + .12*(g3-.5)); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float hh = fb(vW.xz*${bs})*.6 + vn(vW.xz*${bs}*3.7)*.4;
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition); vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1); vec3 gr = sign(det) * (dFdx(hh) * r1 + dFdy(hh) * r2);
  normal = normalize(abs(det) * normal - gr * ${bump}); }`);
  };
  return mat;
}

export function heroScene(o) {
  if (!webglOk()) return null;
  const { canvas, host, onStage } = o;
  const small = window.innerWidth < 700;
  const { renderer, scene, camera } = baseScene(canvas, small);

  /* ---------------- terreno com malha mais densa no canteiro ---------------- */
  const S = 10, Ni = small ? 100 : 150, No = small ? 26 : 36, OUT = 120;
  const axis = [];
  for (let k = No; k >= 1; k--) axis.push(-S / 2 - (OUT - S / 2) * Math.pow(k / No, 2.2));
  for (let k = 0; k <= Ni; k++) axis.push(-S / 2 + S * k / Ni);
  for (let k = 1; k <= No; k++) axis.push(S / 2 + (OUT - S / 2) * Math.pow(k / No, 2.2));
  const NA = axis.length, COUNT = NA * NA;
  const U0 = .14, U1 = .86, V0 = .2, V1 = .82, zA = .4, zB = .85;
  const natSite = (u, v) => {
    const vc = clamp(v, -.8, 1.8), uc = clamp(u, -.8, 1.8);
    return 1.7 * Math.exp(-((u - .32) ** 2 + (v - .05) ** 2) / .055) + 1.45 * Math.exp(-((u - .76) ** 2 + (v - .03) ** 2) / .05)
      + .30 * Math.exp(-((u - .12) ** 2 + (v - .78) ** 2) / .025) + .10 * Math.sin(u * 7 + 1) * Math.cos(v * 6)
      + .55 * (1 - vc) + .18 * uc - .25 * Math.exp(-((u - .6) ** 2 + (v - .96) ** 2) / .02);
  };
  const H = (x, z) => {
    const u = x / S + .5, v = z / S + .5, d = Math.max(Math.abs(x), Math.abs(z)) - 6.2;
    const w = d > 0 ? ease(d / 9) : 0;
    const far = Math.hypot(x, z);
    return natSite(u, v) + w * (2.6 * (NZ.fbm(x * .05 + 3, z * .05 - 2, 4) + .25) + .8 * NZ.fbm(x * .16, z * .16, 3)) + (z < -12 ? ease((-z - 12) / 20) * 3 : 0) + ease((far - 30) / 50) * (6 + 9 * NZ.fbm(x * .018 + 7, z * .018, 3));
  };
  const design = (u, v) => {
    const cu = clamp(u, U0, U1), cv = clamp(v, V0, V1), w = .004;
    const p = zA + clamp((cu - (.5 - w)) / (2 * w)) * (zB - zA), n = natSite(u, v), d = Math.hypot(u - cu, v - cv) * S;
    if (d === 0) return p;
    const s = (v < V0 && p < n) ? 60 : 1;
    return p > n ? Math.max(n, p - s * d) : Math.min(n, p + s * d);
  };
  const NAT = new Float32Array(COUNT), DES = new Float32Array(COUNT), NOI = new Float32Array(COUNT), INS = new Uint8Array(COUNT), SITE = new Uint8Array(COUNT);
  const pos = new Float32Array(COUNT * 3), clr = new Float32Array(COUNT * 3), BAND = new Float32Array(COUNT);
  for (let j = 0; j < NA; j++) for (let i = 0; i < NA; i++) {
    const k = j * NA + i, x = axis[i], z = axis[j], u = x / S + .5, v = z / S + .5;
    NAT[k] = H(x, z);
    const inSite = Math.abs(x) <= S / 2 + 1e-6 && Math.abs(z) <= S / 2 + 1e-6;
    SITE[k] = inSite ? 1 : 0;
    DES[k] = inSite ? design(u, v) : NAT[k];
    NOI[k] = NZ.fbm(x * .9, z * .9, 3);
    INS[k] = (u >= U0 && u <= U1 && v >= V0 && v <= V1) ? 1 : 0;
    if (INS[k]) { const dW = (v - V0) * S, dM = (.5 - u) * S; BAND[k] = Math.max(clamp(1 - (dW - .55) / .5), dM > 0 ? clamp(1 - (dM - .45) / .45) : 0); }
    pos[3 * k] = x; pos[3 * k + 1] = NAT[k]; pos[3 * k + 2] = z;
  }
  const idx = new Uint32Array((NA - 1) * (NA - 1) * 6); let q = 0;
  for (let j = 0; j < NA - 1; j++) for (let i = 0; i < NA - 1; i++) { const a = j * NA + i, b = a + 1, c = a + NA, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tgeo.setAttribute('color', new THREE.BufferAttribute(clr, 3)); tgeo.setIndex(new THREE.BufferAttribute(idx, 1));
  const terrainMat = std(0xffffff, { vertexColors: true, roughness: .97 });
  noisy(terrainMat);
  terrainMat.transparent = false;
  const terrain = new THREE.Mesh(tgeo, terrainMat); terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);

  const cG1 = col(0x4d6a2c), cG2 = col(0x86924c), cForest = col(0x3d5426), cClay = col(0xa2522c), cClay2 = col(0xbb6d3e), cFill = col(0xb49167), cPlat = col(0xa88b63), cNew = col(0x7d9a46), tmp = new THREE.Color();
  let mn = 9, mx = -9; for (let k = 0; k < COUNT; k++) if (SITE[k]) { mn = Math.min(mn, NAT[k]); mx = Math.max(mx, NAT[k]); }
  let last = { e: -1, g: -1, b: -1 };
  function setTerrain(e, green, eb = 0) {
    if (Math.abs(e - last.e) < 1e-4 && Math.abs(green - last.g) < 1e-4 && Math.abs(eb - last.b) < 1e-4) return;
    last = { e, g: green, b: eb };
    for (let k = 0; k < COUNT; k++) {
      const diff = (DES[k] - NAT[k]) * Math.max(e, eb * BAND[k]);
      pos[3 * k + 1] = NAT[k] + diff;
      const hf = clamp((NAT[k] - mn) / (mx - mn + .001));
      tmp.copy(cG1).lerp(cG2, clamp(hf * .55 + NOI[k] * .6 + .25));
      if (!SITE[k]) tmp.lerp(cForest, clamp(.35 + NOI[k]));
      const a = clamp((Math.abs(diff) - .004) * 30);
      if (a > 0) {
        if (INS[k]) tmp.lerp(diff < 0 ? cPlat.clone().lerp(cClay, .25) : cPlat, a);
        else { tmp.lerp(diff < 0 ? cClay.clone().lerp(cClay2, clamp(NOI[k] + .5)) : cFill, a); tmp.lerp(cNew, green * a * .9); }
      }
      clr[3 * k] = tmp.r; clr[3 * k + 1] = tmp.g; clr[3 * k + 2] = tmp.b;
    }
    tgeo.attributes.position.needsUpdate = true; tgeo.attributes.color.needsUpdate = true; tgeo.computeVertexNormals();
  }
  /* altura atual do terreno em um ponto (interpolação na malha) */
  const findI = x => { let lo = 0, hi = NA - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (axis[m] <= x) lo = m; else hi = m; } return lo; };
  const heightAt = (x, z) => {
    const i = findI(x), j = findI(z), tx = (x - axis[i]) / (axis[i + 1] - axis[i]), tz = (z - axis[j]) / (axis[j + 1] - axis[j]);
    const y = (a, b) => pos[3 * (b * NA + a) + 1];
    return lerp(lerp(y(i, j), y(i + 1, j), tx), lerp(y(i, j + 1), y(i + 1, j + 1), tx), tz);
  };

  /* ---------------- texturas ---------------- */
  const concreteTex = canvasTex(512, 512, (g, w, h) => {
    speckle(g, w, h, '#b7b5ae', 26, 2600, 2);
    g.strokeStyle = 'rgba(60,58,52,.35)'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = 'rgba(40,38,34,.5)'; for (let x = 32; x < w; x += 64) for (let y = 32; y < h; y += 64) { g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); }
  }, [1, 1]);
  const asphaltTex = canvasTex(512, 1024, (g, w, h) => {
    speckle(g, w, h, '#3b3d41', 22, 14000, 2);
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(w * .36, 0, w * .1, h); g.fillRect(w * .54, 0, w * .1, h);
    g.strokeStyle = 'rgba(236,236,230,.92)'; g.lineWidth = 5;
    for (let y = 70; y < h - 60; y += 74) { g.beginPath(); g.moveTo(10, y); g.lineTo(w * .3, y); g.moveTo(w - 10, y); g.lineTo(w * .7, y); g.stroke(); }
    g.strokeStyle = 'rgba(232,186,60,.95)'; g.setLineDash([40, 30]); g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, h - 10); g.stroke(); g.setLineDash([]);
  });
  const paverTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#7d776d'; g.fillRect(0, 0, w, h);
    const bw = 32, bh = 16;
    for (let r = 0; r < h / bh; r++) for (let c = -1; c < w / bw + 1; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh, l = 150 + Math.random() * 26;
      g.fillStyle = `rgb(${l | 0},${(l - 5) | 0},${(l - 14) | 0})`; g.fillRect(x + 1.2, y + 1.2, bw - 2.4, bh - 2.4);
    }
    const img = g.getImageData(0, 0, w, h), d = img.data; for (let i = 0; i < d.length; i += 4) { const v = (Math.random() - .5) * 14; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(img, 0, 0);
  }, [6, 10]);
  const ribTex = canvasTex(256, 64, (g, w, h) => { for (let x = 0; x < w; x++) { const v = 196 + 34 * Math.sin(x / w * Math.PI * 24); g.fillStyle = `rgb(${v | 0},${(v + 3) | 0},${(v + 8) | 0})`; g.fillRect(x, 0, 1, h); } }, [6, 1]);
  const panelTex = canvasTex(256, 256, (g, w, h) => { speckle(g, w, h, '#e4e6e8', 8, 300, 1); g.strokeStyle = 'rgba(120,124,130,.55)'; g.lineWidth = 2; for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } }, [6, 1]);
  const doorTex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#5b6068'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(30,32,36,.6)'; for (let y = 0; y < h; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
  const latticeTex = (() => { const t = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#e0a526'; g.lineWidth = 6; g.strokeRect(3, 0, w - 6, h); g.lineWidth = 4; g.beginPath(); g.moveTo(3, 0); g.lineTo(w - 3, h); g.moveTo(w - 3, 0); g.lineTo(3, h); g.stroke(); }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();

  const yellow = std(0xd9a21e, { roughness: .45, metalness: .25 }), dark = std(0x26282c, { roughness: .8 }), steel = std(0x6f7680, { roughness: .45, metalness: .65 });
  const glassDark = new THREE.MeshPhysicalMaterial({ color: 0x1d2a38, metalness: .9, roughness: .08, envMapIntensity: 1.3 });

  /* ---------------- vegetação (instanciada) ---------------- */
  const canopy = canopyGeo(3), trunkG = new THREE.CylinderGeometry(.018, .03, .4, 6).translate(0, .2, 0);
  const leafMat = noisy(std(0xffffff, { roughness: .95, vertexColors: true }), { s1: 9, s2: 40, s3: 160, amp: .9, bump: .05, bs: 60 }), barkMat = std(0x4b3a2a, { roughness: 1 });
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(11);
  const greens = [0x3f5f28, 0x4d6e2e, 0x5b7a34, 0x35522a, 0x6a7f3a];
  function forest(points) {
    const cm = new THREE.InstancedMesh(canopy, leafMat, points.length), tm = new THREE.InstancedMesh(trunkG, barkMat, points.length);
    const m4 = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new THREE.Vector3();
    points.forEach(([x, z, s], n) => { qn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28); sc.setScalar(s); m4.compose(new THREE.Vector3(x, H(x, z) - .02, z), qn, sc); cm.setMatrixAt(n, m4); tm.setMatrixAt(n, m4); cm.setColorAt(n, col(greens[(rnd() * greens.length) | 0]).multiplyScalar(.85 + rnd() * .3)); });
    cm.castShadow = tm.castShadow = true; cm.receiveShadow = true; scene.add(cm, tm);
    return { cm, tm, points };
  }
  const outer = [];
  for (let n = 0; n < (small ? 900 : 1800); n++) {
    const x = (rnd() - .5) * 64, z = (rnd() - .5) * 64; if (Math.max(Math.abs(x), Math.abs(z)) < 6.3) continue;
    if (NZ.fbm(x * .12, z * .12, 3) < -.05 && rnd() > .25) continue;
    outer.push([x, z, 1.2 + rnd() * 1.4]);
  }
  forest(outer);
  const sitePts = [];
  for (let n = 0; n < 70; n++) { const x = (rnd() - .5) * 9.6, z = (rnd() - .5) * 9.6; sitePts.push([x, z, .9 + rnd() * .8]); }
  const siteTrees = forest(sitePts);
  const siteRemoved = sitePts.map(([x, z]) => { const u = x / S + .5, v = z / S + .5; return Math.abs(design(u, v) - natSite(u, v)) > .01 || (u > U0 - .03 && u < U1 + .03 && v > V0 - .03 && v < V1 + .03); });
  const newPts = [[-3.45, 3.0, 1], [-2.7, 3.05, .9], [-.6, 3.0, 1], [.45, 3.05, .9], [3.45, 3.0, 1], [-3.45, -2.4, .9], [3.45, -2.55, .9], [1.15, -2.6, .8]];
  const newTrees = { cm: new THREE.InstancedMesh(canopy, leafMat, newPts.length), tm: new THREE.InstancedMesh(trunkG, barkMat, newPts.length) };
  newPts.forEach((p, n) => newTrees.cm.setColorAt(n, col(greens[n % greens.length])));
  newTrees.cm.castShadow = newTrees.tm.castShadow = true; scene.add(newTrees.cm, newTrees.tm);
  const M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), QI = new THREE.Quaternion();
  const setInst = (im, n, x, y, z, s) => { M4.compose(V3.set(x, y, z), QI, new THREE.Vector3(s, s, s)); im.setMatrixAt(n, M4); im.instanceMatrix.needsUpdate = true; };

  /* ---------------- contenções ---------------- */
  const wallPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const conc = std(0xffffff, { map: concreteTex, roughness: .88, clippingPlanes: [wallPlane], clipShadows: true });
  const zW = (V0 - .5) * S, M = 90, wp = [], wuv = [], wi = [], tops = [], bots = [];
  for (let m = 0; m <= M; m++) {
    const u = U0 + (U1 - U0) * m / M, x = (u - .5) * S, bot = u < .5 ? zA : zB, top = Math.max(bot + .14, natSite(u, V0 - .004) + .03);
    tops.push(top); bots.push(bot);
    wp.push(x, bot - .05, zW + .005, x, top, zW + .005, x, top, zW - .16);
    wuv.push(x * 2, (bot - .05) * 2, x * 2, top * 2, x * 2, top * 2 + .3);
    if (m > 0) { const a = (m - 1) * 3, b = m * 3; wi.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2); }
  }
  const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wgeo.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2)); wgeo.setIndex(wi); wgeo.computeVertexNormals();
  const walls = new THREE.Group(); scene.add(walls);
  const cortina = new THREE.Mesh(wgeo, conc); cortina.castShadow = cortina.receiveShadow = true; walls.add(cortina);
  const anchors = []; for (let m = 0; m <= M; m += 4) { const x = ((U0 + (U1 - U0) * m / M) - .5) * S; for (let y = bots[m] + .3; y < tops[m] - .14; y += .32) anchors.push([x, y]); }
  const plateM = std(0x8d9097, { roughness: .5, metalness: .5, clippingPlanes: [wallPlane], clipShadows: true }), nutM = std(0x3b3e44, { roughness: .4, metalness: .8, clippingPlanes: [wallPlane], clipShadows: true });
  const plates = new THREE.InstancedMesh(new THREE.BoxGeometry(.11, .11, .025), plateM, anchors.length);
  const nuts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.025, .025, .05, 8).rotateX(Math.PI / 2), nutM, anchors.length);
  anchors.forEach(([x, y], n) => { M4.makeTranslation(x, y, zW + .018); plates.setMatrixAt(n, M4); M4.makeTranslation(x, y, zW + .04); nuts.setMatrixAt(n, M4); });
  plates.castShadow = nuts.castShadow = true; walls.add(plates, nuts);
  const muroL = (V1 - V0) * S, muroZ = (V0 + V1 - 1) / 2 * S;
  const muro = box(.16, zB - zA + .45, muroL, std(0xffffff, { map: concreteTex, roughness: .88, clippingPlanes: [wallPlane], clipShadows: true }), -.05, (zA - .2 + zB + .25) / 2, muroZ);
  muro.material.map = concreteTex.clone(); muro.material.map.needsUpdate = true; muro.material.map.wrapS = muro.material.map.wrapT = THREE.RepeatWrapping; muro.material.map.repeat.set(3, 1);
  walls.add(muro);
  const rail = std(0x50555c, { metalness: .7, roughness: .4, clippingPlanes: [wallPlane], clipShadows: true });
  walls.add(box(.03, .03, muroL, rail, -.05, zB + .36, muroZ)); for (let z = -2.9; z <= 3.1; z += .5) walls.add(box(.02, .12, .02, rail, -.05, zB + .3, z));
  /* sobreposição em transparência para mostrar a contenção dentro do solo */
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthTest: false, depthWrite: false, clippingPlanes: [wallPlane] });
  const ghost = new THREE.Group(); ghost.renderOrder = 10;
  [cortina, muro].forEach(m => { const g = new THREE.Mesh(m.geometry, ghostMat); g.position.copy(m.position); g.renderOrder = 10; ghost.add(g); });
  const ghostA = new THREE.InstancedMesh(plates.geometry, ghostMat, anchors.length); for (let n = 0; n < anchors.length; n++) { plates.getMatrixAt(n, M4); ghostA.setMatrixAt(n, M4); } ghostA.renderOrder = 10; ghost.add(ghostA);

  /* ---------------- drenagem ---------------- */
  const drain = new THREE.Group(); scene.add(drain);
  const fadeMats = []; const fm = m => { m.transparent = true; m.opacity = 0; fadeMats.push(m); return m; };
  const pipeMat = fm(std(0x9c9b95, { roughness: .8 })), trenchMat = fm(std(0x4a3524, { roughness: 1 }));
  const pipes = [];
  const pipe = (x0, z0, x1, z1, y) => {
    const L = Math.hypot(x1 - x0, z1 - z0), g = new THREE.CylinderGeometry(.045, .045, L, 12); g.rotateX(Math.PI / 2); g.translate(0, 0, L / 2);
    const m = new THREE.Mesh(g, pipeMat); m.position.set(x0, y - .01, z0); m.rotation.y = Math.atan2(x1 - x0, z1 - z0); m.castShadow = true;
    const t = new THREE.Mesh(new THREE.BoxGeometry(.17, .012, L).translate(0, 0, L / 2), trenchMat); t.position.set(x0, y + .003, z0); t.rotation.y = m.rotation.y; t.receiveShadow = true;
    drain.add(m, t); pipes.push(m, t);
  };
  pipe(-.35, -2.7, -.35, 3.05, zA); pipe(.25, -2.7, .25, 3.05, zB); pipe(-3.3, 1.0, -.35, 1.0, zA); pipe(-3.3, -1.4, -.35, -1.4, zA); pipe(3.4, -.6, .25, -.6, zB); pipe(3.4, 1.9, .25, 1.9, zB);
  const chanM = fm(std(0xffffff, { map: concreteTex, roughness: .85 })), waterM = fm(std(0x2c3946, { roughness: .08, metalness: .3 }));
  const chan = (x0, x1, y, z) => { const L = x1 - x0, cx = (x0 + x1) / 2; drain.add(box(L, .05, .2, chanM, cx, y + .02, z), box(L, .012, .1, waterM, cx, y + .047, z)); };
  chan((U0 - .5) * S + .05, -.15, zA, zW + .16); chan(.08, (U1 - .5) * S - .05, zB, zW + .16); chan((U0 - .5) * S + .05, -.15, zA, (V1 - .5) * S - .1); chan(.08, (U1 - .5) * S - .05, zB, (V1 - .5) * S - .1);
  const grateM = fm(std(0x2a2c30, { metalness: .7, roughness: .5 })), boxM = fm(std(0xa8a7a1, { roughness: .9 }));
  for (let z = -2.4; z <= 2.6; z += 1.25) { drain.add(box(.24, .07, .16, boxM, .25, zB + .03, z), box(.2, .012, .12, grateM, .25, zB + .07, z), box(.24, .07, .16, boxM, -.35, zA + .03, z), box(.2, .012, .12, grateM, -.35, zA + .07, z)); }

  /* ---------------- edificações ---------------- */
  const bPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), cPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const C = (m, p) => { m.clippingPlanes = [p]; m.clipShadows = true; return m; };
  const steelB = C(std(0x5d6670, { roughness: .45, metalness: .6 }), bPlane), concB = C(std(0xb3b1ab, { roughness: .9 }), bPlane);
  const panelM = C(std(0xffffff, { map: panelTex, roughness: .55, metalness: .15 }), cPlane), roofM = C(std(0xffffff, { map: ribTex, roughness: .35, metalness: .7 }), cPlane);
  const doorM = C(std(0xffffff, { map: doorTex, roughness: .6, metalness: .3 }), cPlane), baseM = C(std(0x8e8c86, { roughness: .9 }), cPlane);
  const glassM = C(new THREE.MeshPhysicalMaterial({ color: 0x2a4560, metalness: .85, roughness: .06, envMapIntensity: 1.4 }), cPlane);
  const slabM = C(std(0xe9e7e2, { roughness: .7 }), cPlane), mullM = C(std(0x2b2f36, { metalness: .6, roughness: .4 }), cPlane);
  const bld = new THREE.Group(); scene.add(bld);
  const gx = -1.9, gz = .25, gw = 2.3, gd = 3.6, ge = 1.0, gr = 1.3, gy = zA + .04;
  for (let z = -gd / 2; z <= gd / 2 + 1e-6; z += gd / 6) {
    for (const sx of [-1, 1]) bld.add(box(.06, ge, .06, steelB, gx + sx * gw / 2, gy + ge / 2, gz + z));
    for (const sx of [-1, 1]) { const r = box(Math.hypot(gw / 2, gr - ge), .05, .04, steelB, gx + sx * gw / 4, gy + (ge + gr) / 2, gz + z); r.rotation.z = -sx * Math.atan2(gr - ge, gw / 2); bld.add(r); }
  }
  bld.add(box(gw - .04, .22, gd - .04, baseM, gx, gy + .11, gz), box(gw - .05, ge - .22, gd - .05, panelM, gx, gy + .22 + (ge - .22) / 2, gz));
  for (const z of [-1.2, -.3, .6, 1.5]) bld.add(box(.03, .5, .5, doorM, gx - gw / 2 - .015, gy + .25, gz + z));
  const slope = Math.atan2(gr - ge, gw / 2), rw = Math.hypot(gw / 2, gr - ge) + .12;
  for (const sx of [-1, 1]) { const r = box(rw, .035, gd + .24, roofM, gx + sx * gw / 4, gy + (ge + gr) / 2 + .03, gz); r.rotation.z = -sx * slope; bld.add(r); }
  const px = 2.25, pz = -1.05, pw = 1.9, pd = 2.3, fh = .56, nF = 4, py = zB + .04;
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) bld.add(box(.08, fh * nF, .08, concB, px + sx * (pw / 2 - .06), py + fh * nF / 2, pz + sz * (pd / 2 - .06)));
  for (let f = 1; f <= nF; f++) bld.add(box(pw, .05, pd, concB, px, py + f * fh - .025, pz));
  for (let f = 0; f < nF; f++) {
    const y0 = py + f * fh;
    bld.add(box(pw + .06, .09, pd + .06, slabM, px, y0 + .045, pz), box(pw - .03, fh - .09, pd - .03, glassM, px, y0 + .09 + (fh - .09) / 2, pz));
    for (let xx = -pw / 2 + .19; xx < pw / 2; xx += .38) bld.add(box(.025, fh - .09, .03, mullM, px + xx, y0 + .09 + (fh - .09) / 2, pz + pd / 2 - .005));
    for (let zz = -pd / 2 + .19; zz < pd / 2; zz += .38) bld.add(box(.03, fh - .09, .025, mullM, px - pw / 2 + .005, y0 + .09 + (fh - .09) / 2, pz + zz));
  }
  bld.add(box(pw + .06, .16, pd + .06, slabM, px, py + fh * nF + .08, pz), box(.55, .28, .5, slabM, px + .4, py + fh * nF + .3, pz - .4));
  const top4 = py + fh * nF + .45;

  /* ---------------- pavimentação ---------------- */
  const pavePlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), -9);
  const pave = new THREE.Group(); scene.add(pave);
  const pavW = (.49 - U0) * S - .25, pavD = (V1 - V0) * S - .3;
  const paver = box(pavW, .05, pavD, std(0xffffff, { map: paverTex, roughness: .92, clippingPlanes: [pavePlane] }), ((U0 + .49) / 2 - .5) * S - .02, zA + .02, muroZ); paver.castShadow = false; pave.add(paver);
  const asW = (U1 - .51) * S - .2;
  const asphalt = box(asW, .05, pavD, std(0xffffff, { map: asphaltTex, roughness: .82, clippingPlanes: [pavePlane] }), ((U1 + .51) / 2 - .5) * S, zB + .02, muroZ); asphalt.castShadow = false; pave.add(asphalt);
  const curbM = std(0xc9c7c0, { roughness: .85, clippingPlanes: [pavePlane] });
  [[paver, zA], [asphalt, zB]].forEach(([p, y]) => { const w = p.geometry.parameters.width, d = p.geometry.parameters.depth; pave.add(box(w + .06, .07, .04, curbM, p.position.x, y + .035, p.position.z + d / 2 + .02), box(.04, .07, d, curbM, p.position.x - w / 2 - .02, y + .035, p.position.z)); });

  /* ---------------- máquinas e veículos ---------------- */
  function excavator() {
    const g = new THREE.Group();
    for (const s of [-1, 1]) g.add(box(.5, .09, .1, dark, 0, .045, s * .13));
    const top = new THREE.Group(); top.position.y = .1; g.add(top);
    top.add(box(.36, .12, .26, yellow, -.03, .06, 0), box(.13, .14, .12, yellow, .08, .17, .07), box(.1, .1, .1, glassDark, .11, .18, .07), box(.12, .1, .24, dark, -.2, .07, 0));
    const boom = new THREE.Group(); boom.position.set(.12, .12, -.04); top.add(boom);
    const b1 = box(.42, .06, .06, yellow, .21, 0, 0); boom.add(b1); boom.rotation.z = .55;
    const arm = new THREE.Group(); arm.position.set(.42, 0, 0); boom.add(arm);
    arm.add(box(.32, .05, .05, yellow, .16, 0, 0)); arm.rotation.z = -1.6;
    const bucket = box(.09, .08, .1, dark, .34, -.02, 0); arm.add(bucket);
    g.userData = { top, boom, arm }; return g;
  }
  function truck(color = 0xe8e9ea) {
    const g = new THREE.Group(), body = std(color, { roughness: .45, metalness: .3 });
    g.add(box(.56, .05, .16, dark, 0, .06, 0), box(.13, .14, .17, body, .22, .15, 0), box(.02, .07, .14, glassDark, .29, .18, 0), box(.38, .13, .19, yellow, -.07, .16, 0));
    for (const x of [.21, -.07, -.2]) for (const s of [-1, 1]) { const w = cyl(.042, .03, dark, 12); w.rotation.x = Math.PI / 2; w.position.set(x, .042, s * .09); g.add(w); }
    return g;
  }
  function dozer() { const g = new THREE.Group(); for (const s of [-1, 1]) g.add(box(.36, .09, .09, dark, 0, .045, s * .11)); g.add(box(.3, .13, .22, yellow, -.02, .15, 0), box(.12, .12, .14, glassDark, -.06, .27, 0), box(.04, .12, .34, dark, .23, .08, 0)); return g; }
  function drillRig() { const g = new THREE.Group(); for (const s of [-1, 1]) g.add(box(.34, .08, .08, dark, 0, .04, s * .1)); g.add(box(.26, .12, .2, yellow, 0, .14, 0)); const mast = box(.05, .7, .05, yellow, .12, .5, 0); mast.rotation.z = -.32; g.add(mast); return g; }
  function crane() {
    const g = new THREE.Group(), lat = new THREE.MeshStandardMaterial({ map: latticeTex, transparent: true, alphaTest: .5, side: THREE.DoubleSide, roughness: .5, metalness: .3 });
    const mastH = 3.7, mw = .12;
    for (let k = 0; k < 4; k++) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(mw, mastH), lat.clone()); pl.material.map = latticeTex.clone(); pl.material.map.repeat.set(1, mastH / mw); pl.material.map.needsUpdate = true; pl.rotation.y = k * Math.PI / 2; pl.position.set(Math.sin(k * Math.PI / 2) * mw / 2, mastH / 2, Math.cos(k * Math.PI / 2) * mw / 2); pl.castShadow = true; g.add(pl); }
    const slew = new THREE.Group(); slew.position.y = mastH; g.add(slew);
    const jibL = 3.4, jib = new THREE.Mesh(new THREE.PlaneGeometry(jibL, .1), lat.clone()); jib.material.map = latticeTex.clone(); jib.material.map.repeat.set(jibL / .1, 1); jib.material.map.needsUpdate = true; jib.position.set(jibL / 2, .05, 0); jib.castShadow = true; slew.add(jib);
    const jib2 = jib.clone(); jib2.rotation.x = Math.PI / 2; jib2.position.y = .0; slew.add(jib2);
    slew.add(box(1.0, .08, .1, yellow, -.5, .04, 0), box(.25, .2, .18, std(0x8c8a84), -.85, -.05, 0), box(.16, .16, .14, yellow, .02, .12, 0), box(.02, .5, .02, yellow, 0, .35, 0));
    const hook = new THREE.Group(); hook.position.set(2.2, 0, 0); slew.add(hook);
    const line = cyl(.006, 1.6, dark, 4); line.position.y = -.8; hook.add(line); hook.add(box(.3, .05, .05, std(0x7c838c, { metalness: .6 }), 0, -1.62, 0));
    g.userData = { slew }; return g;
  }
  function roller() { const g = new THREE.Group(); for (const x of [-.13, .13]) { const d = cyl(.07, .2, std(0x80868e, { metalness: .6, roughness: .4 }), 16); d.rotation.x = Math.PI / 2; d.position.set(x, .07, 0); g.add(d); } g.add(box(.2, .1, .16, yellow, 0, .15, 0), box(.08, .1, .1, glassDark, 0, .24, 0)); return g; }
  function paverMachine() { const g = new THREE.Group(); for (const s of [-1, 1]) g.add(box(.32, .07, .07, dark, 0, .035, s * .12)); g.add(box(.3, .14, .3, yellow, 0, .15, 0), box(.07, .07, .42, dark, -.18, .05, 0), box(.1, .12, .12, glassDark, .04, .28, 0)); return g; }
  function car(c) { const g = new THREE.Group(), m = std(c, { roughness: .28, metalness: .55 }); g.add(box(.42, .1, .19, m, 0, .08, 0), box(.24, .08, .17, glassDark, -.02, .17, 0)); for (const x of [-.13, .13]) for (const s of [-1, 1]) { const w = cyl(.035, .03, dark, 10); w.rotation.x = Math.PI / 2; w.position.set(x, .035, s * .09); g.add(w); } return g; }

  const exA = excavator(); scene.add(exA);
  const exB = excavator(); scene.add(exB);
  const dz = dozer(); scene.add(dz);
  const rig = drillRig(); scene.add(rig);
  const trucks = [truck(0xe9eaec), truck(0xd0d4da), truck(0xe9eaec)]; trucks.forEach(t => scene.add(t));
  const cr = crane(); cr.position.set(3.35, zB + .02, -2.65); scene.add(cr);
  const mixer = truck(0xf1f1f1); mixer.children[3].visible = false; const drum = cyl(.09, .3, std(0xe7e3d8, { roughness: .5 }), 14); drum.rotation.z = Math.PI / 2 + .25; drum.position.set(-.08, .2, 0); mixer.add(drum); mixer.position.set(.8, zB + .045, -.2); mixer.rotation.y = Math.PI / 2; scene.add(mixer);
  const rl = roller(), pm = paverMachine(); scene.add(rl, pm);
  const cars = new THREE.Group(); scene.add(cars);
  [[1.0, 1.35, 0xf2f2f2], [3.0, .55, 0x2a2d33], [1.0, 2.45, 0x9aa1ab], [3.0, 2.0, 0x8b1e1e], [3.0, 1.25, 0xdedede]].forEach(([x, z, c]) => { const k = car(c); k.position.set(x, zB + .045, z); k.rotation.y = Math.PI / 2; cars.add(k); });
  const truckPath = new THREE.CatmullRomCurve3([[-2.6, -1.7], [-1.2, -.6], [.6, 1.0], [2.6, 2.3], [1.7, 2.85], [-.4, 1.9], [-2.3, -.3]].map(([x, z]) => new THREE.Vector3(x, 0, z)), true);
  const show = (g, on) => { g.visible = on; };

  /* ---------------- linha do tempo ---------------- */
  const STAGES = [{ t: 0, end: 2.6 }, { t: 2.6, end: 7 }, { t: 7, end: 12.5 }, { t: 12.5, end: 16 }, { t: 16, end: 23 }, { t: 23, end: 27.5 }];
  const END = 27.5, HOLD = 6;
  let T = o.startT || 0, playing = !o.paused, stageNow = -1, time = 0;
  const v3 = new THREE.Vector3();
  function apply(T) {
    /* 1 contenções */
    const w = ease((T - 3.0) / 3.6); wallPlane.constant = -lerp(3.4, zA - .3, w);
    walls.visible = T > 2.8;
    const rigOn = T > 2.7 && T < 7.0; show(rig, rigOn);
    if (rigOn) { const rx = lerp(-3.2, 3.1, clamp((T - 2.9) / 3.8)); rig.position.set(rx, heightAt(rx, -2.55), -2.55); rig.rotation.y = Math.PI / 2; }
    /* 2 terraplenagem */
    const e = ease((T - 7.4) / 4.8), green = ease((T - 12.6) / 3);
    setTerrain(e, green, w);
    const clear = 1 - ease((T - 7.0) / .8);
    siteTrees.points.forEach(([x, z, s], n) => { if (siteRemoved[n]) setInst(siteTrees.cm, n, x, H(x, z) - .02, z, Math.max(.0001, s * clear)), setInst(siteTrees.tm, n, x, H(x, z) - .02, z, Math.max(.0001, s * clear)); });
    const earth = T > 7.0 && T < 12.6;
    show(exA, earth || (T > 12.5 && T < 15.6)); show(dz, earth); trucks.forEach(t => show(t, earth));
    if (earth) {
      const ax = -2.35, az = -1.75; exA.position.set(ax, heightAt(ax, az), az); exA.rotation.y = .5;
      exA.userData.top.rotation.y = Math.sin(time * 1.3) * .9; exA.userData.boom.rotation.z = .5 + Math.sin(time * 2.6) * .18; exA.userData.arm.rotation.z = -1.5 + Math.sin(time * 2.6 + 1) * .3;
      const dx = 2.3 + Math.sin(time * .6) * .7, dzz = 2.1; dz.position.set(dx, heightAt(dx, dzz), dzz); dz.rotation.y = Math.cos(time * .6) > 0 ? 0 : Math.PI;
      trucks.forEach((t, n) => { const f = (time * .045 + n / 3) % 1; truckPath.getPointAt(f, v3); const tg = truckPath.getTangentAt(f); t.position.set(v3.x, heightAt(v3.x, v3.z), v3.z); t.rotation.y = Math.atan2(-tg.z, tg.x); });
    }
    /* 3 drenagem */
    const fi = ease((T - 13.4) / 1.6); fadeMats.forEach(m => { m.opacity = fi; m.transparent = fi < .999; m.depthWrite = fi > .5; });
    const pl = ease((T - 12.7) / 2.6); pipes.forEach(p => { p.material.opacity = Math.max(p.material.opacity, pl > .001 ? 1 : 0); p.material.transparent = false; p.scale.z = Math.max(.001, pl); });
    drain.visible = T > 12.6;
    if (T > 12.5 && T < 15.6) { const tz = lerp(-2.6, 2.9, pl); exA.position.set(-.75, zA, tz); exA.rotation.y = Math.PI / 2; exA.userData.top.rotation.y = Math.PI / 2 + Math.sin(time * 2) * .35; exA.userData.boom.rotation.z = .3 + Math.sin(time * 3) * .12; exA.userData.arm.rotation.z = -1.7 + Math.sin(time * 3 + 1) * .25; }
    /* 4 edificação */
    const sb = ease((T - 16.4) / 3), sc = ease((T - 18.6) / 3.4);
    bPlane.constant = lerp(zA - .05, top4 + .1, sb); cPlane.constant = lerp(zA - .05, top4 + .1, sc); bld.visible = T > 16.4;
    const crOn = T > 15.9 && T < 23.2; show(cr, crOn);
    if (crOn) { const s = Math.min(ease((T - 15.9) / .7), 1 - ease((T - 22.4) / .7)); cr.scale.set(1, Math.max(.001, s), 1); cr.userData.slew.rotation.y = 2.4 + Math.sin(time * .35) * .9; }
    show(mixer, T > 16.4 && T < 19.6); drum.rotation.x = time * 3;
    /* 5 pavimentação */
    const pv = ease((T - 23.2) / 3.2), front = lerp((V0 - .5) * S - .1, (V1 - .5) * S + .1, pv);
    pavePlane.constant = front; pave.visible = pv > .001;
    const paving = T > 23.0 && T < 26.6; show(pm, paving); show(rl, paving);
    if (paving) { pm.position.set(1.85, zB + .045, front + .2); pm.rotation.y = Math.PI / 2; rl.position.set(1.85, zB + .05, front - .45 + Math.sin(time * 2) * .12); rl.rotation.y = Math.PI / 2; }
    cars.visible = T > 26.2; cars.children.forEach((c, n) => c.scale.setScalar(Math.max(.001, ease((T - 26.2 - n * .2) / .8))));
    newPts.forEach(([x, z, s], n) => { const k = Math.max(.0001, s * ease((T - 25.8 - n * .12) / 1.1)), y = x < 0 ? zA + .05 : zB + .05; setInst(newTrees.cm, n, x, y, z, k); setInst(newTrees.tm, n, x, y, z, k); });
    let st = STAGES.length - 1; while (st > 0 && T < STAGES[st].t) st--;
    onStage && onStage(st, clamp((T - STAGES[st].t) / (STAGES[st].end - STAGES[st].t)), st !== stageNow); stageNow = st;
  }

  /* ---------------- câmera de drone ---------------- */
  const orbit = { drag: 0 }; dragOrbit(canvas, orbit);
  const target = new THREE.Vector3(.1, 1.25, .3);
  let dist = 14;
  function resize() {
    const r = host.getBoundingClientRect(), W = Math.max(1, r.width), Hh = Math.max(1, r.height);
    renderer.setSize(W, Hh, false); camera.aspect = W / Hh;
    const wide = W >= 900;
    if (wide) camera.setViewOffset(W, Hh, -W * .2, 0, W, Hh); else camera.clearViewOffset();
    const aspect = wide ? W * .6 / Hh : camera.aspect, vf = THREE.MathUtils.degToRad(camera.fov / 2), hf = Math.atan(Math.tan(vf) * aspect);
    dist = 5.0 / Math.sin(Math.min(vf, hf)) * (wide ? 1.0 : .95); camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();
  function placeCam() {
    const az = -.72 + .24 * Math.sin(time * .045) + orbit.drag, el = .23 + .02 * Math.sin(time * .13);
    camera.position.set(target.x + dist * Math.sin(az) * Math.cos(el), target.y + dist * Math.sin(el), target.z + dist * Math.cos(az) * Math.cos(el));
    camera.lookAt(target);
  }
  let first = true;
  const loop = loopWhenVisible(host, dt => {
    time += dt;
    if (playing) { T += dt; if (T > END + HOLD) T = 0; }
    apply(Math.min(T, END)); placeCam(); renderer.render(scene, camera);
    if (first) { first = false; o.onReady && o.onReady(); }
  });
  apply(T); placeCam();
  return {
    stages: STAGES,
    seek(s) { T = STAGES[s].t; playing = true; o.onPlay && o.onPlay(true); loop.kick(); },
    setT(t) { T = t; apply(Math.min(T, END)); placeCam(); renderer.render(scene, camera); },
    toggle() { if (!playing && T >= END) T = 0; playing = !playing; return playing; },
    get playing() { return playing; },
    reduce: false
  };
}


/* =====================================================================
   CASA REALISTA POR DISCIPLINA
   ===================================================================== */
export function houseScene(o) {
  if (!webglOk()) return null;
  const { canvas, host } = o;
  const small = window.innerWidth < 700;
  const { renderer, scene, camera } = baseScene(canvas, small, { fov: 32, shadowBox: 10, fogNear: 38, fogFar: 150, sunAz: -55, sunEl: 22, exposure: .6 });
  const GOLD = 0xC7AB69;
  const M4 = new THREE.Matrix4();
  /* materiais realistas */
  const plasterTex = canvasTex(256, 256, (g, w, h) => speckle(g, w, h, '#ece8e0', 7, 500, 1), [2, 2]);
  const woodCladTex = canvasTex(256, 256, (g, w, h) => { for (let x = 0; x < w; x += 8) { const l = 112 + Math.random() * 40; g.fillStyle = `rgb(${l | 0},${(l * .66) | 0},${(l * .42) | 0})`; g.fillRect(x, 0, 6, h); g.fillStyle = 'rgba(20,12,6,.75)'; g.fillRect(x + 6, 0, 2, h); } }, [3, 1]);
  const plankTex = canvasTex(256, 256, (g, w, h) => { for (let y = 0; y < h; y += 16) { const l = 130 + Math.random() * 35; g.fillStyle = `rgb(${l | 0},${(l * .7) | 0},${(l * .45) | 0})`; g.fillRect(0, y, w, 14); g.fillStyle = 'rgba(40,24,12,.8)'; g.fillRect(0, y + 14, w, 2); } }, [3, 3]);
  const concTex = canvasTex(256, 256, (g, w, h) => speckle(g, w, h, '#b9b7b0', 18, 1200, 2), [2, 2]);
  const fabricTex = canvasTex(128, 128, (g, w, h) => speckle(g, w, h, '#808080', 10, 0), [4, 4]);
  const WOODCLAD = 'woodclad';
  const realMat = (c, mo = {}) => {
    if (c === WOODCLAD) return std(0xffffff, { map: woodCladTex, roughness: .7 });
    switch (c) {
      case 0xc3c6ce: return std(0xffffff, { map: concTex, roughness: .9 });
      case 0xf3f1ec: return std(0xffffff, { map: plasterTex, roughness: .92 });
      case 0x3d5288: return new THREE.MeshPhysicalMaterial({ color: 0x24384d, metalness: .85, roughness: .05, envMapIntensity: 1.5 });
      case 0x9fb6e8: return new THREE.MeshPhysicalMaterial({ color: 0x8fb0c8, metalness: .5, roughness: .05, transparent: true, opacity: .45 });
      case 0xa77c4f: return std(0xffffff, { map: plankTex, roughness: .75 });
      case 0xb08a5e: return std(0xffffff, { map: plankTex, roughness: .6, color: 0xd8c2a4 });
      case 0xd6d9e0: return noisy(std(0xd9d4c8, { roughness: .8 }), { amp: .3, s1: 8, bump: .006 });
      case 0x3aa0e8: return new THREE.MeshPhysicalMaterial({ color: 0x1f8fb3, roughness: .03, metalness: .15, envMapIntensity: 1.6, clearcoat: 1 });
      case 0x34477a: return std(0x3c4a6a, { map: fabricTex, roughness: 1 });
      case 0x2b3552: return std(0x2f3646, { map: fabricTex, roughness: 1 });
      default: return std(c, mo);
    }
  };
  const canopy = canopyGeo(9), trunkG = new THREE.CylinderGeometry(.018, .03, .4, 6).translate(0, .2, 0);
  const leafMat = noisy(std(0xffffff, { roughness: .95, vertexColors: true }), { s1: 9, s2: 40, s3: 160, amp: .9, bump: .05, bs: 60 }), barkMat = std(0x4b3a2a, { roughness: 1 });
  const greens = [0x3f5f28, 0x4d6e2e, 0x5b7a34, 0x35522a, 0x6a7f3a];
  const items = [];
  const add = (mesh, cat, flags = {}) => {
    mesh.traverse(m => {
      if (!m.isMesh) return;
      const src = m.material; m.material = src.clone();
      if (src.onBeforeCompile) { m.material.onBeforeCompile = src.onBeforeCompile; m.material.customProgramCacheKey = src.customProgramCacheKey; }
      m.material.transparent = true;
      m.userData = Object.assign({ cat, base: m.material.color.clone(), op: 1, mix: 0 }, flags);
      m.castShadow = true; m.receiveShadow = true;
      items.push(m);
    });
    scene.add(mesh); return mesh;
  };
  const B = (w, h, d, c, x, y, z, mo) => box(w, h, d, realMat(c, mo, w, h, d), x, y, z);

  /* terreno, rua e vizinhança */
  const gg = new THREE.PlaneGeometry(240, 240, 140, 140); gg.rotateX(-Math.PI / 2);
  { const P = gg.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), r = Math.hypot(x, z * 1.2); P.setY(i, ease((r - 22) / 70) * (4 + 10 * (NZ.fbm(x * .02 + 4, z * .02, 3) + .4))); } gg.computeVertexNormals(); }
  const ground = new THREE.Mesh(gg, noisy(std(0x5a7431, { roughness: 1 }), { amp: 1.0, s1: 1.6, s2: 7, s3: 40, bump: .02, bs: 20 }));
  ground.position.y = -.08; ground.receiveShadow = true;
  add(ground, 'ext', { keep: 1, hi: col(0x2a3140) });
  const street = new THREE.Mesh(new THREE.PlaneGeometry(160, 2.6), noisy(std(0x3a3c40, { roughness: .9 }), { amp: .6, s1: 3, s2: 18, s3: 90, bump: .01 }));
  street.rotation.x = -Math.PI / 2; street.position.set(0, -.07, 8.6); street.receiveShadow = true; scene.add(street);
  const side = noisy(std(0xbab7ae, { roughness: .9 }), { amp: .5 });
  [7.05, 10.15].forEach(z => { const sw = box(160, .06, .9, side, 0, -.05, z); sw.castShadow = false; scene.add(sw); });
  const lane = box(160, .002, .06, std(0xe8c45a, { roughness: .6 }), 0, -.068, 8.6); lane.castShadow = false; scene.add(lane);
  const fenceM = noisy(std(0xe9e5dc, { roughness: .9 }), { amp: .35, s1: 6, bump: .004 });
  [[0, -5.6, 14.4, .08], [-7.2, .6, .08, 12.4], [7.2, .6, .08, 12.4]].forEach(([x, z, w, d]) => add(box(w, .55, d, fenceM, x, .19, z), 'ext', { fence: 1 }));
  [[-4.6, 6.6, 5], [4.6, 6.6, 5]].forEach(([x, z, w]) => add(box(w, .55, .08, fenceM, x, .19, z), 'ext', { fence: 1 }));
  const ringPts = []; const rr = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(5);
  for (let n = 0; n < (small ? 500 : 1100); n++) { const a = rr() * 6.283, r = 10 + Math.pow(rr(), .7) * 48, x = Math.cos(a) * r, z = Math.sin(a) * r * .85; if (z > 6.2 && z < 11.2) continue; if (NZ.fbm(x * .1, z * .1, 2) < -.12 && r < 25) continue; ringPts.push([x, z, 1.8 + rr() * 1.8]); }
  for (let x = -30; x <= 30; x += 4.2) if (Math.abs(x) > 2.5) ringPts.push([x + rr(), 10.5, 1.6 + rr() * .6]);
  const fcm = new THREE.InstancedMesh(canopy, leafMat, ringPts.length), ftm = new THREE.InstancedMesh(trunkG, barkMat, ringPts.length);
  ringPts.forEach(([x, z, s], n) => { const r = Math.hypot(x, z * 1.2), y = -.08 + ease((r - 22) / 70) * (4 + 10 * (NZ.fbm(x * .02 + 4, z * .02, 3) + .4)); M4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr() * 6), new THREE.Vector3(s, s, s)); fcm.setMatrixAt(n, M4); ftm.setMatrixAt(n, M4); fcm.setColorAt(n, col(greens[n % greens.length]).multiplyScalar(.85 + rr() * .3)); });
  fcm.castShadow = ftm.castShadow = true; scene.add(fcm, ftm);

  const FH = 1.35, SL = .14, WT = .14;
  /* estrutura */
  const conc = 0xc3c6ce;
  const colsG = [-3.4, 0, 3.4], rowsG = [-2.4, 0, 2.4], colsU = [-1, 1.2, 3.4];
  colsG.forEach(x => rowsG.forEach(z => {
    add(B(.5, .3, .5, conc, x, -.32, z), 'str', { found: 1 });
    add(B(.18, FH, .18, conc, x, FH / 2, z), 'str');
  }));
  colsU.forEach(x => rowsG.forEach(z => add(B(.18, FH, .18, conc, x, FH + SL + FH / 2, z), 'str', { upper: 1 })));
  add(B(7.2, SL, 5.2, conc, 0, SL / 2 - .02, 0), 'str', { slab0: 1 });
  add(B(7.2, SL, 5.2, conc, 0, FH + SL / 2, 0), 'str', { slab1: 1 });
  add(B(4.8, SL, 5.2, conc, 1.2, 2 * FH + SL * 1.5, 0), 'str', { upper: 1, roof: 1 });
  [-2.4, 0, 2.4].forEach(z => { add(B(7, .22, .16, conc, 0, FH - .1, z), 'str'); add(B(4.6, .22, .16, conc, 1.2, 2 * FH + SL - .1, z), 'str', { upper: 1 }); });
  colsG.forEach(x => { add(B(.16, .22, 5, conc, x, FH - .1, 0), 'str'); });

  /* arquitetura: paredes com aberturas */
  const wallC = 0xf3f1ec, glassC = 0x3d5288;
  const wallRun = (len, h, y0, ops, place, flags) => {
    let x = 0; const segs = [];
    const piece = (a, b, yA, yB) => { if (b - a > .01 && yB - yA > .01) segs.push([a, b, yA, yB]); };
    ops.forEach(([s, w, sill, head]) => {
      piece(x, s, 0, h); piece(s, s + w, 0, sill); piece(s, s + w, head, h);
      add(place(B(w, head - sill, .04, glassC, 0, 0, 0), s + w / 2, y0 + (sill + head) / 2), 'arq', Object.assign({ glass: 1 }, flags));
      x = s + w;
    });
    piece(x, len, 0, h);
    segs.forEach(([a, b, yA, yB]) => add(place(B(b - a, yB - yA, WT, flags.clad ? WOODCLAD : wallC, 0, 0, 0), (a + b) / 2, y0 + (yA + yB) / 2), 'arq', flags));
  };
  const alongX = (x0, z) => (m, cx, cy) => { m.position.set(x0 + cx, cy, z); return m; };
  const alongZ = (x, z0) => (m, cx, cy) => { m.rotation.y = Math.PI / 2; m.position.set(x, cy, z0 + cx); return m; };
  const y1 = SL, y2 = FH + SL;
  wallRun(7, FH - SL, y1, [[.6, 2.6, .05, 1.1], [4.2, 1.6, .5, 1.05]], alongX(-3.5, 2.5), { front: 1 });
  wallRun(7, FH - SL, y1, [[1.2, 1.2, .6, 1.05], [4.6, .8, .7, 1.05]], alongX(-3.5, -2.5), {});
  wallRun(5, FH - SL, y1, [[1.6, 1.8, .4, 1.05]], alongZ(-3.5, -2.5), { left: 1 });
  wallRun(5, FH - SL, y1, [[1.4, 1.2, .5, 1.05]], alongZ(3.5, -2.5), {});
  wallRun(4.6, FH, y2, [[.4, 3.8, .35, 1.1]], alongX(-1.1, 2.5), { upper: 1, front: 1, clad: 1 });
  wallRun(4.6, FH, y2, [[1.0, 1.0, .6, 1.1], [3.0, .7, .75, 1.1]], alongX(-1.1, -2.5), { upper: 1 });
  wallRun(5, FH, y2, [[1.8, 1.4, .4, 1.1]], alongZ(-1.1, -2.5), { upper: 1, left: 1 });
  wallRun(5, FH, y2, [], alongZ(3.5, -2.5), { upper: 1, clad: 1 });
  add(B(.1, FH - SL, 2.4, wallC, 1.1, y1 + (FH - SL) / 2, -1.25), 'arq', { part: 1 });
  add(B(.1, FH, 2.6, wallC, 2.0, y2 + FH / 2, -1.2), 'arq', { upper: 1, part: 1 });
  /* platibanda, guarda-corpo e cobertura */
  add(B(4.8, .28, .1, wallC, 1.2, 2 * FH + 2 * SL + .12, 2.55), 'arq', { upper: 1, roof: 1 });
  add(B(4.8, .28, .1, wallC, 1.2, 2 * FH + 2 * SL + .12, -2.55), 'arq', { upper: 1, roof: 1 });
  add(B(.1, .28, 5.2, wallC, -1.15, 2 * FH + 2 * SL + .12, 0), 'arq', { upper: 1, roof: 1 });
  add(B(.1, .28, 5.2, wallC, 3.55, 2 * FH + 2 * SL + .12, 0), 'arq', { upper: 1, roof: 1 });
  add(B(2.3, .45, .03, 0x9fb6e8, -2.3, y2 + .25, 2.55, { roughness: .1, metalness: .2, opacity: .5 }), 'arq', { glass: 1 });
  add(B(.03, .45, 5.0, 0x9fb6e8, -3.55, y2 + .25, 0, { roughness: .1, metalness: .2 }), 'arq', { glass: 1, left: 1 });
  add(B(1.0, .95, .2, 0x1f2742, 3.0, y1 + .47, 2.5), 'arq', { front: 1 });

  /* instalações elétricas */
  const ELE = 0xf2c14e;
  const eMat = { emissive: 0x7a5a00, emissiveIntensity: .6, roughness: .4 };
  const tube = (pts, c, r, cat, mo) => {
    const path = new THREE.CurvePath(); for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i - 1]), new THREE.Vector3(...pts[i])));
    return add(new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 8, r, 6, false), std(c, mo)), cat);
  };
  add(B(.4, .55, .12, 0x8a8f9c, 2.9, y1 + .75, -2.38, { metalness: .5 }), 'ele');
  const cy1 = FH - .08, cy2 = 2 * FH + SL - .08;
  tube([[2.9, y1 + 1.0, -2.3], [2.9, cy1, -2.3], [-2.6, cy1, -2.3], [-2.6, cy1, 1.5], [1.8, cy1, 1.5], [1.8, cy1, -1.0]], ELE, .05, 'ele', eMat);
  tube([[2.9, y1 + 1.0, -2.3], [3.3, y1 + 1.0, -2.3], [3.3, cy2, -2.3], [-.6, cy2, -2.3], [-.6, cy2, 1.6], [2.8, cy2, 1.6]], ELE, .05, 'ele', eMat);
  [[-2.6, cy1, -1.0], [-2.6, cy1, 1.0], [-.4, cy1, 1.5], [1.8, cy1, 1.5], [1.8, cy1, -.6], [-.6, cy2, -1.2], [-.6, cy2, 1.0], [1.4, cy2, 1.6], [2.8, cy2, 1.6]].forEach(p => {
    add(new THREE.Mesh(new THREE.SphereGeometry(.13, 14, 10), std(0xfff3c4, { emissive: 0xffd36b, emissiveIntensity: 1.6 })), 'ele').position.set(...p);
  });
  [[-3.35, .5, -1.2], [-3.35, .5, 1.0], [3.35, .5, .8], [-.9, FH + .55, 1.2]].forEach(([x, y, z]) => {
    tube([[x, cy1 - (y > FH ? -FH - SL : 0), z], [x, y, z]], ELE, .025, 'ele', eMat);
    add(B(.05, .1, .1, 0xf7f4ea, x, y, z), 'ele');
  });

  /* instalações hidrossanitárias */
  const AF = 0x4aa3ff, AQ = 0xff8a4c, ES = 0x9c8a7a;
  const wMat = { emissive: 0x0b3b80, emissiveIntensity: .5, roughness: .35 };
  const tank = add(new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .6, 24), std(0xdfe7f5, { roughness: .4 })), 'hid');
  tank.position.set(2.6, 2 * FH + 2 * SL + .32, -1.7);
  tube([[2.6, 2 * FH + 2 * SL + .1, -1.7], [3.25, 2 * FH + 2 * SL + .1, -1.7], [3.25, .35, -1.7], [3.25, .35, -2.25], [1.5, .35, -2.25], [1.5, .9, -2.25]], AF, .065, 'hid', wMat);
  tube([[3.25, y2 + .3, -1.7], [2.4, y2 + .3, -1.7], [2.4, y2 + .3, -.6], [2.4, y2 + .9, -.6]], AF, .065, 'hid', wMat);
  tube([[3.25, y2 + .5, -1.4], [2.7, y2 + .5, -1.4], [2.7, y2 + .5, -.3], [2.7, y2 + .9, -.3]], AQ, .06, 'hid', { emissive: 0x7a2a00, emissiveIntensity: .5 });
  tube([[2.6, y2 + .1, -.4], [2.6, -.05, -.4], [2.6, -.05, -3.2], [4.4, -.05, -3.2]], ES, .085, 'hid');
  tube([[1.4, y1 + .1, -2.2], [1.4, -.05, -2.2], [1.4, -.05, -3.2]], ES, .085, 'hid');
  add(B(.5, .3, .5, 0x7d7368, 4.4, -.02, -3.2), 'hid');
  tube([[3.55, 2 * FH + 2 * SL, 2.6], [3.62, .1, 2.6], [4.2, .1, 2.6]], 0xb8bcc6, .05, 'hid');

  /* interiores */
  const wood = 0xb08a5e, fabric = 0x34477a, light = 0xe9e4da;
  const I = (w, h, d, c, x, y, z, mo) => add(B(w, h, d, c, x, y, z, mo), 'int');
  I(2.2, .02, 1.6, 0xd9c79b, -2.1, y1 + .01, .9);
  I(2.0, .32, .7, fabric, -2.2, y1 + .2, 1.75); I(2.0, .32, .18, fabric, -2.2, y1 + .45, 2.05); I(.7, .32, 1.4, fabric, -3.0, y1 + .2, 1.0);
  I(.8, .16, .5, wood, -1.9, y1 + .1, .8);
  I(1.3, .06, .8, wood, .3, y1 + .62, .7); [-.35, .35].forEach(dx => [.25, 1.15].forEach(z => I(.3, .4, .3, 0x2b3552, .3 + dx, y1 + .2, z)));
  I(2.0, .7, .5, light, .5, y1 + .35, -2.1); I(2.0, .06, .55, wood, .5, y1 + .72, -2.1);
  I(.06, .3, .06, GOLD, .3, FH - .25, .7, { metalness: .6, emissive: 0x5a4200 });
  I(1.5, .3, 1.9, light, 0, y2 + .17, .9); I(1.5, .45, .1, wood, 0, y2 + .35, -.08); I(1.5, .05, .9, fabric, 0, y2 + .34, 1.4);
  I(1.2, 1.0, .5, wood, -.3, y2 + .5, -2.1);
  I(.9, .05, .5, wood, 3.0, y2 + .55, 1.9); I(.35, .45, .35, 0x2b3552, 3.0, y2 + .22, 1.45);

  /* externo: deck, piscina, árvores */
  add(B(3.2, .08, 1.6, 0xa77c4f, -1.6, .02, 3.6), 'ext');
  add(B(3.0, .1, 1.5, 0xd6d9e0, -1.2, .03, 5.2), 'ext');
  add(B(2.7, .04, 1.2, 0x3aa0e8, -1.2, .09, 5.2, { emissive: 0x0f5ea8, emissiveIntensity: .5, roughness: .1 }), 'ext');
  [[-5.6, 1.4], [-5.5, -2.6], [5.6, 2.6], [5.5, -1.6], [2.6, 5.2], [-5.8, 4.8]].forEach(([x, z], n) => { const g = new THREE.Group(); const lm = leafMat.clone(); lm.color.set(greens[n % greens.length]); lm.onBeforeCompile = leafMat.onBeforeCompile; lm.customProgramCacheKey = leafMat.customProgramCacheKey; const c = new THREE.Mesh(canopy, lm), t = new THREE.Mesh(trunkG, barkMat.clone()); g.add(c, t); g.position.set(x, -.08, z); g.scale.setScalar(2.4 + (n % 3) * .4); add(g, 'ext'); });

  /* modos por disciplina */
  const MODES = {
    arq: m => ({ str: [1, 0], arq: [1, 0], ele: [0, 0], hid: [0, 0], int: [0, 0], ext: [1, 0] })[m.userData.cat],
    str: m => ({ str: [1, 1], arq: [.07, 0], ele: [0, 0], hid: [0, 0], int: [0, 0], ext: [.15, 0] })[m.userData.cat],
    ele: m => ({ str: [.1, 0], arq: [.09, 0], ele: [1, 0], hid: [0, 0], int: [0, 0], ext: [.15, 0] })[m.userData.cat],
    hid: m => ({ str: [.1, 0], arq: [.09, 0], ele: [0, 0], hid: [1, 0], int: [0, 0], ext: [.15, 0] })[m.userData.cat],
    r3d: m => ({ str: [1, 0], arq: [1, 0], ele: [0, 0], hid: [m.userData.found === undefined && m.geometry.type === 'CylinderGeometry' ? 1 : 0, 0], int: [1, 0], ext: [1, 0] })[m.userData.cat],
    int: m => {
      const u = m.userData;
      if (u.cat === 'int') return [1, 0];
      if (u.upper || u.roof || u.slab1) return [0, 0];
      if (u.cat === 'arq') return (u.front || u.left) ? [.06, 0] : [1, 0];
      if (u.cat === 'str') return u.found ? [0, 0] : [1, 0];
      if (u.cat === 'ext') return [.5, 0];
      return [0, 0];
    }
  };
  const goldC = col(GOLD);
  let mode = 'r3d';
  const elev = { cur: .3, tgt: .3 };
  function setMode(m) { mode = m; elev.tgt = m === 'int' ? .95 : (m === 'str' || m === 'ele' || m === 'hid') ? .5 : .3; }
  function step(k) {
    items.forEach(m => {
      const tech = mode === 'str' || mode === 'ele' || mode === 'hid';
      const [op, mix] = m.userData.keep ? [1, tech ? .8 : 0] : (MODES[mode](m) || [0, 0]);
      const u = m.userData; u.op += (op - u.op) * k; u.mix += (mix - u.mix) * k;
      const mat = m.material;
      mat.opacity = u.glass ? Math.min(u.op, .78) : u.op;
      const tr = !!u.glass || u.op < .995; if (tr !== mat.transparent) { mat.transparent = tr; mat.needsUpdate = true; }
      mat.depthWrite = u.op > .6;
      m.visible = u.op > .015;
      mat.color.copy(u.base).lerp(u.hi || goldC, u.mix * .85);
    });
    elev.cur += (elev.tgt - elev.cur) * k;
  }

  const orbit = { drag: 0, onInteract: o.onInteract }; dragOrbit(canvas, orbit);
  const target = new THREE.Vector3(.2, 1.4, .4);
  let dist = 20;
  function resize() {
    const r = host.getBoundingClientRect(), W = Math.max(1, r.width), H = Math.max(1, r.height);
    renderer.setSize(W, H, false); camera.aspect = W / H;
    const wide = !!o.shift && W >= 900;
    if (wide) camera.setViewOffset(W, H, -W * o.shift, 0, W, H); else camera.clearViewOffset();
    const aspect = wide ? W * (1 - 2 * o.shift) / H : camera.aspect;
    const R = 6.4, vf = THREE.MathUtils.degToRad(camera.fov / 2), hf = Math.atan(Math.tan(vf) * aspect);
    dist = R / Math.sin(Math.min(vf, hf)) * (wide ? 1.16 : (o.shift ? 1.12 : 1.0)); camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();
  let time = 0, first = true;
  step(1);
  loopWhenVisible(host, dt => {
    time += dt; step(Math.min(1, dt * 5));
    const az = -.55 + .22 * Math.sin(time * .13) + orbit.drag, el = elev.cur;
    camera.position.set(target.x + dist * Math.sin(az) * Math.cos(el), target.y + dist * Math.sin(el), target.z + dist * Math.cos(az) * Math.cos(el));
    camera.lookAt(target);
    renderer.render(scene, camera);
    if (first) { first = false; o.onReady && o.onReady(); }
  });
  return { setMode, reduce: false };
}
