'use client';

/**
 * The city as an orbitable cutaway: pads, power fields, ISRU plant, ice mine,
 * habitats, greenhouse streets (they glow), compost drums, digesters, and the
 * cryo tank farm with live fill levels. Composting is visible architecture,
 * not an icon.
 *
 * Rendering notes: one soft-shadowed sun keyed to the live dust optical depth,
 * a butterscotch sky dome with an in-shader sun disc, sculpted regolith with
 * vertex-colored dunes outside the graded base pad, instanced rock scatter,
 * and a wind-blown dust particle field that only appears when tau climbs.
 */

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getSite, opticalDepthAtSol } from '../../lib/sites';
import { rngFromSeed, rngNext, type RngState } from '../../lib/rng';
import { STRUCTURES } from '../../lib/structures';
import { clamp, safeDiv } from '../../lib/types';
import { sunlightFraction } from '../../lib/sim/step';
import { useSimStore } from '../../store/useSimStore';
import { Starships } from './Starships';

/** One fixed sun direction for the whole scene (light, shadows, sky disc). */
const SUN_DIR = new THREE.Vector3(0.55, 0.52, 0.42).normalize();

/**
 * Shared materials (module-level: allocated once, reused every render).
 * Metalness stays low across the board: there is no environment map, and
 * unmapped metals render as black holes instead of steel.
 */
const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: '#a7adb4', roughness: 0.45, metalness: 0.35 }),
  rustSteel: new THREE.MeshStandardMaterial({ color: '#7d5a44', roughness: 0.65, metalness: 0.25 }),
  pad: new THREE.MeshStandardMaterial({ color: '#4a4038', roughness: 0.9 }),
  padRing: new THREE.MeshStandardMaterial({
    color: '#3a3028',
    emissive: '#e2661a',
    emissiveIntensity: 1.6,
    roughness: 0.6,
  }),
  panel: new THREE.MeshStandardMaterial({ color: '#1d2c3c', roughness: 0.25, metalness: 0.4 }),
  habitat: new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.55 }),
  habitatWindow: new THREE.MeshStandardMaterial({
    color: '#241a10',
    emissive: '#ffd9a0',
    emissiveIntensity: 1.8,
    roughness: 0.4,
  }),
  drum: new THREE.MeshStandardMaterial({ color: '#5d6b46', roughness: 0.8 }),
  digester: new THREE.MeshStandardMaterial({ color: '#46605d', roughness: 0.7 }),
  iceTank: new THREE.MeshStandardMaterial({ color: '#7cc7e8', roughness: 0.25, metalness: 0.2 }),
  ch4Tank: new THREE.MeshStandardMaterial({ color: '#c3d0d5', roughness: 0.3, metalness: 0.3 }),
  berm: new THREE.MeshStandardMaterial({ color: '#54291a', roughness: 1 }),
  rock: new THREE.MeshStandardMaterial({ color: '#5f2f1c', roughness: 1, flatShading: true }),
};

/** Deterministic 2D value-noise helper (no RNG state needed). */
function noise2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth fractal noise, 4 octaves. */
function fbm(x: number, y: number): number {
  let v = 0;
  let a = 0.5;
  for (let o = 0; o < 4; o += 1) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const w = yf * yf * (3 - 2 * yf);
    const n =
      noise2(xi, yi) * (1 - u) * (1 - w) +
      noise2(xi + 1, yi) * u * (1 - w) +
      noise2(xi, yi + 1) * (1 - u) * w +
      noise2(xi + 1, yi + 1) * u * w;
    v += n * a;
    x *= 2.1;
    y *= 2.1;
    a *= 0.5;
  }
  return v;
}

/** GLSL-style smoothstep on the CPU. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Terrain height at (x, z): graded flat inside the base radius, rolling
 * basalt dunes outside, with fine regolith roughness everywhere.
 */
function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const outside = smoothstep(26, 62, r);
  let h = (fbm(x * 0.018 + 11.3, z * 0.018 + 5.7) - 0.45) * 7 * outside;
  h += (fbm(x * 0.12 + 3.1, z * 0.12 + 8.9) - 0.5) * 0.5 * (0.12 + 0.88 * outside);
  return h - 0.08;
}

/** Sky dome shaders: vertical gradient + analytic sun disc and forward glow. */
const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAGMENT = /* glsl */ `
  varying vec3 vWorldDir;
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float haze;
  void main() {
    vec3 dir = normalize(vWorldDir);
    float h = clamp(dir.y, 0.0, 1.0);
    // Butterscotch horizon fading to a dark zenith; storms flatten the ramp.
    vec3 sky = mix(horizonColor, topColor, pow(h, mix(0.5, 0.85, haze)));
    float cosSun = max(dot(dir, sunDir), 0.0);
    // Broad forward-scatter glow around the sun; wider and dimmer in dust.
    sky += sunColor * pow(cosSun, mix(24.0, 6.0, haze)) * mix(0.5, 0.22, haze);
    // The disc itself: crisp when clear, a pale smear in a storm.
    float disc = smoothstep(mix(0.99993, 0.9994, haze), 0.99997, cosSun);
    sky += sunColor * disc * mix(2.4, 0.45, haze);
    gl_FragColor = vec4(sky, 1.0);
  }
`;

/** Sky palette endpoints, lerped by live daylight each frame. */
const SKY_CLEAR = {
  top: new THREE.Color('#1c0f0d'),
  horizon: new THREE.Color('#b97a4a'),
  sun: new THREE.Color('#ffe8cc'),
};
const SKY_STORM = {
  top: new THREE.Color('#2a140c'),
  horizon: new THREE.Color('#5f2f1a'),
  sun: new THREE.Color('#d9a070'),
};

/** Typed uniform set for the sky dome material. */
interface SkyUniforms {
  readonly topColor: { value: THREE.Color };
  readonly horizonColor: { value: THREE.Color };
  readonly sunDir: { value: THREE.Vector3 };
  readonly sunColor: { value: THREE.Color };
  readonly haze: { value: number };
  [uniform: string]: { value: unknown };
}

/** The dome: a big back-faced sphere whose colors chase the dust. */
function SkyDome(props: { daylight: number }): React.ReactElement {
  const uniforms = useMemo<SkyUniforms>(
    () => ({
      topColor: { value: SKY_CLEAR.top.clone() },
      horizonColor: { value: SKY_CLEAR.horizon.clone() },
      sunDir: { value: SUN_DIR.clone() },
      sunColor: { value: SKY_CLEAR.sun.clone() },
      haze: { value: 0 },
    }),
    [],
  );
  // useFrame always runs the latest closure, so reading props here is safe.
  useFrame((_, delta) => {
    // Ease toward the palette implied by current daylight; storms roll in, not snap.
    const storminess = 1 - props.daylight;
    const k = clamp(delta * 1.5, 0, 1);
    uniforms.topColor.value.lerp(storminess > 0.5 ? SKY_STORM.top : SKY_CLEAR.top, k);
    uniforms.horizonColor.value.lerp(
      storminess > 0.5 ? SKY_STORM.horizon : SKY_CLEAR.horizon,
      k,
    );
    uniforms.sunColor.value.lerp(storminess > 0.5 ? SKY_STORM.sun : SKY_CLEAR.sun, k);
    // eslint-disable-next-line react-hooks/immutability -- three.js uniforms are mutated in the frame loop by design, same as the Color lerps above
    uniforms.haze.value += (storminess - uniforms.haze.value) * k;
  });
  return (
    <mesh>
      <sphereGeometry args={[300, 32, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={SKY_VERTEX}
        fragmentShader={SKY_FRAGMENT}
      />
    </mesh>
  );
}

/** Sculpted regolith: displaced plane with vertex-colored dunes and a worn pad. */
function Terrain(): React.ReactElement {
  const geometry = useMemo(() => {
    const size = 280;
    const segments = 150;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color('#84462a');
    const high = new THREE.Color('#a35832');
    const low = new THREE.Color('#5e2d19');
    const worn = new THREE.Color('#6d3f28');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      // Hypsometric tint plus patchy albedo noise, worn dark inside the base.
      const t = clamp((h + 0.5) / 3.5, 0, 1);
      c.copy(low).lerp(base, Math.min(1, t * 2)).lerp(high, Math.max(0, t * 2 - 1));
      const patch = fbm(x * 0.05 + 40.7, z * 0.05 + 17.2);
      c.offsetHSL(0, (patch - 0.5) * 0.08, (patch - 0.5) * 0.05);
      const wornMix = 1 - smoothstep(20, 30, Math.hypot(x, z));
      c.lerp(worn, wornMix * 0.65);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}

/** Instanced basalt rock scatter outside the graded base pad. */
function Rocks(): React.ReactElement {
  const count = 260;
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const shade = new THREE.Color();
    let rng: RngState = rngFromSeed(1971);
    const draw = (): number => {
      const d = rngNext(rng);
      rng = d.next;
      return d.value;
    };
    for (let i = 0; i < count; i += 1) {
      const angle = draw() * Math.PI * 2;
      const radius = 34 + draw() * 96;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const scale = 0.12 + draw() * draw() * 0.9;
      p.set(x, terrainHeight(x, z) + scale * 0.3, z);
      e.set(draw() * Math.PI, draw() * Math.PI, draw() * Math.PI);
      q.setFromEuler(e);
      s.set(scale * (0.7 + draw() * 0.6), scale * (0.5 + draw() * 0.5), scale);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      shade.setHSL(0.05, 0.42 + draw() * 0.12, 0.16 + draw() * 0.1);
      mesh.setColorAt(i, shade);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, []);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, MAT.rock, count]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

/** Soft radial sprite for dust points, so motes read round, not square. */
function buildDustSprite(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Wind-blown dust: a drifting point field that fades in with optical depth. */
function DustParticles(props: { tau: number }): React.ReactElement {
  const count = 900;
  const box = { x: 180, y: 26, z: 180 };
  const attrRef = useRef<THREE.BufferAttribute>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const sprite = useMemo(() => buildDustSprite(), []);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    let rng: RngState = rngFromSeed(4242);
    for (let i = 0; i < count; i += 1) {
      const a = rngNext(rng);
      const b = rngNext(a.next);
      const c = rngNext(b.next);
      rng = c.next;
      arr[i * 3] = (a.value - 0.5) * box.x;
      arr[i * 3 + 1] = 0.5 + b.value * box.y;
      arr[i * 3 + 2] = (c.value - 0.5) * box.z;
    }
    return arr;
    // box is a stable literal; positions are generated exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // useFrame always runs the latest closure, so reading props here is safe.
  useFrame((_, delta) => {
    const tau = props.tau;
    const targetOpacity = clamp((tau - 0.55) / 3.5, 0, 0.55);
    if (matRef.current) {
      matRef.current.opacity += (targetOpacity - matRef.current.opacity) * Math.min(1, delta * 2);
    }
    const attr = attrRef.current;
    if (!attr || targetOpacity <= 0.001) {
      return;
    }
    // Storm wind: mostly +x with a touch of +z, faster as tau climbs.
    const wind = (3 + tau * 9) * delta;
    const arr = attr.array;
    for (let i = 0; i < count; i += 1) {
      let x = arr[i * 3] + wind;
      let z = arr[i * 3 + 2] + wind * 0.35;
      if (x > box.x / 2) {
        x -= box.x;
      }
      if (z > box.z / 2) {
        z -= box.z;
      }
      arr[i * 3] = x;
      arr[i * 3 + 2] = z;
    }
    attr.needsUpdate = true;
  });
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute ref={attrRef} attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        color="#d08347"
        size={0.5}
        map={sprite ?? undefined}
        alphaTest={0.01}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
      />
    </points>
  );
}

/** Ice-hauler rover: loops between the ice mine and the ISRU plant. */
function Rover(): React.ReactElement {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) {
      return;
    }
    // Parametric ellipse between the mine (-26, 14) and the plant (-14, 2).
    const t = state.clock.elapsedTime * 0.22;
    const x = -20 + Math.cos(t) * 9;
    const z = 8 + Math.sin(t) * 5.5;
    g.position.set(x, terrainHeight(x, z) + 0.42, z);
    // Face along the direction of travel (velocity of the ellipse).
    g.rotation.y = Math.atan2(Math.sin(t) * 9, Math.cos(t) * 5.5);
  });
  return (
    <group ref={group}>
      <mesh position={[0, 0.1, 0]} material={MAT.rustSteel} castShadow>
        <boxGeometry args={[1.1, 0.35, 0.7]} />
      </mesh>
      {/* ice cargo bin riding behind the cab */}
      <mesh position={[-0.15, 0.38, 0]} material={MAT.iceTank} castShadow>
        <boxGeometry args={[0.6, 0.25, 0.55]} />
      </mesh>
      {/* cab beacon */}
      <mesh position={[0.42, 0.36, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#3a1505" emissive="#e2661a" emissiveIntensity={2.2} />
      </mesh>
      {/* wheels */}
      {[-0.35, 0.35].map((wx) =>
        [-0.42, 0.42].map((wz) => (
          <mesh
            key={`w-${wx}-${wz}`}
            position={[wx, -0.12, wz]}
            rotation={[Math.PI / 2, 0, 0]}
            material={MAT.pad}
          >
            <cylinderGeometry args={[0.16, 0.16, 0.12, 10]} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Repeat a mesh `count` times along a row with spacing. */
function Row(props: {
  count: number;
  spacing: number;
  origin: readonly [number, number, number];
  children: (i: number, pos: [number, number, number]) => React.ReactElement;
}): React.ReactElement {
  const items: React.ReactElement[] = [];
  for (let i = 0; i < props.count; i += 1) {
    items.push(
      props.children(i, [
        props.origin[0] + (i % 6) * props.spacing,
        props.origin[1],
        props.origin[2] + Math.floor(i / 6) * props.spacing,
      ]),
    );
  }
  return <group>{items}</group>;
}

/** Greenhouse street: a half-cylinder that glows greenhouse-green when alive. */
function GreenhouseStreet(props: {
  position: [number, number, number];
  length: number;
  glow: number;
}): React.ReactElement {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  // Material mutation happens inside the frame loop, not during render.
  useFrame(() => {
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.08 + props.glow * 1.35;
    }
  });
  return (
    <group position={props.position}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[1.1, 1.1, props.length, 24, 1, false, 0, Math.PI]} />
        <meshStandardMaterial
          ref={matRef}
          color="#2a3c2c"
          roughness={0.2}
          transparent
          opacity={0.85}
          emissive="#59c96a"
          emissiveIntensity={0.1}
        />
      </mesh>
      {/* end caps ground the tube so it reads as architecture, not a decal */}
      <mesh position={[props.length / 2 - 0.15, 0, 0]} castShadow material={MAT.habitat}>
        <boxGeometry args={[0.3, 1.6, 2.1]} />
      </mesh>
      <mesh position={[-props.length / 2 + 0.15, 0, 0]} castShadow material={MAT.habitat}>
        <boxGeometry args={[0.3, 1.6, 2.1]} />
      </mesh>
      {/* interior glow light: the scarce green pigment of the whole scene */}
      <pointLight color="#59c96a" intensity={props.glow * 3} distance={7} position={[0, 0.8, 0]} />
    </group>
  );
}

/** All the buildings, derived from structure counts + live inventories. */
function City(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const st = sim.structures;
  const last = sim.history[sim.history.length - 1];
  const tau = last ? last.tau : 0.4;
  const sun = sunlightFraction(tau);
  const ghGlow = clamp(sun / 0.5, 0.05, 1);
  const cryoCap = Math.max(1, st.cryoPlant * STRUCTURES.cryoPlant.capacityValue);
  const ch4Fill = clamp(safeDiv(sim.inv.ch4Kg, cryoCap * 0.22), 0.02, 1);
  const loxFill = clamp(safeDiv(sim.inv.loxKg, cryoCap * 0.78), 0.02, 1);
  const waterFill = clamp(safeDiv(sim.inv.waterKg, 100000), 0.05, 1);

  const flare = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    // Slow industrial flicker on the plant lighting; night never fully sleeps.
    if (flare.current) {
      flare.current.intensity = 6 + Math.sin(state.clock.elapsedTime * 1.7) * 1.5;
    }
  });

  return (
    <group>
      {/* ice-table cutaway trench near the mine */}
      <mesh position={[-26, -1.2, 14]} material={MAT.iceTank}>
        <boxGeometry args={[14, 1.2, 8]} />
      </mesh>
      <mesh position={[-26, -0.4, 14]} material={MAT.berm} receiveShadow>
        <boxGeometry args={[14.5, 0.5, 8.5]} />
      </mesh>

      {/* landing pads with beacon rings (aligned with the Starship slots) */}
      <Row count={Math.max(0, st.pad)} spacing={9} origin={[13, 0.02, -18]}>
        {(i, pos) => (
          <group key={`pad-${i}`} position={pos}>
            <mesh material={MAT.pad} receiveShadow>
              <cylinderGeometry args={[3.6, 3.6, 0.12, 32]} />
            </mesh>
            <mesh position={[0, 0.07, 0]} material={MAT.padRing}>
              <torusGeometry args={[3.3, 0.045, 8, 48]} />
            </mesh>
          </group>
        )}
      </Row>

      {/* solar field */}
      <Row count={st.solar * 3} spacing={2.6} origin={[10, 0.5, 12]}>
        {(i, pos) => (
          <group key={`sol-${i}`} position={pos}>
            <mesh rotation={[-0.5, 0, 0]} material={MAT.panel} castShadow receiveShadow>
              <boxGeometry args={[2.2, 0.06, 1.4]} />
            </mesh>
            <mesh position={[0, -0.28, 0]} material={MAT.steel} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.55, 6]} />
            </mesh>
          </group>
        )}
      </Row>

      {/* nuclear: finned cylinders behind a berm */}
      <Row count={st.nuclear} spacing={4} origin={[24, 0.9, 8]}>
        {(i, pos) => (
          <group key={`nuc-${i}`} position={pos}>
            <mesh material={MAT.steel} castShadow receiveShadow>
              <cylinderGeometry args={[0.7, 0.9, 1.8, 12]} />
            </mesh>
            <mesh position={[0, 1.3, 0]} material={MAT.rustSteel} castShadow>
              <cylinderGeometry args={[1.3, 0.5, 0.8, 4]} />
            </mesh>
          </group>
        )}
      </Row>

      {/* ISRU plant: compressor/electrolyzer/sabatier as a piped block */}
      <group position={[-14, 0, 2]}>
        {(['compressor', 'electrolyzer', 'sabatier'] as const).map((id, k) =>
          st[id] > 0 ? (
            <group key={id} position={[k * 4.2, 0, 0]}>
              <mesh position={[0, 1, 0]} material={MAT.steel} castShadow receiveShadow>
                <boxGeometry args={[3, 2, 2.4]} />
              </mesh>
              <mesh position={[0, 2.6, 0.5]} material={MAT.rustSteel} castShadow>
                <cylinderGeometry args={[0.25, 0.25, 1.4, 8]} />
              </mesh>
            </group>
          ) : null,
        )}
        {st.sabatier > 0 ? <pointLight ref={flare} position={[6, 3.5, 0]} color="#e2661a" distance={16} /> : null}
      </group>

      {/* cryo tank farm with live fill */}
      {st.cryoPlant > 0 ? (
        <group position={[-2, 0, -14]}>
          <mesh position={[0, 1.6, 0]} material={MAT.ch4Tank} castShadow receiveShadow>
            <cylinderGeometry args={[1.4, 1.4, 3.2, 20]} />
          </mesh>
          <mesh position={[0, 0.15 + ch4Fill * 1.5, 0]} scale={[1.01, ch4Fill, 1.01]}>
            <cylinderGeometry args={[1.41, 1.41, 3.0, 20]} />
            <meshStandardMaterial color="#7cc7e8" transparent opacity={0.5} />
          </mesh>
          <mesh position={[3.6, 1.6, 0]} material={MAT.ch4Tank} castShadow receiveShadow>
            <cylinderGeometry args={[1.4, 1.4, 3.2, 20]} />
          </mesh>
          <mesh position={[3.6, 0.15 + loxFill * 1.5, 0]} scale={[1.01, loxFill, 1.01]}>
            <cylinderGeometry args={[1.41, 1.41, 3.0, 20]} />
            <meshStandardMaterial color="#a9d9f0" transparent opacity={0.5} />
          </mesh>
          {/* water tank */}
          <mesh position={[7.2, 1.2, 0]} material={MAT.iceTank} castShadow receiveShadow>
            <sphereGeometry args={[1.3 * (0.6 + waterFill * 0.4), 24, 24]} />
          </mesh>
        </group>
      ) : null}

      {/* habitats with one warm porthole strip each */}
      <Row count={st.habitat} spacing={4.5} origin={[2, 1.1, 2]}>
        {(i, pos) => (
          <group key={`hab-${i}`} position={pos}>
            <mesh material={MAT.habitat} castShadow receiveShadow>
              <capsuleGeometry args={[1.2, 1.6, 4, 16]} />
            </mesh>
            <mesh position={[0, 0.2, 1.14]} material={MAT.habitatWindow}>
              <boxGeometry args={[0.9, 0.28, 0.16]} />
            </mesh>
          </group>
        )}
      </Row>

      {/* greenhouse streets: the emotional heart, glowing green */}
      {Array.from({ length: st.ghInflatable }, (_, i) => (
        <GreenhouseStreet key={`ghi-${i}`} position={[2 + i * 3.2, 0, -6]} length={10} glow={ghGlow} />
      ))}
      {Array.from({ length: st.ghRigid }, (_, i) => (
        <GreenhouseStreet key={`ghr-${i}`} position={[2 + i * 3.2, 0, -10]} length={8} glow={ghGlow} />
      ))}
      {/* buried grow halls: berms with green portal glow (LED — storm-proof) */}
      {Array.from({ length: st.ghBuried }, (_, i) => (
        <group key={`ghb-${i}`} position={[-8 + i * 5, 0, -8]}>
          <mesh position={[0, 0.7, 0]} material={MAT.berm} castShadow receiveShadow>
            <sphereGeometry args={[2.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[2.1, 0.5, 0]}>
            <boxGeometry args={[0.6, 1, 1.2]} />
            <meshStandardMaterial color="#183820" emissive="#59c96a" emissiveIntensity={1.8} />
          </mesh>
        </group>
      ))}

      {/* compost drums and digesters: visible architecture */}
      <Row count={st.composter} spacing={2.4} origin={[-6, 0.7, 6]}>
        {(i, pos) => (
          <mesh key={`cmp-${i}`} position={pos} rotation={[0, 0, Math.PI / 2]} material={MAT.drum} castShadow receiveShadow>
            <cylinderGeometry args={[0.7, 0.7, 1.8, 12]} />
          </mesh>
        )}
      </Row>
      <Row count={st.digester} spacing={2.6} origin={[-6, 0.9, 9]}>
        {(i, pos) => (
          <group key={`dig-${i}`} position={pos}>
            <mesh material={MAT.digester} castShadow receiveShadow>
              <cylinderGeometry args={[0.9, 0.9, 1.4, 12]} />
            </mesh>
            <mesh position={[0, 0.95, 0]} material={MAT.digester} castShadow>
              <sphereGeometry args={[0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
          </group>
        )}
      </Row>

      {/* soil factory + fab shop */}
      {st.soilFactory > 0 ? (
        <mesh position={[-16, 0.8, 10]} material={MAT.rustSteel} castShadow receiveShadow>
          <boxGeometry args={[3.4, 1.6, 2.6]} />
        </mesh>
      ) : null}
      {st.fabShop > 0 ? (
        <mesh position={[8, 1.4, 8]} material={MAT.steel} castShadow receiveShadow>
          <boxGeometry args={[4.5, 2.8, 3.5]} />
        </mesh>
      ) : null}
    </group>
  );
}

/** Atmosphere rig: sky, fog, sun, and dust all keyed to live optical depth. */
function DustRig(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const site = getSite(sim.siteId);
  // Recompute tau directly so the sky moves even while paused at sol 0.
  const tau =
    sim.history.length > 0
      ? sim.history[sim.history.length - 1].tau
      : opticalDepthAtSol(sim.sol, false, site.dustFactor);
  const sun = sunlightFraction(tau);
  // sunlightFraction tops out near 0.5 on a clear sol; normalize to [0, 1].
  const daylight = clamp(sun / 0.5, 0, 1);
  const fogColor = useMemo(() => new THREE.Color(), []);
  fogColor.copy(SKY_STORM.horizon).lerp(SKY_CLEAR.horizon, daylight);
  // Floors sized so the city (camera distance ~53) stays a legible ghost in
  // the worst global storm instead of vanishing into the murk entirely.
  const fogNear = 24 + daylight * 36;
  const fogFar = 78 + 250 * Math.pow(daylight, 1.4);
  return (
    <>
      <SkyDome daylight={daylight} />
      <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      {/* warm sky bounce + cool ground return instead of flat ambient */}
      <hemisphereLight args={['#e8a06a', '#4a2414', 0.4 + daylight * 0.55]} />
      <directionalLight
        position={[SUN_DIR.x * 90, SUN_DIR.y * 90, SUN_DIR.z * 90]}
        intensity={0.4 + daylight * 3.1}
        color="#ffd9b0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={20}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* night-side worklights */}
      <pointLight position={[0, 8, 0]} intensity={1.6} color="#e2661a" distance={40} />
      <DustParticles tau={tau} />
    </>
  );
}

/** Canvas wrapper: soft-shadowed orbit view of the settlement. */
export function CityScene(): React.ReactElement {
  return (
    <div className="flex-1 relative min-w-0">
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        camera={{ position: [38, 26, 24], fov: 40, near: 0.1, far: 700 }}
        gl={{ antialias: true }}
        style={{ background: '#1c0f0d' }}
      >
        <DustRig />
        <Terrain />
        <Rocks />
        <City />
        <Starships />
        <Rover />
        <OrbitControls
          target={[6, 0, -9]}
          maxPolarAngle={Math.PI / 2.2}
          minDistance={12}
          maxDistance={90}
          enableDamping
        />
        {/* selective bloom: only emissives past the threshold glow (greenhouses,
            beacons, engine plumes, the sun disc) — the rest stays crisp */}
        <EffectComposer multisampling={4}>
          <Bloom luminanceThreshold={0.9} mipmapBlur intensity={0.55} radius={0.6} />
        </EffectComposer>
      </Canvas>
      {/* crisp cinematic vignette; pure CSS, zero GPU cost */}
      <div className="absolute inset-0 pointer-events-none scene-vignette" />
      <div className="absolute bottom-2 left-2 text-[9px] text-[var(--dim)] pointer-events-none">
        drag to orbit · greenhouse glow tracks real light levels · tank fills are live
      </div>
    </div>
  );
}
