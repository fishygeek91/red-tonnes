'use client';

/**
 * Atmosphere rig: butterscotch sky with stars and dust bands, ground haze,
 * wind-blown motes, storm dust devils, a wandering Phobos, and the warm
 * PMREM that makes steel read as steel.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGraphicsTier } from '../../hooks/useGraphicsTier';
import { getSite, opticalDepthAtSol } from '../../lib/sites';
import { rngFromSeed, rngNext, type RngState } from '../../lib/rng';
import type { SimState, SolSnapshot } from '../../lib/sim/state';
import { clamp } from '../../lib/types';
import { sunlightFraction } from '../../lib/sim/step';
import { useSimStore } from '../../store/useSimStore';
import { applyDustCoat, bindCanvasMaps, buildDustSprite, MAT } from './materials';
import { ORBIT } from './orbit';
import { siteLook, SUN_DIR, terrainHeight, type SiteLook } from './regolith';

/**
 * The snapshot the scene should render: the scrubbed sol's when the player
 * is viewing history, else the latest.
 */
function viewSnapshot(sim: SimState, scrubSol: number | null): SolSnapshot | undefined {
  if (sim.history.length === 0) {
    return undefined;
  }
  if (scrubSol === null) {
    return sim.history[sim.history.length - 1];
  }
  const idx = clamp(scrubSol - 1, 0, sim.history.length - 1);
  return sim.history[idx];
}

/** Sky dome shaders: gradient, sun disc, horizon bands, zenith stars. */
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
  uniform float fade;
  float hash13(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  void main() {
    vec3 dir = normalize(vWorldDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 sky = mix(horizonColor, topColor, pow(h, mix(0.48, 0.88, haze)));
    float bands = sin(dir.x * 7.5 + dir.z * 3.2) * 0.5 + 0.5;
    sky = mix(sky, horizonColor * 1.08, (1.0 - h) * 0.18 * (0.35 + 0.65 * bands) * (0.3 + haze));
    float cosSun = max(dot(dir, sunDir), 0.0);
    sky += sunColor * pow(cosSun, mix(26.0, 6.0, haze)) * mix(0.55, 0.2, haze);
    float disc = smoothstep(mix(0.99993, 0.9994, haze), 0.99997, cosSun);
    sky += sunColor * disc * mix(3.4, 0.35, haze);
    float stars = step(0.9965, hash13(floor(dir * 92.0))) * pow(h, 2.2) * (1.0 - haze);
    sky += vec3(0.95, 0.88, 0.8) * stars * 0.65;
    vec3 spaceCol = vec3(0.027, 0.024, 0.039);
    sky = mix(spaceCol, sky, fade);
    gl_FragColor = vec4(sky, 1.0);
  }
`;

/** Scratch colors so the sky can chase a continuous storm mix without allocating. */
const SKY_TOP = new THREE.Color();
const SKY_HORIZON = new THREE.Color();
const SKY_SUN = new THREE.Color();

/** Sky palette endpoints, lerped by live daylight each frame. */
export const SKY_CLEAR = {
  top: new THREE.Color('#1c0f0d'),
  horizon: new THREE.Color('#d49258'),
  sun: new THREE.Color('#ffe8cc'),
};
export const SKY_STORM = {
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
  readonly fade: { value: number };
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
      fade: { value: 1 },
    }),
    [],
  );
  useFrame((_, delta) => {
    const storminess = 1 - props.daylight;
    const k = clamp(delta * 1.5, 0, 1);
    SKY_TOP.copy(SKY_CLEAR.top).lerp(SKY_STORM.top, storminess);
    SKY_HORIZON.copy(SKY_CLEAR.horizon).lerp(SKY_STORM.horizon, storminess);
    SKY_SUN.copy(SKY_CLEAR.sun).lerp(SKY_STORM.sun, storminess);
    uniforms.topColor.value.lerp(SKY_TOP, k);
    uniforms.horizonColor.value.lerp(SKY_HORIZON, k);
    uniforms.sunColor.value.lerp(SKY_SUN, k);
    // eslint-disable-next-line react-hooks/immutability -- three.js uniforms are mutated in the frame loop by design
    uniforms.haze.value += (storminess - uniforms.haze.value) * k;
    uniforms.fade.value = 1 - ORBIT.space;
  });
  return (
    <mesh>
      <sphereGeometry args={[300, 48, 24]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={SKY_VERTEX}
        fragmentShader={SKY_FRAGMENT}
      />
    </mesh>
  );
}

/**
 * Warm PMREM so MeshStandard metals pick up a butterscotch bounce instead
 * of rendering as unlit cavities. Built once from a tiny stand-in scene.
 */
function WarmEnvironment(): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    bindCanvasMaps();
    const gen = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color('#c48452');
    envScene.add(new THREE.HemisphereLight('#ffe8cc', '#4a2414', 1.15));
    const result = gen.fromScene(envScene, 0.02);
    gl.setRenderTarget(null);
    // eslint-disable-next-line react-hooks/immutability -- three.js scene.environment is mutated on mount by design
    scene.environment = result.texture;
    scene.environmentIntensity = 0.42;
    return () => {
      scene.environment = null;
      result.texture.dispose();
      gen.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Soft radial haze hugging the ground — thicker when the sky is dirty. */
function GroundHaze(props: { daylight: number }): React.ReactElement {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const sprite = useMemo(() => buildDustSprite(), []);
  useFrame((_, delta) => {
    if (!mat.current) {
      return;
    }
    const space = ORBIT.space;
    const target = (0.1 + (1 - props.daylight) * 0.2) * (1 - space);
    mat.current.opacity += (target - mat.current.opacity) * Math.min(1, delta * 1.4);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 2.2, 0]} renderOrder={-1}>
      <ringGeometry args={[38, 110, 48]} />
      <meshBasicMaterial
        ref={mat}
        map={sprite ?? undefined}
        color="#c48452"
        transparent
        opacity={0.16}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** Wind-blown dust: a drifting point field that fades in with optical depth. */
function DustParticles(props: { tau: number }): React.ReactElement {
  const count = 1100;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFrame((_, delta) => {
    const targetOpacity = clamp((props.tau - 0.5) / 3.4, 0, 0.58) * (1 - ORBIT.space);
    if (matRef.current) {
      matRef.current.opacity += (targetOpacity - matRef.current.opacity) * Math.min(1, delta * 2);
    }
    const attr = attrRef.current;
    if (!attr || targetOpacity <= 0.001) {
      return;
    }
    const wind = (3 + props.tau * 9) * delta;
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
        size={0.52}
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

/**
 * A wandering dust devil: a widening spiral that fades in once tau climbs
 * past ~1.2. Stays off the graded pad so it does not eat the city.
 */
function DustDevil(props: {
  tau: number;
  look: SiteLook;
  seed: number;
  wander: readonly [number, number];
}): React.ReactElement {
  const count = 260;
  const attrRef = useRef<THREE.BufferAttribute>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const spinRef = useRef<{ angle: Float32Array; height: Float32Array } | null>(null);
  const sprite = useMemo(() => buildDustSprite(), []);
  const positions = useMemo(() => new Float32Array(count * 3), []);
  useFrame((state, delta) => {
    if (spinRef.current === null) {
      const angle = new Float32Array(count);
      const height = new Float32Array(count);
      let rng: RngState = rngFromSeed(props.seed);
      for (let i = 0; i < count; i += 1) {
        const a = rngNext(rng);
        const b = rngNext(a.next);
        rng = b.next;
        angle[i] = a.value * Math.PI * 2;
        height[i] = b.value * 16;
      }
      spinRef.current = { angle, height };
    }
    const spin = spinRef.current;
    const strength = clamp((props.tau - 1.15) / 2.4, 0, 1);
    if (matRef.current) {
      matRef.current.opacity += (strength * 0.7 - matRef.current.opacity) * Math.min(1, delta * 2);
    }
    const attr = attrRef.current;
    if (!attr || strength <= 0.01) {
      return;
    }
    const t = state.clock.elapsedTime * 0.07 + props.seed * 0.01;
    const cx = props.wander[0] + Math.sin(t) * 16;
    const cz = props.wander[1] + Math.cos(t * 0.73) * 12;
    const ground = terrainHeight(cx, cz, props.look);
    const arr = attr.array;
    for (let i = 0; i < count; i += 1) {
      const h0 = spin.height[i] ?? 0;
      const a0 = spin.angle[i] ?? 0;
      const nextA = a0 + delta * (2.8 + h0 * 0.12);
      let nextH = h0 + delta * 3.4;
      if (nextH > 17) {
        nextH -= 17;
      }
      spin.angle[i] = nextA;
      spin.height[i] = nextH;
      const radius = 0.22 + nextH * 0.11;
      arr[i * 3] = cx + Math.cos(nextA) * radius;
      arr[i * 3 + 1] = ground + nextH;
      arr[i * 3 + 2] = cz + Math.sin(nextA) * radius;
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
        color="#e09a58"
        size={0.62}
        map={sprite ?? undefined}
        transparent
        opacity={0}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/** Phobos as a pale potato drifting across the butterscotch sky. */
function Phobos(): React.ReactElement {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) {
      return;
    }
    const t = state.clock.elapsedTime * 0.028;
    g.position.set(Math.cos(t) * 92, 34 + Math.sin(t * 0.8) * 10, Math.sin(t) * 70 - 20);
  });
  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[0.85, 10, 8]} />
        <meshBasicMaterial color="#c8a888" />
      </mesh>
    </group>
  );
}

/**
 * Directional sun. Soft shadows on medium/high; no shadow map on low.
 * @param props.daylight - 0–1 normalized insolation after dust.
 */
function LiteSun(props: { daylight: number }): React.ReactElement {
  const tier = useGraphicsTier();
  if (tier === 'low') {
    return (
      <directionalLight
        position={[SUN_DIR.x * 90, SUN_DIR.y * 90, SUN_DIR.z * 90]}
        intensity={0.45 + props.daylight * 3.2}
        color="#ffd9b0"
      />
    );
  }
  const map = tier === 'high' ? 2048 : 1024;
  return (
    <directionalLight
      position={[SUN_DIR.x * 90, SUN_DIR.y * 90, SUN_DIR.z * 90]}
      intensity={0.45 + props.daylight * 3.2}
      color="#ffd9b0"
      castShadow
      shadow-mapSize={[map, map]}
      shadow-camera-left={-70}
      shadow-camera-right={70}
      shadow-camera-top={70}
      shadow-camera-bottom={-70}
      shadow-camera-near={20}
      shadow-camera-far={220}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
    />
  );
}

/** Expand city fog into space; push it past the far plane once the sky is gone. */
function SceneFog(props: { daylight: number }): React.ReactElement {
  const fogColor = useMemo(() => new THREE.Color('#5f2f1a'), []);
  const spaceTint = useMemo(() => new THREE.Color('#07060a'), []);
  useFrame((state) => {
    const fog = state.scene.fog;
    if (!(fog instanceof THREE.Fog)) {
      return;
    }
    const space = ORBIT.space;
    fog.color.copy(SKY_STORM.horizon).lerp(SKY_CLEAR.horizon, props.daylight);
    fog.color.lerp(spaceTint, space);
    const cityNear = 32 + props.daylight * 28;
    const cityFar = 95 + 210 * Math.pow(props.daylight, 1.35);
    fog.near = cityNear + space * 1800;
    fog.far = space > 0.82 ? 40000 : cityFar + space * 11000;
  });
  return <fog attach="fog" args={[fogColor, 40, 300]} />;
}

/** Atmosphere rig: sky, fog, sun, dust, devils, and the shared beacon pulse. */
export function DustRig(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const scrubSol = useSimStore((s) => s.scrubSol);
  const tier = useGraphicsTier();
  const site = getSite(sim.siteId);
  const look = siteLook(sim.siteId);
  const snap = viewSnapshot(sim, scrubSol);
  const tau = snap ? snap.tau : opticalDepthAtSol(sim.sol, false, site.dustFactor);
  const sun = sunlightFraction(tau);
  const daylight = clamp(sun / 0.5, 0, 1);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const cityFill = useRef<THREE.PointLight>(null);
  const spaceSun = useRef<THREE.DirectionalLight>(null);
  const surface = useRef<THREE.Group>(null);
  const coat = useRef(0);
  useFrame((state, delta) => {
    const pulse = 0.45 + 2.1 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3.4));
    MAT.beacon.emissiveIntensity = pulse;
    const space = ORBIT.space;
    const k = Math.min(1, delta * 1.5);
    coat.current += (1 - daylight - coat.current) * k;
    applyDustCoat(coat.current);
    state.gl.toneMappingExposure = 0.46 + daylight * 0.64;
    state.scene.environmentIntensity = (0.14 + daylight * 0.32) * (1 - space * 0.45);
    if (hemi.current) {
      hemi.current.intensity = (0.42 + daylight * 0.55) * (1 - space * 0.72);
    }
    if (cityFill.current) {
      cityFill.current.intensity = 1.7 * (1 - space) * (0.2 + daylight * 0.8);
    }
    if (spaceSun.current) {
      spaceSun.current.intensity = 0.15 + space * 2.4;
    }
    if (surface.current) {
      surface.current.visible = space < 0.55;
    }
  });
  return (
    <>
      <WarmEnvironment />
      <SkyDome daylight={daylight} />
      <SceneFog daylight={daylight} />
      <hemisphereLight ref={hemi} args={['#e8a06a', '#4a2414', 0.42 + daylight * 0.55]} />
      <LiteSun daylight={daylight} />
      <directionalLight
        ref={spaceSun}
        position={[SUN_DIR.x * 4200, SUN_DIR.y * 4200, SUN_DIR.z * 4200]}
        intensity={0.15}
        color="#fff2e0"
      />
      <pointLight ref={cityFill} position={[0, 8, 0]} intensity={1.7} color="#e2661a" distance={40} />
      <GroundHaze daylight={daylight} />
      <DustParticles tau={tau} />
      <group ref={surface}>
        {tier === 'low' ? null : (
          <>
            <DustDevil tau={tau} look={look} seed={11} wander={[48, 22]} />
            <DustDevil tau={tau} look={look} seed={29} wander={[-52, -28]} />
            <Phobos />
          </>
        )}
      </group>
    </>
  );
}
