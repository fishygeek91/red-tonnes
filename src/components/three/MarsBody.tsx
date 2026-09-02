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

/** Build the hypsometric Mars texture once per session. */
export function buildMarsTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const w = 1024;
  const h = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const colorCtx = colorCanvas.getContext('2d');
  if (!colorCtx) {
    return null;
  }
  const colorImg = colorCtx.createImageData(w, h);
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
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
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

/** Fresnel-style limb glow: brightest at the planet edge, fading outward. */
const ATMO_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ATMO_FRAGMENT = /* glsl */ `
  varying vec3 vNormal;
  uniform vec3 glowColor;
  uniform float strength;
  void main() {
    float intensity = pow(max(0.22 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 4.0);
    gl_FragColor = vec4(glowColor, 1.0) * intensity * 2.2 * strength;
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

/** The globe mesh, atmosphere, and site pins. */
export function MarsBody(props: MarsBodyProps): React.ReactElement {
  const radius = props.radius ?? 1;
  const showPins = props.showPins ?? true;
  const showAtmosphere = props.showAtmosphere ?? true;
  const texture = useMemo(() => buildMarsTexture(), []);
  const group = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);
  const atmoUniforms = useMemo(
    () => ({
      glowColor: { value: new THREE.Color('#e08a52') },
      strength: { value: 1 },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (props.autoSpin && group.current) {
      group.current.rotation.y += delta * 0.06;
    }
    if (marker.current) {
      const pulse = 1 + 0.35 * Math.sin(state.clock.elapsedTime * 3);
      marker.current.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={group} rotation={[0, 0, -0.22]}>
      <mesh>
        <sphereGeometry args={[radius, 96, 96]} />
        {texture ? (
          <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
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
