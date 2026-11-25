/* Sales Engenharia: cenas 3D do site (three.js r170, MIT) */
import * as THREE from './three.module.min.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lerp = (a, b, t) => a + (b - a) * t;
const col = h => new THREE.Color(h);
const GOLD = 0xC7AB69, NAVY = 0x2B3B66;

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

function makeRenderer(canvas, small) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.localClippingEnabled = true;
  return r;
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .8, metalness: 0 }, o));

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}

function tree(scale, canopyColor) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, .32, 6), std(0x6b5a48, { roughness: 1 }));
  trunk.position.y = .16; trunk.castShadow = true;
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 0), std(canopyColor, { roughness: 1, flatShading: true }));
  top.position.y = .42; top.scale.set(1, 1.15, 1); top.castShadow = true; top.receiveShadow = true;
  g.add(trunk, top); g.scale.setScalar(scale);
  return g;
}

/* Controle de órbita por arraste, sem bloquear a rolagem vertical no celular */
function dragOrbit(el, state) {
  let down = false, x0 = 0, a0 = 0;
  el.addEventListener('pointerdown', e => { down = true; x0 = e.clientX; a0 = state.drag; el.setPointerCapture(e.pointerId); state.onInteract && state.onInteract(); });
  el.addEventListener('pointermove', e => { if (down) state.drag = a0 + (e.clientX - x0) * .006; });
  const up = () => { down = false; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

function loopWhenVisible(el, tick) {
  let visible = false, raf = 0, last = performance.now();
  const frame = now => { const dt = Math.min(.05, (now - last) / 1000); last = now; tick(dt, now / 1000); raf = requestAnimationFrame(frame); };
  const start = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? start() : stop(); }, { threshold: .05 });
  io.observe(el);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  return { kick: () => { stop(); start(); } };
}

/* =====================================================================
   CENA 1: do terreno natural à obra pronta
   ===================================================================== */
export function heroScene(o) {
  if (!webglOk()) return null;
  const { canvas, host, onStage } = o;
  const small = window.innerWidth < 700;
  const renderer = makeRenderer(canvas, small);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 200);

  scene.add(new THREE.HemisphereLight(0xe2e8ff, 0x1c2550, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.7);
  sun.position.set(-7, 12, 9); sun.castShadow = true;
  const sm = small ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x8fa7ff, .7); rim.position.set(9, 5, -8); scene.add(rim);

  /* ---------- terreno ---------- */
  const S = 10, N = small ? 110 : 150, n1 = N + 1, COUNT = n1 * n1, BASE = -.85;
  const U0 = .14, U1 = .86, V0 = .2, V1 = .82, zA = .4, zB = .85;
  const nat = (u, v) =>
    1.7 * Math.exp(-((u - .32) ** 2 + (v - .05) ** 2) / .055)
    + 1.45 * Math.exp(-((u - .76) ** 2 + (v - .03) ** 2) / .05)
    + .30 * Math.exp(-((u - .12) ** 2 + (v - .78) ** 2) / .025)
    + .10 * Math.sin(u * 7 + 1) * Math.cos(v * 6)
    + .55 * (1 - v) + .18 * u
    - .25 * Math.exp(-((u - .6) ** 2 + (v - .96) ** 2) / .02);
  const design = wall => {
    const w = wall ? .004 : .04;
    const plat = u => zA + clamp((u - (.5 - w)) / (2 * w)) * (zB - zA);
    return (u, v) => {
      const cu = clamp(u, U0, U1), cv = clamp(v, V0, V1);
      const d = Math.hypot(u - cu, v - cv) * S, p = plat(cu), n = nat(u, v);
      if (d === 0) return p;
      const s = (wall && v < V0 && p < n) ? 60 : 1;
      return p > n ? Math.max(n, p - s * d) : Math.min(n, p + s * d);
    };
  };
  const f1 = design(false), f2 = design(true);
  const NAT = new Float32Array(COUNT), D1 = new Float32Array(COUNT), D2 = new Float32Array(COUNT), NOISE = new Float32Array(COUNT);
  const INSIDE = new Uint8Array(COUNT);
  for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
    const k = j * n1 + i, u = i / N, v = j / N;
    NAT[k] = nat(u, v); D1[k] = f1(u, v); D2[k] = f2(u, v);
    NOISE[k] = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
    INSIDE[k] = (u >= U0 && u <= U1 && v >= V0 && v <= V1) ? 1 : 0;
  }
  const pos = new Float32Array(COUNT * 3), clr = new Float32Array(COUNT * 3);
  for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
    const k = j * n1 + i; pos[3 * k] = (i / N - .5) * S; pos[3 * k + 1] = NAT[k]; pos[3 * k + 2] = (j / N - .5) * S;
  }
  const index = new Uint32Array(N * N * 6); let q = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * n1 + i, b = a + 1, c = a + n1, d = c + 1;
    index[q++] = a; index[q++] = c; index[q++] = b; index[q++] = b; index[q++] = c; index[q++] = d;
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
  tgeo.setIndex(new THREE.BufferAttribute(index, 1));
  const terrain = new THREE.Mesh(tgeo, std(0xffffff, { vertexColors: true, roughness: .95 }));
  terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);

  const cLow = col(0x6d8a5c), cHigh = col(0xa9b083), cCut = col(0xd4ac5e), cFill = col(0x8fa8e0), cGrass = col(0x7f9d62), tmp = new THREE.Color();
  let mn = 9, mx = -9; for (let k = 0; k < COUNT; k++) { mn = Math.min(mn, NAT[k]); mx = Math.max(mx, NAT[k]); }

  /* saias laterais com camadas do solo */
  const perim = [];
  for (let i = 0; i <= N; i++) perim.push(N * n1 + i);
  for (let j = N; j >= 0; j--) perim.push(j * n1 + N);
  for (let i = N; i >= 0; i--) perim.push(i);
  for (let j = 0; j <= N; j++) perim.push(j * n1);
  const layers = [[0, 0x4a3a2a], [-.14, 0x9c7346], [-.42, 0xc6a170], [-.62, 0x8e8576], [-.9, 0x6f7381]];
  const P = perim.length, sPos = new Float32Array(P * 5 * 3), sCol = new Float32Array(P * 5 * 3), sIdx = [];
  perim.forEach((k, p) => {
    layers.forEach(([, hex], L) => { const c = col(hex); sCol.set([c.r, c.g, c.b], (p * 5 + L) * 3); });
    if (p > 0) for (let L = 0; L < 4; L++) { const a = (p - 1) * 5 + L, b = p * 5 + L; sIdx.push(a, b, a + 1, b, b + 1, a + 1); }
  });
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sgeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  sgeo.setIndex(sIdx);
  const skirt = new THREE.Mesh(sgeo, std(0xffffff, { vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  skirt.receiveShadow = true; scene.add(skirt);
  const updateSkirt = () => {
    perim.forEach((k, p) => {
      const x = pos[3 * k], z = pos[3 * k + 2], top = pos[3 * k + 1];
      const ys = [top, top - .14, Math.min(top - .2, -.2), Math.min(top - .3, -.5), BASE];
      ys.forEach((y, L) => sPos.set([x, y, z], (p * 5 + L) * 3));
    });
    sgeo.attributes.position.needsUpdate = true; sgeo.computeVertexNormals();
  };

  /* base da maquete */
  const plinth = box(S + .7, .32, S + .7, std(0x1a2349, { roughness: .55, metalness: .25 }), 0, BASE - .16, 0);
  plinth.castShadow = false; scene.add(plinth);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(S + .7, .32, S + .7)), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: .55 }));
  edge.position.copy(plinth.position); scene.add(edge);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .28 }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = BASE - .33; catcher.receiveShadow = true; scene.add(catcher);

  /* malha do modelo digital do terreno */
  const GS = 10, gl = [];
  for (let j = 0; j <= N; j += GS) for (let i = 0; i < N; i++) gl.push(j * n1 + i, j * n1 + i + 1);
  for (let i = 0; i <= N; i += GS) for (let j = 0; j < N; j++) gl.push(j * n1 + i, (j + 1) * n1 + i);
  const gPos = new Float32Array(gl.length * 3);
  const ggeo = new THREE.BufferGeometry(); ggeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  const gmat = new THREE.LineBasicMaterial({ color: 0xf3e2b5, transparent: true, opacity: .32, depthWrite: false });
  const grid = new THREE.LineSegments(ggeo, gmat); scene.add(grid);
  const updateGrid = () => { gl.forEach((k, n) => gPos.set([pos[3 * k], pos[3 * k + 1] + .012, pos[3 * k + 2]], n * 3)); ggeo.attributes.position.needsUpdate = true; };

  let last = { e1: -1, e2: -1, g: -1 };
  function setTerrain(e1, e2, green) {
    if (Math.abs(e1 - last.e1) < 1e-4 && Math.abs(e2 - last.e2) < 1e-4 && Math.abs(green - last.g) < 1e-4) return;
    last = { e1, e2, g: green };
    for (let k = 0; k < COUNT; k++) {
      const tgt = D1[k] + (D2[k] - D1[k]) * e2;
      const h = NAT[k] + (tgt - NAT[k]) * e1;
      pos[3 * k + 1] = h;
      const hf = clamp((NAT[k] - mn) / (mx - mn));
      tmp.copy(cLow).lerp(cHigh, hf * .8 + NOISE[k] * .12);
      const diff = (tgt - NAT[k]) * e1, a = clamp((Math.abs(diff) - .01) * 14);
      if (a > 0) {
        tmp.lerp(diff < 0 ? cCut : cFill, a);
        if (!INSIDE[k]) tmp.lerp(cGrass, green * a);
      }
      clr[3 * k] = tmp.r; clr[3 * k + 1] = tmp.g; clr[3 * k + 2] = tmp.b;
    }
    tgeo.attributes.position.needsUpdate = true; tgeo.attributes.color.needsUpdate = true;
    tgeo.computeVertexNormals(); updateSkirt(); updateGrid();
  }

  /* ---------- contenções ---------- */
  const wallPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const concrete = std(0xc9ccd4, { roughness: .82, clippingPlanes: [wallPlane], clipShadows: true });
  const zW = (V0 - .5) * S, M = 90, wp = [], wi = [];
  const tops = [], bots = [];
  for (let m = 0; m <= M; m++) {
    const u = U0 + (U1 - U0) * m / M, x = (u - .5) * S;
    const bot = u < .5 ? zA : zB, top = Math.max(bot + .14, nat(u, V0 - .004) + .04);
    tops.push(top); bots.push(bot);
    wp.push(x, bot - .05, zW + .005, x, top, zW + .005, x, top, zW - .16);
    if (m > 0) { const a = (m - 1) * 3, b = m * 3; wi.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2); }
  }
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wgeo.setIndex(wi); wgeo.computeVertexNormals();
  const cortina = new THREE.Mesh(wgeo, concrete); cortina.castShadow = true; cortina.receiveShadow = true; scene.add(cortina);
  /* tirantes: placas e cabeças */
  const anchors = [];
  for (let m = 0; m <= M; m += 4) {
    const u = U0 + (U1 - U0) * m / M, x = (u - .5) * S;
    for (let y = bots[m] + .32; y < tops[m] - .16; y += .36) anchors.push([x, y]);
  }
  const plateG = new THREE.BoxGeometry(.13, .13, .03), headG = new THREE.CylinderGeometry(.035, .035, .06, 10);
  headG.rotateX(Math.PI / 2);
  const plates = new THREE.InstancedMesh(plateG, std(0x9aa0ad, { roughness: .6, clippingPlanes: [wallPlane], clipShadows: true }), anchors.length);
  const heads = new THREE.InstancedMesh(headG, std(GOLD, { roughness: .35, metalness: .7, clippingPlanes: [wallPlane], clipShadows: true }), anchors.length);
  const mtx = new THREE.Matrix4();
  anchors.forEach(([x, y], n) => { mtx.makeTranslation(x, y, zW + .02); plates.setMatrixAt(n, mtx); mtx.makeTranslation(x, y, zW + .05); heads.setMatrixAt(n, mtx); });
  plates.castShadow = heads.castShadow = true; scene.add(plates, heads);
  /* muro de arrimo entre as plataformas */
  const muroL = (V1 - V0) * S;
  const muro = box(.16, zB - zA + .45, muroL, concrete, -.05, (zA - .2 + zB + .25) / 2, (V0 + V1 - 1) / 2 * S);
  scene.add(muro);
  const capMat = std(GOLD, { roughness: .4, metalness: .5, clippingPlanes: [wallPlane], clipShadows: true });
  const cap = box(.2, .03, muroL, capMat, -.05, zB + .265, muro.position.z); scene.add(cap);

  /* ---------- drenagem e pavimentação ---------- */
  const infra = new THREE.Group(); scene.add(infra);
  const fadeMats = [];
  const fm = m => { m.transparent = true; m.opacity = 0; fadeMats.push(m); return m; };
  const paverTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8f8a80'; g.fillRect(0, 0, w, h);
    const bw = 32, bh = 16;
    for (let r = 0; r < h / bh; r++) for (let c = -1; c < w / bw + 1; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh, l = 170 + ((r * 7 + c * 13) % 5) * 6;
      g.fillStyle = `rgb(${l},${l - 4},${l - 12})`; g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }, [6, 10]);
  const paverW = (.49 - U0) * S - .25, paverD = (V1 - V0) * S - .3;
  const paver = box(paverW, .05, paverD, fm(std(0xffffff, { map: paverTex, roughness: .9 })), ((U0 + .49) / 2 - .5) * S - .02, zA + .02, (V0 + V1 - 1) / 2 * S);
  paver.castShadow = false; infra.add(paver);
  const asphaltTex = canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#2d313c'; g.fillRect(0, 0, w, h);
    for (let n = 0; n < 9000; n++) { const v = 40 + Math.random() * 25; g.fillStyle = `rgb(${v},${v + 2},${v + 8})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = '#e9ecf2'; g.lineWidth = 5;
    g.setLineDash([36, 28]); g.beginPath(); g.moveTo(w / 2, 20); g.lineTo(w / 2, h - 20); g.stroke(); g.setLineDash([]);
    for (let y = 70; y < h - 60; y += 74) { g.beginPath(); g.moveTo(0, y); g.lineTo(w * .3, y); g.moveTo(w, y); g.lineTo(w * .7, y); g.stroke(); }
    g.strokeStyle = '#C7AB69'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
  });
  const asphW = (U1 - .51) * S - .2, asphD = (V1 - V0) * S - .3;
  const asphalt = box(asphW, .05, asphD, fm(std(0xffffff, { map: asphaltTex, roughness: .7 })), ((U1 + .51) / 2 - .5) * S, zB + .02, (V0 + V1 - 1) / 2 * S);
  asphalt.castShadow = false; infra.add(asphalt);
  const channelMat = fm(std(0x9aa0ad, { roughness: .7 })), waterMat = fm(std(0x3d8bff, { emissive: 0x1d5bd6, emissiveIntensity: .8, roughness: .2 }));
  const chan = (x0, x1, y, z) => { const L = x1 - x0, cx = (x0 + x1) / 2; infra.add(box(L, .05, .2, channelMat, cx, y + .02, z), box(L, .02, .09, waterMat, cx, y + .05, z)); };
  chan((U0 - .5) * S + .05, -.15, zA, zW + .16); chan(.08, (U1 - .5) * S - .05, zB, zW + .16);
  chan((U0 - .5) * S + .05, -.15, zA, (V1 - .5) * S - .1); chan(.08, (U1 - .5) * S - .05, zB, (V1 - .5) * S - .1);
  const grateMat = fm(std(0x1d2230, { roughness: .5, metalness: .4 }));
  for (let z = -2.4; z <= 2.6; z += 1.25) { infra.add(box(.22, .04, .14, grateMat, .25, zB + .05, z), box(.22, .04, .14, grateMat, -.35, zA + .05, z)); }

  /* ---------- edificações ---------- */
  const bPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), cPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const steel = std(GOLD, { roughness: .35, metalness: .55, clippingPlanes: [bPlane], clipShadows: true });
  const white = std(0xeef0f5, { roughness: .55, clippingPlanes: [cPlane], clipShadows: true });
  const roofM = std(NAVY, { roughness: .45, metalness: .2, clippingPlanes: [cPlane], clipShadows: true });
  const glass = std(0x40558e, { roughness: .12, metalness: .55, emissive: 0x0b1433, clippingPlanes: [cPlane], clipShadows: true });
  const dark = std(0x1f2742, { roughness: .5, clippingPlanes: [cPlane], clipShadows: true });
  const bld = new THREE.Group(); scene.add(bld);
  /* galpão na plataforma inferior */
  const gx = -1.9, gz = .25, gw = 2.3, gd = 3.6, ge = 1.0, gr = 1.38, gy = zA + .04;
  for (let z = -gd / 2; z <= gd / 2 + 1e-6; z += gd / 4) {
    for (const sx of [-1, 1]) bld.add(box(.07, ge, .07, steel, gx + sx * gw / 2, gy + ge / 2, gz + z));
    const raf = Math.hypot(gw / 2, gr - ge);
    for (const sx of [-1, 1]) { const r = box(raf, .05, .05, steel, gx + sx * gw / 4, gy + (ge + gr) / 2, gz + z); r.rotation.z = -sx * Math.atan2(gr - ge, gw / 2); bld.add(r); }
    bld.add(box(gw, .04, .04, steel, gx, gy + ge, gz + z));
  }
  for (const sx of [-1, 0, 1]) bld.add(box(.05, .05, gd, steel, gx + sx * gw / 2, gy + (sx ? ge : gr), gz));
  bld.add(box(gw - .04, ge, gd - .04, white, gx, gy + ge / 2, gz));
  for (const z of [-.9, .5]) bld.add(box(.03, .62, .7, dark, gx - gw / 2 - .02, gy + .31, gz + z));
  bld.add(box(.03, .14, gd - .2, glass, gx - gw / 2 - .02, gy + ge - .14, gz));
  const slope = Math.atan2(gr - ge, gw / 2), rw = Math.hypot(gw / 2, gr - ge) + .12;
  for (const sx of [-1, 1]) { const r = box(rw, .04, gd + .24, roofM, gx + sx * gw / 4, gy + (ge + gr) / 2 + .03, gz); r.rotation.z = -sx * slope; bld.add(r); }
  /* prédio na plataforma superior */
  const px = 2.25, pz = -1.05, pw = 1.9, pd = 2.3, fh = .56, nF = 4, py = zB + .04;
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) bld.add(box(.07, fh * nF, .07, steel, px + sx * (pw / 2 - .05), py + fh * nF / 2, pz + sz * (pd / 2 - .05)));
  for (let f = 1; f <= nF; f++) bld.add(box(pw, .04, pd, steel, px, py + f * fh - .02, pz));
  for (let f = 0; f < nF; f++) {
    const y0 = py + f * fh;
    bld.add(box(pw + .08, .08, pd + .08, white, px, y0 + .04, pz));
    bld.add(box(pw - .06, fh - .08, pd - .06, glass, px, y0 + .08 + (fh - .08) / 2, pz));
    for (let xx = -pw / 2 + .15; xx < pw / 2; xx += .3) bld.add(box(.04, fh - .08, .06, white, px + xx, y0 + .08 + (fh - .08) / 2, pz + pd / 2 - .01));
    for (let zz = -pd / 2 + .15; zz < pd / 2; zz += .3) bld.add(box(.06, fh - .08, .04, white, px - pw / 2 + .01, y0 + .08 + (fh - .08) / 2, pz + zz));
  }
  bld.add(box(pw + .08, .14, pd + .08, white, px, py + fh * nF + .07, pz));
  bld.add(box(.6, .3, .5, white, px + .4, py + fh * nF + .29, pz - .4));
  const top4 = py + fh * nF + .45;
  /* carros no estacionamento */
  const cars = new THREE.Group(); scene.add(cars);
  [[1.0, 1.4, 0xf2f2f2], [3.0, .6, NAVY], [1.0, 2.6, GOLD], [3.0, 2.0, 0xb8c0d0]].forEach(([x, z, c]) => {
    const g = new THREE.Group();
    g.add(box(.42, .12, .22, std(c, { roughness: .35, metalness: .4 }), 0, .1, 0), box(.24, .09, .19, std(0x2a3552, { roughness: .2, metalness: .5 }), -.02, .2, 0));
    g.position.set(x, zB + .05, z); g.rotation.y = Math.PI / 2; g.scale.setScalar(0); cars.add(g);
  });

  /* ---------- vegetação ---------- */
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
  const oldTrees = [], newTrees = [];
  for (let n = 0; n < (small ? 26 : 40); n++) {
    const u = .04 + rnd() * .92, v = .04 + rnd() * .92;
    const t = tree(.75 + rnd() * .5, rnd() > .5 ? 0x7f9a66 : 0x93a874);
    const k = Math.round(v * N) * n1 + Math.round(u * N);
    t.position.set((u - .5) * S, NAT[k], (v - .5) * S);
    t.userData.removed = Math.abs(D1[k] - NAT[k]) > .015 || Math.abs(D2[k] - NAT[k]) > .015;
    scene.add(t); oldTrees.push(t);
  }
  [[-3.4, 3.0], [-2.6, 3.05], [-.6, 3.0], [.4, 3.05], [3.4, 3.0], [-3.45, -2.4], [3.45, -2.5], [1.2, -2.5]].forEach(([x, z], n) => {
    const t = tree(.85, n % 2 ? 0x8fae73 : 0x7c9b63); t.position.set(x, x < 0 ? zA + .04 : zB + .04, z); t.scale.setScalar(0); t.userData.s = .85; scene.add(t); newTrees.push(t);
  });

  /* ---------- linha do tempo ---------- */
  const STAGES = [
    { t: 0, end: 2.6 }, { t: 2.6, end: 6.6 }, { t: 6.6, end: 10.2 }, { t: 10.2, end: 13.6 }, { t: 13.6, end: 19.5 }
  ];
  const END = 19.5, HOLD = 6;
  let T = reduce ? END : 0, playing = !reduce, stageNow = -1;
  function apply(T) {
    const e1 = ease((T - 2.6) / 3.6), e2 = ease((T - 6.8) / 3);
    const green = ease((T - 10.2) / 3);
    setTerrain(e1, e2, green);
    oldTrees.forEach(t => { if (t.userData.removed) t.scale.setScalar(Math.max(.0001, 1 - ease((T - 2.6) / .7)) * (t.userData.s0 || (t.userData.s0 = t.scale.x))); });
    const w = ease((T - 6.9) / 2.9);
    wallPlane.constant = lerp(zA - .3, 3.4, w);
    const vis = T > 6.9;
    cortina.visible = plates.visible = heads.visible = muro.visible = cap.visible = vis;
    const fi = ease((T - 10.3) / 2.2);
    fadeMats.forEach(m => { m.opacity = fi; m.transparent = fi < .999; m.depthWrite = fi > .5; });
    infra.visible = fi > .001; infra.position.y = (1 - fi) * .25;
    const sb = ease((T - 13.7) / 2.6), sc = ease((T - 15.6) / 3.2);
    bPlane.constant = lerp(zA - .05, top4 + .1, sb); cPlane.constant = lerp(zA - .05, top4 + .1, sc);
    bld.visible = T > 13.7;
    const ct = ease((T - 17.6) / 1.4); cars.children.forEach((c, n) => c.scale.setScalar(Math.max(.0001, ease((T - 17.4 - n * .25) / 1)))); cars.visible = ct > 0 || T > 17.4;
    newTrees.forEach((t, n) => t.scale.setScalar(Math.max(.0001, t.userData.s * ease((T - 17 - n * .12) / 1.2))));
    gmat.opacity = lerp(.32, .07, ease((T - 10.2) / 2));
    let s = STAGES.length - 1; while (s > 0 && T < STAGES[s].t) s--;
    const prog = clamp((T - STAGES[s].t) / (STAGES[s].end - STAGES[s].t));
    onStage && onStage(s, prog, s !== stageNow); stageNow = s;
  }

  /* ---------- câmera ---------- */
  const orbit = { drag: 0, onInteract: null }; dragOrbit(canvas, orbit);
  const target = new THREE.Vector3(0, .55, 0);
  let W = 0, H = 0, dist = 20, shiftX = 0;
  function resize() {
    const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    const wide = W >= 900;
    shiftX = wide ? W * .2 : 0;
    const effW = wide ? W * .6 : W, aspect = effW / H;
    camera.aspect = W / H;
    if (wide) camera.setViewOffset(W, H, -shiftX, 0, W, H); else camera.clearViewOffset();
    const R = 7.1, vf = THREE.MathUtils.degToRad(camera.fov / 2), hf = Math.atan(Math.tan(vf) * aspect);
    dist = R / Math.sin(Math.min(vf, hf)) * (wide ? 1.1 : .95);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();
  let time = 0;
  function placeCam() {
    const az = -.62 + (reduce ? 0 : .16 * Math.sin(time * .11)) + orbit.drag, el = .5;
    camera.position.set(target.x + dist * Math.sin(az) * Math.cos(el), target.y + dist * Math.sin(el), target.z + dist * Math.cos(az) * Math.cos(el));
    camera.lookAt(target);
  }
  let first = true;
  const loop = loopWhenVisible(host, (dt) => {
    time += dt;
    if (playing) { T += dt; if (T > END + HOLD) T = 0; }
    apply(Math.min(T, END));
    placeCam();
    renderer.render(scene, camera);
    if (first) { first = false; o.onReady && o.onReady(); }
  });
  apply(T); placeCam();
  return {
    stages: STAGES,
    seek(s) { T = reduce ? STAGES[s].end : STAGES[s].t; if (!reduce) playing = true; o.onPlay && o.onPlay(playing); loop.kick(); },
    toggle() { if (reduce) return false; if (!playing && T >= END) T = 0; playing = !playing; return playing; },
    get playing() { return playing; },
    reduce
  };
}

/* =====================================================================
   CENA 2: projeto de edificação por disciplina
   ===================================================================== */
export function houseScene(o) {
  if (!webglOk()) return null;
  const { canvas, host } = o;
  const small = window.innerWidth < 700;
  const renderer = makeRenderer(canvas, small);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 200);
  scene.add(new THREE.HemisphereLight(0xe8ecff, 0x1c2550, 1.2));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.position.set(-8, 14, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .02;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9db0ff, .6); rim.position.set(8, 6, -9); scene.add(rim);

  const items = [];
  const add = (mesh, cat, flags = {}) => {
    mesh.traverse(m => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.transparent = true;
      m.userData = Object.assign({ cat, base: m.material.color.clone(), op: 1, mix: 0 }, flags);
      m.castShadow = true; m.receiveShadow = true;
      items.push(m);
    });
    scene.add(mesh); return mesh;
  };
  const B = (w, h, d, c, x, y, z, mo) => box(w, h, d, std(c, mo || {}), x, y, z);

  /* base */
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(6.7, 6.7, .35, 96), std(0x1a2349, { roughness: .55, metalness: .25 }));
  plinth.position.y = -.3; plinth.receiveShadow = true; scene.add(plinth);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.7, .015, 6, 160), std(GOLD, { emissive: GOLD, emissiveIntensity: .3 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -.12; scene.add(ring);
  add(new THREE.Mesh(new THREE.CylinderGeometry(6.45, 6.45, .06, 96), std(0x7a9862, { roughness: 1 })), 'ext', { keep: 1, hi: col(0x243266) }).position.y = -.11;

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
      add(place(B(w, head - sill, .04, glassC, 0, 0, 0, { roughness: .1, metalness: .6, emissive: 0x0a1230 }), s + w / 2, y0 + (sill + head) / 2), 'arq', Object.assign({ glass: 1 }, flags));
      x = s + w;
    });
    piece(x, len, 0, h);
    segs.forEach(([a, b, yA, yB]) => add(place(B(b - a, yB - yA, WT, wallC, 0, 0, 0, { roughness: .7 }), (a + b) / 2, y0 + (yA + yB) / 2), 'arq', flags));
  };
  const alongX = (x0, z) => (m, cx, cy) => { m.position.set(x0 + cx, cy, z); return m; };
  const alongZ = (x, z0) => (m, cx, cy) => { m.rotation.y = Math.PI / 2; m.position.set(x, cy, z0 + cx); return m; };
  const y1 = SL, y2 = FH + SL;
  wallRun(7, FH - SL, y1, [[.6, 2.6, .05, 1.1], [4.2, 1.6, .5, 1.05]], alongX(-3.5, 2.5), { front: 1 });
  wallRun(7, FH - SL, y1, [[1.2, 1.2, .6, 1.05], [4.6, .8, .7, 1.05]], alongX(-3.5, -2.5), {});
  wallRun(5, FH - SL, y1, [[1.6, 1.8, .4, 1.05]], alongZ(-3.5, -2.5), { left: 1 });
  wallRun(5, FH - SL, y1, [[1.4, 1.2, .5, 1.05]], alongZ(3.5, -2.5), {});
  wallRun(4.6, FH, y2, [[.4, 3.8, .35, 1.1]], alongX(-1.1, 2.5), { upper: 1, front: 1 });
  wallRun(4.6, FH, y2, [[1.0, 1.0, .6, 1.1], [3.0, .7, .75, 1.1]], alongX(-1.1, -2.5), { upper: 1 });
  wallRun(5, FH, y2, [[1.8, 1.4, .4, 1.1]], alongZ(-1.1, -2.5), { upper: 1, left: 1 });
  wallRun(5, FH, y2, [], alongZ(3.5, -2.5), { upper: 1 });
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
  [[-5.0, 1.4], [-4.9, -2.3], [5.0, 2.6], [4.9, -1.2], [2.3, 5.1]].forEach(([x, z], n) => { const t = tree(2.2 + (n % 2) * .4, n % 2 ? 0x8fae73 : 0x7c9b63); t.position.set(x, -.08, z); add(t, 'ext'); });

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
  const elev = { cur: .5, tgt: .5 };
  function setMode(m) { mode = m; elev.tgt = m === 'int' ? .95 : (m === 'str' || m === 'ele' || m === 'hid') ? .62 : .5; if (reduce) step(1); }
  function step(k) {
    items.forEach(m => {
      const tech = mode === 'str' || mode === 'ele' || mode === 'hid';
      const [op, mix] = m.userData.keep ? [1, tech ? .8 : 0] : (MODES[mode](m) || [0, 0]);
      const u = m.userData; u.op += (op - u.op) * k; u.mix += (mix - u.mix) * k;
      const mat = m.material;
      mat.opacity = u.glass ? Math.min(u.op, .78) : u.op;
      mat.depthWrite = u.op > .6;
      m.visible = u.op > .015;
      mat.color.copy(u.base).lerp(u.hi || goldC, u.mix * .85);
    });
    elev.cur += (elev.tgt - elev.cur) * k;
  }

  const orbit = { drag: 0, onInteract: o.onInteract }; dragOrbit(canvas, orbit);
  const target = new THREE.Vector3(.2, 1.1, .4);
  let dist = 20;
  function resize() {
    const r = host.getBoundingClientRect(), W = Math.max(1, r.width), H = Math.max(1, r.height);
    renderer.setSize(W, H, false); camera.aspect = W / H;
    const R = 7.0, vf = THREE.MathUtils.degToRad(camera.fov / 2), hf = Math.atan(Math.tan(vf) * camera.aspect);
    dist = R / Math.sin(Math.min(vf, hf)) * .95; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();
  let time = 0, first = true;
  step(1);
  loopWhenVisible(host, dt => {
    time += dt; step(reduce ? 1 : Math.min(1, dt * 5));
    const az = -.55 + (reduce ? 0 : .22 * Math.sin(time * .13)) + orbit.drag, el = elev.cur;
    camera.position.set(target.x + dist * Math.sin(az) * Math.cos(el), target.y + dist * Math.sin(el), target.z + dist * Math.cos(az) * Math.cos(el));
    camera.lookAt(target);
    renderer.render(scene, camera);
    if (first) { first = false; o.onReady && o.onReady(); }
  });
  return { setMode, reduce };
}
