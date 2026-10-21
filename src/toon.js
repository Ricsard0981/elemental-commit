// Stylized toon look: stepped lighting, fresnel rim light and a cheap inverted-hull outline.
// Every material variant shares one program (customProgramCacheKey) and is warmed up at boot.
import * as THREE from 'three';

const steps = new Uint8Array([70, 140, 205, 255]);
export const gradientMap = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter; gradientMap.generateMipmaps = false; gradientMap.needsUpdate = true;

const RIM_FRAG = `
  float rimK = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
  outgoingLight += uRim * smoothstep(0.35, 0.9, rimK);
  #include <opaque_fragment>`;

// duo = how much of the texture is replaced by a dark→light gradient of the element's colours (the hero's spirit look)
export function toonMaterial({ color = 0xffffff, map = null, emissive = 0x000000, emissiveIntensity = 0, rim = 0x7fb0ff, rimK = 0.55, duo = 0, dark = 0x000000, light = 0xffffff } = {}) {
  const m = new THREE.MeshToonMaterial({ color, map, gradientMap, emissive, emissiveIntensity });
  const uRim = { value: new THREE.Color(rim).multiplyScalar(rimK) }, uDuo = { value: duo }, uDark = { value: new THREE.Color(dark) }, uLight = { value: new THREE.Color(light) };
  m.userData.uRim = uRim; m.userData.uDuo = uDuo; m.userData.uDark = uDark; m.userData.uLight = uLight;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = uRim; sh.uniforms.uDuo = uDuo; sh.uniforms.uDark = uDark; sh.uniforms.uLight = uLight;
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec3 uRim, uDark, uLight; uniform float uDuo;\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  { float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, mix(uDark, uLight, smoothstep(0.04, 0.7, lum)), uDuo); }')
      .replace('#include <opaque_fragment>', RIM_FRAG);
  };
  m.customProgramCacheKey = () => 'toonrim';
  return m;
}

// inverted hull: back faces pushed outwards in view space (smooth normals for skinned meshes, vertex direction for
// hard-edged boxes so corners stay joined). One program for skinned and one for plain meshes.
const outlineVert = (dirExpr) => `
  #include <common>
  #include <skinning_pars_vertex>
  uniform float uThick;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
    vec3 d = ${dirExpr};
    mv.xyz += normalize(d) * uThick * (0.6 + 0.4 * clamp(-mv.z / 18.0, 0.0, 2.0));
    gl_Position = projectionMatrix * mv;
  }`;
const outlineFrag = 'uniform vec3 uInk; void main() { gl_FragColor = vec4(uInk, 1.0); }';
export function outlineMaterial({ thick = 0.035, ink = 0x0a0e14, hard = false } = {}) {
  return new THREE.ShaderMaterial({ name: hard ? 'outlineHard' : 'outline',
    uniforms: { uThick: { value: thick }, uInk: { value: new THREE.Color(ink) } },
    vertexShader: outlineVert(hard ? '(modelViewMatrix * vec4(position, 0.0)).xyz' : 'normalMatrix * objectNormal'),
    fragmentShader: outlineFrag, side: THREE.BackSide, fog: false,
  });
}

// add an outline twin to a mesh (skinned meshes share the skeleton)
export function addOutline(mesh, mat) {
  let o;
  if (mesh.isSkinnedMesh) { o = new THREE.SkinnedMesh(mesh.geometry, mat); o.bind(mesh.skeleton, mesh.bindMatrix); o.frustumCulled = false; }
  else o = new THREE.Mesh(mesh.geometry, mat);
  o.castShadow = o.receiveShadow = false; o.userData.outline = true; o.renderOrder = -1;
  mesh.add(o);
  return o;
}
export const outlineHard = outlineMaterial({ thick: 0.05, hard: true });

// ---------------------------------------------------------------- costume material (hero body)
// The base body is painted into a costume by bind-pose position zones (legs / boots / torso / sleeves / forearms),
// with glowing element runes on bare skin. Same toon lighting + rim as every other toon material.
const ZONE_FUNCS = `
  varying vec3 vObj;
  uniform vec4 uZ1, uZ2, uKit; uniform vec3 uClothA, uClothB, uTrim, uGlow; uniform float uStyle;
  float zpat(float st, vec3 p) {
    if (st < 0.5) { float w = sin(p.y * 38.0 + sin(p.x * 22.0) * 2.2); return smoothstep(0.92, 1.0, w); }
    if (st < 1.5) { float r = length(p.xy - vec2(0.0, 1.3)); return smoothstep(0.9, 1.0, sin(r * 55.0)); }
    if (st < 2.5) { vec2 g = p.xy * 9.0, i = floor(g), f = fract(g); float h = fract(sin(dot(i, vec2(12.9, 78.2))) * 43758.5); float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)); return smoothstep(0.07, 0.0, e) * step(0.42, h); }
    float a = atan(p.y - 1.3, p.x), r = length(p.xy - vec2(0.0, 1.3)); return smoothstep(0.9, 1.0, sin(a * 3.0 + r * 40.0));
  }`;
const ZONE_FRAG = `
  float zg = 0.0;
  {
    vec3 zp = vObj; float zax = abs(zp.x), zy = zp.y;
    float zlum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 zskin = diffuseColor.rgb, zout = zskin;
    float zlegs = step(zy, uZ1.w) * step(zax, 0.34);
    float zboot = step(zy, uZ1.z) * zlegs;
    vec3 ztr = mix(uClothB, uClothA, smoothstep(0.1, 0.95, zy)) * (0.7 + 0.6 * zlum);
    ztr = mix(ztr, uTrim, step(abs(zy - uZ1.y), 0.018) * 0.9 + step(abs(zy - uZ1.w), 0.02) * 0.9 + smoothstep(uZ1.z + 0.05, uZ1.z + 0.03, zy) * step(uZ1.z + 0.0, zy) * 0.9);
    ztr = mix(ztr, uClothB * 0.45, zboot);
    zout = mix(zout, ztr, zlegs);
    float zbodyY = step(uZ1.w, zy);
    float ztorso = zbodyY * step(zy, uZ2.x) * step(zax, uZ2.y - 0.005);
    float zfull = step(0.75, uKit.x), zband = step(0.25, uKit.x) * (1.0 - zfull) * step(uZ2.x - 0.17, zy);
    float ztm = ztorso * max(zfull, zband);
    vec3 ztc = mix(uClothB, uClothA, smoothstep(uZ1.w, uZ2.x, zy)) * (0.72 + 0.6 * zlum);
    ztc = mix(ztc, uTrim, step(abs(zy - (uZ1.w + 0.02)), 0.02) * 0.9 + step(abs(zy - (uZ2.x - 0.01)), 0.012) * 0.9 * zfull);
    zout = mix(zout, ztc, ztm);
    float zarm = step(uZ2.y - 0.005, zax) * step(1.25, zy) * step(zy, uZ2.x + 0.1);
    float zup = zarm * step(zax, uZ2.z - 0.01) * step(0.5, uKit.z);
    float zfa = zarm * step(uZ2.z - 0.01, zax) * step(zax, uZ2.w) * step(0.5, uKit.w);
    zout = mix(zout, mix(uClothA, uClothB, 0.4) * (0.72 + 0.6 * zlum), zup);
    zout = mix(zout, uTrim * (0.6 + 0.5 * zlum), zfa);
    float zbare = (1.0 - max(ztm, zlegs)) * (1.0 - zup) * (1.0 - zfa) * step(0.4, zy) * step(zy, uZ2.x + 0.02) * (1.0 - step(1.5, zy));
    zg = zbare * zpat(uStyle, zp) * 0.9;
    diffuseColor.rgb = zout;
  }`;
export function costumeMaterial({ map, rim = 0xffffff, rimK = 0.6, zones, kit, colors, style = 0 }) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, map, gradientMap });
  const U = {
    uRim: { value: new THREE.Color(rim).multiplyScalar(rimK) },
    uZ1: { value: new THREE.Vector4(...zones.z1) }, uZ2: { value: new THREE.Vector4(...zones.z2) }, uKit: { value: new THREE.Vector4(...kit) },
    uClothA: { value: new THREE.Color(colors.a) }, uClothB: { value: new THREE.Color(colors.b) }, uTrim: { value: new THREE.Color(colors.trim) }, uGlow: { value: new THREE.Color(colors.glow) }, uStyle: { value: style },
  };
  m.userData.U = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vObj;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', ZONE_FUNCS + '\nuniform vec3 uRim;\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + ZONE_FRAG)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlow * zg * 2.2;')
      .replace('#include <opaque_fragment>', RIM_FRAG);
  };
  m.customProgramCacheKey = () => 'toonbody';
  return m;
}
