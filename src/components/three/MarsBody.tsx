'use client';

/**
 * Shared Mars globe: MOLA-ish hypsometry, a whisper-thin atmosphere, and
 * site markers. Used by the sidebar spinner and the city-canvas planet view.
 */

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Site } from '../../lib/sites';
import { SITES } from '../../lib/sites';
import { fbm, noise2 } from './regolith';

/** Color + linear bump painted once per session (sidebar + city share it). */
export interface MarsMaps {
  readonly color: THREE.CanvasTexture;
  readonly bump: THREE.CanvasTexture;
}

let marsMaps: MarsMaps | null = null;

/**
 * Paint the hypsometric albedo and a linear bump map once, then reuse.
 * @returns Shared maps, or null during SSR / missing 2D context.
 */
export function getMarsMaps(): MarsMaps | null {
  if (marsMaps) {
    return marsMaps;
  }
  if (typeof document === 'undefined') {
    return null;
  }
  const w = 1024;
  const h = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const colorCtx = colorCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  if (!colorCtx || !bumpCtx) {
    return null;
  }
  const colorImg = colorCtx.createImageData(w, h);
  const bumpImg = bumpCtx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    const lat = 90 - (y / h) * 180;
    for (let x = 0; x < w; x += 1) {
      const lon = (x / w) * 360 - 180;
      const lonRad = (lon * Math.PI) / 180;
      const nx = 5 + Math.cos(lonRad) * 4;
      const nz = 5 + Math.sin(lonRad) * 4;
      const ny = (lat / 90) * 3;
      let elev = fbm(nx + ny * 1.9, nz - ny * 1.4) - 0.5;
      const dichotomy = Math.min(1, Math.max(0, (lat + 5) / 25));
      elev += 0.08 - 0.26 * dichotomy;
      const dHellas = Math.hypot(lat + 42, (lon - 70) * 0.7);
      elev -= 0.5 * Math.exp(-(dHellas * dHellas) / 500);
      const dArgyre = Math.hypot(lat + 50, (lon + 43) * 0.75);
      elev -= 0.28 * Math.exp(-(dArgyre * dArgyre) / 180);
      const dTharsis = Math.hypot(lat - 0, (lon + 110) * 0.7);
      elev += 0.45 * Math.exp(-(dTharsis * dTharsis) / 800);
      const dOlympus = Math.hypot(lat - 18.6, (lon + 133.8) * 0.75);
      elev += 0.55 * Math.exp(-(dOlympus * dOlympus) / 28);
      const dArsia = Math.hypot(lat + 9, (lon + 120) * 0.8);
      elev += 0.22 * Math.exp(-(dArsia * dArsia) / 18);
      if (lon > -100 && lon < -30 && Math.abs(lat + 8) < 9) {
        const trench = Math.exp(-((lat + 8) * (lat + 8)) / 14);
        elev -= 0.32 * trench;
      }
      const craterHash = noise2(Math.floor(lon * 0.9), Math.floor(lat * 0.9));
      if (craterHash > 0.93 && lat < 20) {
        elev -= 0.08 * (craterHash - 0.93) * 12;
      }
      const t = Math.min(1, Math.max(0, elev + 0.5));
      let r = 90 + t * 130;
      let g = 38 + t * 62;
      let b = 25 + t * 35;
      const albedo = fbm(nx * 1.6 + 20, nz * 1.6 - 8);
      r -= albedo * 18 * dichotomy;
      g -= albedo * 10 * dichotomy;
      b -= albedo * 6 * dichotomy;
      const cap = Math.min(1, Math.max(0, (Math.abs(lat) - 74) / 8));
      r = r * (1 - cap) + 235 * cap;
      g = g * (1 - cap) + 240 * cap;
      b = b * (1 - cap) + 245 * cap;
      const i = (y * w + x) * 4;
      colorImg.data[i] = r;
      colorImg.data[i + 1] = g;
      colorImg.data[i + 2] = b;
      colorImg.data[i + 3] = 255;
      const bump = Math.min(255, Math.max(0, t * 255));
      bumpImg.data[i] = bump;
      bumpImg.data[i + 1] = bump;
      bumpImg.data[i + 2] = bump;
      bumpImg.data[i + 3] = 255;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  const color = new THREE.CanvasTexture(colorCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = 4;
  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.colorSpace = THREE.LinearSRGBColorSpace;
  bump.anisotropy = 4;
  marsMaps = { color, bump };
  return marsMaps;
}

/** Build the hypsometric Mars albedo once per session (shared with bump). */
export function buildMarsTexture(): THREE.CanvasTexture | null {
  const maps = getMarsMaps();
  return maps ? maps.color : null;
}

/** Convert lat/lon (degrees) to a position on a sphere of the given radius. */
export function latLonToVec3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon),
  );
}

/** View-dependent limb with a sun terminator and τ-tinted dust. */
const ATMO_VERTEX = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ATMO_FRAGMENT = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  uniform vec3 glowColor;
  uniform vec3 sunDir;
  uniform float strength;
  uniform float dust;
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 v = normalize(vViewDir);
    float fresnel = pow(1.0 - abs(dot(n, v)), 2.8);
    float sunFacing = smoothstep(-0.2, 0.5, dot(n, sunDir));
    float night = 0.18 + 0.82 * sunFacing;
    vec3 col = mix(glowColor, vec3(0.55, 0.28, 0.16), dust);
    gl_FragColor = vec4(col * fresnel * night * 2.05 * strength, 1.0);
  }
`;

/** Props for the reusable Mars body. */
export interface MarsBodyProps {
  /** Sphere radius in scene units. */
  readonly radius?: number;
  /** Slow sidereal spin (sidebar). Off in the orbital view so sites stay put. */
  readonly autoSpin?: boolean;
  /** Whether to draw site name labels. */
  readonly labels?: boolean;
  /** Whether markers are clickable. */
  readonly pickable?: boolean;
  /** Hide pins (used while the camera is still on the dirt). */
  readonly showPins?: boolean;
  /** Hide the limb glow (it would swallow the city sky at radius 1680). */
  readonly showAtmosphere?: boolean;
  /** Absolute pin radius. Defaults to a fraction of the globe. */
  readonly pinSize?: number;
  /** drei Html distanceFactor for labels. */
  readonly labelDistanceFactor?: number;
  /** Atmosphere rim strength 0–1. */
  readonly atmoStrength?: number;
  /** Dust optical-depth mix 0–1 for the limb tint (city orbit). */
  readonly dustAmount?: number;
  /** World-space sun direction for the terminator. */
  readonly sunDir?: THREE.Vector3;
  /** Currently selected run site. */
  readonly activeSiteId: string;
  /** Site whose dossier is open, if any. */
  readonly focusId?: string | null;
  /** Fired when a marker is clicked. */
  readonly onPickSite?: (site: Site) => void;
}

/** Tilted site direction on the unit sphere. */
function tiltedSiteDir(site: Site): THREE.Vector3 {
  const dir = latLonToVec3(site.latitudeDeg, site.longitudeDeg, 1);
  dir.applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.22);
  const len = dir.length();
  if (len < 1e-6) {
    return new THREE.Vector3(0, 1, 0);
  }
  return dir.multiplyScalar(1 / len);
}

/**
 * Quaternion that turns the tilted globe so `site` faces +Z (sidebar camera).
 */
export function faceSiteQuat(site: Site): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(tiltedSiteDir(site), new THREE.Vector3(0, 0, 1));
}

/**
 * Quaternion that turns the tilted globe so `site` is the north pole.
 * Used when the settlement sits on the surface at the world origin.
 */
export function faceSiteToUp(site: Site): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(tiltedSiteDir(site), new THREE.Vector3(0, 1, 0));
}

/**
 * Outward unit vector from globe center through `site` after `pole`
 * (the home-site-to-+Y rotation used by the city canvas).
 */
export function siteOutward(site: Site, pole: THREE.Quaternion): THREE.Vector3 {
  return tiltedSiteDir(site).applyQuaternion(pole);
}

/** Default sidebar sun so the spinner has a terminator without city SUN_DIR. */
const SIDEBAR_SUN = new THREE.Vector3(0.7, 0.45, 0.4).normalize();

/** Typed atmosphere uniforms. */
interface AtmoUniforms {
  readonly glowColor: { value: THREE.Color };
  readonly sunDir: { value: THREE.Vector3 };
  readonly strength: { value: number };
  readonly dust: { value: number };
  [uniform: string]: { value: unknown };
}

/** The globe mesh, atmosphere, and site pins. */
export function MarsBody(props: MarsBodyProps): React.ReactElement {
  const radius = props.radius ?? 1;
  const showPins = props.showPins ?? true;
  const showAtmosphere = props.showAtmosphere ?? true;
  const maps = useMemo(() => getMarsMaps(), []);
  const group = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);
  const atmoUniforms = useMemo<AtmoUniforms>(
    () => ({
      glowColor: { value: new THREE.Color('#e08a52') },
      sunDir: { value: SIDEBAR_SUN.clone() },
      strength: { value: 1 },
      dust: { value: 0 },
    }),
    [],
  );

  /* eslint-disable react-hooks/immutability -- three.js uniforms mutate in the frame loop */
  useFrame((state, delta) => {
    if (props.autoSpin && group.current) {
      group.current.rotation.y += delta * 0.06;
    }
    if (marker.current) {
      const pulse = 1 + 0.35 * Math.sin(state.clock.elapsedTime * 3);
      marker.current.scale.setScalar(pulse);
    }
    atmoUniforms.strength.value = props.atmoStrength ?? 1;
    atmoUniforms.dust.value = props.dustAmount ?? 0;
    atmoUniforms.sunDir.value.copy(props.sunDir ?? SIDEBAR_SUN);
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <group ref={group} rotation={[0, 0, -0.22]}>
      <mesh>
        <sphereGeometry args={[radius, 96, 96]} />
        {maps ? (
          <meshStandardMaterial
            map={maps.color}
            bumpMap={maps.bump}
            bumpScale={radius > 10 ? 12 : 0.04}
            roughness={0.92}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial color="#8a3c1e" roughness={0.95} />
        )}
      </mesh>
      {showAtmosphere ? (
        <mesh>
          <sphereGeometry args={[radius * (radius > 10 ? 1.028 : 1.13), 48, 48]} />
          <shaderMaterial
            side={THREE.BackSide}
            transparent
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            uniforms={atmoUniforms}
            vertexShader={ATMO_VERTEX}
            fragmentShader={ATMO_FRAGMENT}
          />
        </mesh>
      ) : null}
      {showPins
        ? SITES.map((s) => {
            const pos = latLonToVec3(s.latitudeDeg, s.longitudeDeg, radius * 1.006);
            const active = s.id === props.activeSiteId;
            const focused = s.id === props.focusId;
            const outward = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 0, 1),
              pos.clone().normalize(),
            );
            const pin = props.pinSize ?? (active ? 0.026 : 0.016) * radius;
            return (
              <group
                key={s.id}
                position={pos}
                ref={active ? marker : undefined}
                onClick={
                  props.pickable && props.onPickSite
                    ? (e) => {
                        e.stopPropagation();
                        props.onPickSite?.(s);
                      }
                    : undefined
                }
                onPointerOver={
                  props.pickable
                    ? (e) => {
                        e.stopPropagation();
                        document.body.style.cursor = 'pointer';
                      }
                    : undefined
                }
                onPointerOut={
                  props.pickable
                    ? () => {
                        document.body.style.cursor = 'default';
                      }
                    : undefined
                }
              >
                <mesh>
                  <sphereGeometry args={[pin, 10, 10]} />
                  <meshBasicMaterial color={active ? '#59c96a' : focused ? '#e2661a' : '#7cc7e8'} />
                </mesh>
                {active || focused ? (
                  <mesh quaternion={outward}>
                    <ringGeometry args={[pin * 1.7, pin * 2.3, 28]} />
                    <meshBasicMaterial
                      color={active ? '#59c96a' : '#e2661a'}
                      transparent
                      opacity={0.75}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                ) : null}
                {props.labels ? (
                  <Html
                    center
                    sprite
                    distanceFactor={props.labelDistanceFactor ?? 3.6}
                    style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
                  >
                    <div
                      className={`text-[9px] tracking-wide -translate-y-3 ${
                        active ? 'text-[var(--green)]' : focused ? 'text-[var(--rust-hot)]' : 'text-[var(--ice)]'
                      }`}
                    >
                      {s.name}
                      {active ? ' · you' : ''}
                    </div>
                  </Html>
                ) : null}
              </group>
            );
          })
        : null}
    </group>
  );
}
