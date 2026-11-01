// FOGBOUND: DOMINION client: sky / weather layer. Tunes worldview fog + lighting for the high RTS camera, GPU rain + snow around the camera target,
// lightning flashes, storm / fog / blizzard / dread moods from st.weather {kind, intensity} (WorldX weather.js).
import * as THREE from 'three';

const RAIN_N = 3200, SNOW_N = 1800, BOX = 90, HGT = 46;
function rainGeo() {
  const pos = new Float32Array(RAIN_N * 2 * 3), seed = new Float32Array(RAIN_N * 2), end = new Float32Array(RAIN_N * 2);
  for (let i = 0; i < RAIN_N; i++) {
    const x = Math.random() * BOX, y = Math.random() * HGT, z = Math.random() * BOX, s = Math.random();
    for (let k = 0; k < 2; k++) { const j = i * 2 + k; pos[j * 3] = x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z; seed[j] = s; end[j] = k; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('endp', new THREE.BufferAttribute(end, 1));
  return g;
}
function snowGeo() {
  const pos = new Float32Array(SNOW_N * 3), seed = new Float32Array(SNOW_N);
  for (let i = 0; i < SNOW_N; i++) { pos[i * 3] = Math.random() * BOX; pos[i * 3 + 1] = Math.random() * HGT; pos[i * 3 + 2] = Math.random() * BOX; seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  return g;
}
const COMMON = `uniform float uTime; uniform vec3 uC; uniform float uI; uniform vec2 uW; attribute float seed; varying float vA;
vec3 wrapPos(vec3 p, vec3 fall){ vec3 q = p + fall; q.x = mod(q.x - uC.x + ${BOX / 2}.0, ${BOX}.0) - ${BOX / 2}.0 + uC.x; q.z = mod(q.z - uC.z + ${BOX / 2}.0, ${BOX}.0) - ${BOX / 2}.0 + uC.z; q.y = mod(q.y, ${HGT}.0) + uC.y - 6.0; return q; }`;

export function createSky(ctx) {
  const { wv, scene, st } = ctx;
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Vector3() }, uI: { value: 0 }, uW: { value: new THREE.Vector2(0.25, 0) } }, transparent: true, depthWrite: false, fog: false,
    vertexShader: COMMON + `attribute float endp; void main(){ vec3 fall = vec3(uW.x * uTime * 2.0, -(34.0 + seed * 10.0) * uTime, 0.0); vec3 p = wrapPos(position, fall); p.xyz += (1.0 - endp) * vec3(0.5, 1.8, 0.0); vA = seed < uI ? 0.45 * (0.5 + 0.5 * endp) : 0.0; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: 'varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(0.72, 0.78, 0.85, vA); }',
  });
  const rain = new THREE.LineSegments(rainGeo(), rainMat); rain.frustumCulled = false; rain.renderOrder = 7; rain.visible = false; scene.add(rain);
  const snowMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Vector3() }, uI: { value: 0 }, uW: { value: new THREE.Vector2(0, 0) }, scale: { value: 600 } }, transparent: true, depthWrite: false, fog: false,
    vertexShader: COMMON + `uniform float scale; void main(){ vec3 fall = vec3(sin(uTime * 0.7 + seed * 40.0) * 3.0 + uTime * 2.5, -(3.0 + seed * 3.0) * uTime, cos(uTime * 0.5 + seed * 30.0) * 3.0); vec3 p = wrapPos(position, fall); vA = seed < uI ? 0.8 : 0.0; vec4 mv = viewMatrix * vec4(p, 1.0); gl_PointSize = 0.22 * scale / -mv.z + 1.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'varying float vA; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.3, r) * vA; if (a < 0.02) discard; gl_FragColor = vec4(0.94, 0.96, 1.0, a); }',
  });
  const snow = new THREE.Points(snowGeo(), snowMat); snow.frustumCulled = false; snow.renderOrder = 7; snow.visible = false; scene.add(snow);
  const _w = new THREE.Color(), grey = new THREE.Color(0x56606a), white = new THREE.Color(0xc4ccd4);
  let inten = { rain: 0, snow: 0, fog: 0, storm: 0 }, flash = 0;
  const tgtOf = (kind, I) => ({ rain: kind === 'rain' || kind === 'storm' ? I : 0, snow: kind === 'blizzard' ? I : 0, fog: kind === 'fog' ? I : 0, storm: kind === 'storm' ? I : 0 });
  function update(dt, cam) {
    const w = st.weather || {}, I = w.intensity ?? 0, t = tgtOf(w.kind, I), k = Math.min(1, dt * 0.8);
    for (const key in inten) inten[key] += (t[key] - inten[key]) * k;
    const q = typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search) : null;
    if (q && q.get('weather')) { const kk = q.get('weather'), v = +(q.get('wi') || 0.9); const f = tgtOf(kk, v); for (const key in inten) inten[key] = f[key]; }
    flash = Math.max(0, flash - dt * 3);
    const zoom = Math.min(1, 60 / Math.max(30, cam.dist)), base = 0.4 + 0.25 * zoom;
    const fogM = base * (1 + inten.rain * 0.3 + inten.fog * 1.1 + inten.snow * 0.7 + inten.storm * 0.2);
    scene.fog.density *= fogM;
    const dark = Math.max(inten.rain * 0.22, inten.storm * 0.36);
    wv.hemi.intensity *= 1 - dark * 0.7; wv.sun.intensity *= 1 - dark * 1.2; wv.hemi.intensity += flash * 2.2;
    const mix = Math.max(inten.rain * 0.3, inten.storm * 0.4, inten.fog * 0.25);
    if (mix > 0.001) { scene.fog.color.lerp(grey, mix); scene.background.copy(scene.fog.color); }
    if (inten.snow > 0.01) { scene.fog.color.lerp(white, inten.snow * 0.35); scene.background.copy(scene.fog.color); }
    for (const m of wv.mists) m.material.opacity *= 1 + inten.fog * 1.8 + inten.snow * 0.6;
    const tm = ctx.time;
    rain.visible = inten.rain > 0.02; if (rain.visible) { rainMat.uniforms.uTime.value = tm; rainMat.uniforms.uC.value.set(cam.x, ctx.world.heightAt(cam.x, cam.z), cam.z); rainMat.uniforms.uI.value = Math.min(1, inten.rain * 1.2); rainMat.uniforms.uW.value.x = 0.25 + inten.storm * 0.35; }
    snow.visible = inten.snow > 0.02; if (snow.visible) { snowMat.uniforms.uTime.value = tm; snowMat.uniforms.uC.value.set(cam.x, ctx.world.heightAt(cam.x, cam.z), cam.z); snowMat.uniforms.uI.value = Math.min(1, inten.snow * 1.2); snowMat.uniforms.scale.value = wv.glowP.mat.uniforms.scale.value; }
  }
  function onEvent(e) { if (e.type === 'weather' && e.kind === 'lightning') flash = 1; }
  return { update, onEvent, inten, get flash() { return flash; } };
}
