// FOGBOUND: DOMINION client models, core. A Rig is a merged, vertex-coloured geometry whose vertices carry
// aPart (animation part id), aPivot (vec3) and aTeam (0 plain, 1 team colour, 2 emissive). RigMaterial animates the
// parts in the vertex shader from per-instance attributes iAnim (vec4) and iTint (vec4), so one InstancedMesh = one draw.
// Convention: models face +x, Y up, origin on the ground (same as src/models.js).
// PART IDS: 0 static | 1,2 legs (swing A/B) | 3 right arm (attack swing) | 4 left arm | 5 cape sway | 6 wheel spin | 7 slide fwd on attack (pivot.x = reach, negative = recoil)
//   8 throw arm (catapult) | 9 wing flap | 11 gate door lift (pivot.x = lift, iAnim.x = open 0..1) | 12 turret yaw (iAnim.y = relative yaw) | 13 recoil (pivot.x, iAnim.z)
//   14 spin about Y | 15 float bob.   UNIT mode iAnim = (walkPhase, walkAmp, attackProgress 0..1, deathProgress); BLD mode iAnim = (open, turretYaw, recoil, damage).
import * as THREE from 'three';

export const FOG_U = {
  uFog: { value: null }, uFogRect: { value: new THREE.Vector4(-200, -200, 1 / 400, 0) }, uFogDark: { value: 0.1 }, uTime: { value: 0 },
};

// ---------------------------------------------------------------- geometry builder
const _prim = new Map();
function prim(key, make) { let g = _prim.get(key); if (!g) { g = make().toNonIndexed(); _prim.set(key, g); } return g; }
const BOXG = () => prim('box', () => new THREE.BoxGeometry(1, 1, 1));
const CYLG = (ratio, seg) => prim(`cyl${ratio}|${seg}`, () => new THREE.CylinderGeometry(ratio, 1, 1, seg));
const CONEG = (seg) => prim('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg));
const SPHG = (w, h) => prim(`sph${w}|${h}`, () => new THREE.SphereGeometry(1, w, h));
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _n = new THREE.Matrix3();

export class Rig {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.part = []; this.piv = []; this.team = []; this.emit = []; }
  // fx emitter anchor in model space: kind 'fire' | 'smoke' | 'glow' | 'soul' | 'ember'; size scales the sprite; col overrides the glow colour
  em(kind, x, y, z, size = 1, col = 0) { this.emit.push({ kind, x, y, z, size, col }); return this; }
  add(g, color, x, y, z, sx, sy, sz, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e); _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)); _n.getNormalMatrix(_m);
    const pa = g.attributes.position, na = g.attributes.normal, part = o.part || 0, pv = o.pv || [0, 0, 0], tm = o.team || 0;
    _c.set(color);
    if (o.shade) _c.multiplyScalar(o.shade);
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(_m); this.pos.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(na, i).applyMatrix3(_n).normalize(); this.nor.push(_v.x, _v.y, _v.z);
      this.col.push(_c.r, _c.g, _c.b); this.part.push(part); this.piv.push(pv[0], pv[1], pv[2]); this.team.push(tm);
    }
    return this;
  }
  box(w, h, d, x, y, z, color, o) { return this.add(BOXG(), color, x, y, z, w, h, d, o); }
  cyl(rt, rb, h, x, y, z, color, seg = 8, o) { const r = rb || 1e-3; return this.add(CYLG(rt / r, seg), color, x, y, z, r, h, r, o); }
  cone(r, h, x, y, z, color, seg = 6, o) { return this.add(CONEG(seg), color, x, y, z, r, h, r, o); }
  sph(r, x, y, z, color, o = {}) { return this.add(SPHG(o.w || 7, o.h || 5), color, x, y, z, r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1), o); }
  // mirror helper: fn(sign) is called for z and -z
  sym(fn) { fn(1); fn(-1); return this; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.piv, 3));
    g.setAttribute('aTeam', new THREE.Float32BufferAttribute(this.team, 1));
    g.computeBoundingSphere(); g.computeBoundingBox(); g.userData.emit = this.emit;
    return g;
  }
}

// ---------------------------------------------------------------- shader pieces
const FOG_VERT_DECL = 'varying vec2 vFogXZ;\n';
const FOG_FRAG_DECL = 'varying vec2 vFogXZ; uniform sampler2D uFog; uniform vec4 uFogRect; uniform float uFogDark;\n';
const FOG_VERT = `vec4 fw_ = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nfw_ = instanceMatrix * fw_;\n#endif\nfw_ = modelMatrix * fw_; vFogXZ = fw_.xz;\n`;
const FOG_FRAG = 'gl_FragColor.rgb *= mix(uFogDark, 1.0, texture2D(uFog, (vFogXZ - uFogRect.xy) * uFogRect.z).r);\n';

// give an ordinary material (terrain, props, water) the fog-of-war multiplier
export function patchFog(mat) {
  if (mat.userData.fogPatched) return mat;
  mat.userData.fogPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev && prev.call(mat, sh, r);
    Object.assign(sh.uniforms, FOG_U);
    sh.vertexShader = FOG_VERT_DECL + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + FOG_VERT);
    sh.fragmentShader = FOG_FRAG_DECL + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + FOG_FRAG);
  };
  mat.customProgramCacheKey = () => 'fogpatch';
  mat.needsUpdate = true;
  return mat;
}

const RIG_VERT_DECL = `
attribute float aPart; attribute vec3 aPivot; attribute float aTeam; attribute vec4 iAnim; attribute vec4 iTint;
uniform float uTime; varying float vFlash; varying float vEm;
vec3 rotZ(vec3 p, vec3 c, float a){ float s=sin(a), k=cos(a); vec3 d=p-c; return c+vec3(k*d.x-s*d.y, s*d.x+k*d.y, d.z); }
vec3 rotX(vec3 p, vec3 c, float a){ float s=sin(a), k=cos(a); vec3 d=p-c; return c+vec3(d.x, k*d.y-s*d.z, s*d.y+k*d.z); }
vec3 rotY(vec3 p, vec3 c, float a){ float s=sin(a), k=cos(a); vec3 d=p-c; return c+vec3(k*d.x+s*d.z, d.y, -s*d.x+k*d.z); }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`;
const RIG_VERT = `
{
  vec3 p = transformed; float part = aPart; vec3 pv = aPivot;
  vFlash = iTint.a; vEm = aTeam > 1.5 ? 1.0 : 0.0;
  if (aTeam > 0.5 && aTeam < 1.5) { float l = dot(vColor.rgb, vec3(0.34)); vColor.rgb = iTint.rgb * (0.45 + l * 1.5); }
  #ifdef RIG_GHOST
  vColor.rgb = mix(vColor.rgb, iTint.rgb, 0.6);
  #endif
  #ifdef RIG_BLD
  float open = iAnim.x, tyaw = iAnim.y, rec = iAnim.z, dmg = iAnim.w;
  if (part > 10.5 && part < 11.5) p.y += open * pv.x;
  else if (part > 11.5 && part < 12.5) p = rotY(p, pv, -tyaw);
  else if (part > 12.5 && part < 13.5) p.x -= rec * pv.x;
  else if (part > 13.5 && part < 14.5) p = rotY(p, pv, uTime * 0.9);
  else if (part > 14.5 && part < 15.5) p.y += sin(uTime * 1.5 + pv.x) * 0.18;
  if (dmg > 0.01) { float n = hash3(floor(p * 2.2) + 3.0); vColor.rgb *= 1.0 - dmg * (0.25 + 0.5 * n); }
  #else
  float ph = iAnim.x, amp = iAnim.y, atk = iAnim.z, dth = iAnim.w; float sw = sin(ph) * amp;
  if (part > 0.5 && part < 1.5) p = rotZ(p, pv, sw * 0.75);
  else if (part < 2.5) p = rotZ(p, pv, -sw * 0.75);
  else if (part < 3.5) {
    float a = -sw * 0.5;
    if (atk > 0.001) { a = atk < 0.35 ? mix(0.2, 2.3, atk / 0.35) : mix(2.3, -0.8, smoothstep(0.35, 0.6, atk)); a = mix(a, 0.0, smoothstep(0.8, 1.0, atk)); }
    p = rotZ(p, pv, a);
  }
  else if (part < 4.5) p = rotZ(p, pv, sw * 0.5);
  else if (part < 5.5) p = rotZ(p, pv, -0.18 - amp * 0.35 + sin(uTime * 3.0 + pv.x) * 0.05);
  else if (part < 6.5) p = rotZ(p, pv, -ph * 0.5);
  else if (part < 7.5) { if (atk > 0.001) p.x += sin(atk * 3.14159) * pv.x; }
  else if (part < 8.5) { float a = 0.0; if (atk > 0.001) a = smoothstep(0.05, 0.3, atk) * 2.0 - smoothstep(0.55, 1.0, atk) * 2.0; p = rotZ(p, pv, a); }
  else if (part < 9.5) p = rotX(p, pv, sin(uTime * 15.0 + iAnim.x) * 0.7 * (pv.z > 0.0 ? -1.0 : 1.0));
  if (dth > 0.001) { p = rotZ(p, vec3(0.0, 0.25, 0.0), -min(dth * 3.0, 1.0) * 1.45); p.y -= smoothstep(0.5, 1.0, dth) * 0.4; }
  #endif
  transformed = p;
}
`;
const RIG_FRAG_DECL = 'varying float vFlash; varying float vEm;\n';

export function makeRigMaterial(kind = 'unit', o = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (kind === 'ghost') { m.transparent = true; m.opacity = 0.55; m.depthWrite = false; }
  if (o.side) m.side = o.side;
  if (kind === 'bld' || kind === 'ghost') m.defines = Object.assign({ RIG_BLD: 1 }, kind === 'ghost' ? { RIG_GHOST: 1 } : {});
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOG_U);
    sh.vertexShader = FOG_VERT_DECL + RIG_VERT_DECL + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + RIG_VERT)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + FOG_VERT);
    sh.fragmentShader = FOG_FRAG_DECL + RIG_FRAG_DECL + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.85, 0.7) * vFlash * 0.7 + vEm * vColor * 1.1 + vColor * 0.11;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + FOG_FRAG);
  };
  m.customProgramCacheKey = () => 'rig-' + kind;
  return m;
}
let _mats = null;
export function rigMaterials() { return _mats || (_mats = { unit: makeRigMaterial('unit'), bld: makeRigMaterial('bld'), ghost: makeRigMaterial('ghost') }); }

// ---------------------------------------------------------------- InstancedRig: one geometry + one InstancedMesh with growable capacity
export class InstancedRig {
  constructor(scene, geo, mat, cap = 16) {
    this.scene = scene; this.base = geo; this.mat = mat; this.n = 0; this.cap = 0; this.mesh = null; this.grow(cap);
  }
  grow(cap) {
    const old = this.mesh;
    this.cap = cap;
    const g = this.base.clone();
    this.anim = new Float32Array(cap * 4); this.tint = new Float32Array(cap * 4);
    this.aAnim = new THREE.InstancedBufferAttribute(this.anim, 4).setUsage(THREE.DynamicDrawUsage);
    this.aTint = new THREE.InstancedBufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iAnim', this.aAnim); g.setAttribute('iTint', this.aTint);
    const im = new THREE.InstancedMesh(g, this.mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0;
    if (old) { im.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, this.n * 16)); this.scene.remove(old); old.geometry.dispose(); old.dispose && old.dispose(); }
    this.scene.add(im); this.mesh = im;
  }
  begin() { this.n = 0; }
  // returns the instance index to write: matrix via setMatrix, anim/tint via set()
  next() { if (this.n >= this.cap) this.grow(this.cap * 2); return this.n++; }
  set(i, m, a0, a1, a2, a3, r, g, b, fl) {
    m.toArray(this.mesh.instanceMatrix.array, i * 16);
    const o = i * 4, an = this.anim, tn = this.tint;
    an[o] = a0; an[o + 1] = a1; an[o + 2] = a2; an[o + 3] = a3; tn[o] = r; tn[o + 1] = g; tn[o + 2] = b; tn[o + 3] = fl;
  }
  end() {
    const im = this.mesh; im.count = this.n; im.visible = this.n > 0;
    if (this.n) { im.instanceMatrix.needsUpdate = true; this.aAnim.needsUpdate = true; this.aTint.needsUpdate = true; }
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}
