'use client';

/**
 * Stylized but geographically plausible Mars globe: a procedurally generated
 * hypsometric texture (value noise standing in for MOLA relief, with a
 * Hellas-like low, a Tharsis-like high, and polar caps), a fresnel atmosphere
 * rim (6 mbar deserves barely a halo), a slow starfield, and markers for the
 * preset sites.
 */

import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SITES } from '../../lib/sites';
import { useSimStore } from '../../store/useSimStore';

/** Deterministic 2D value-noise helper for the texture (no RNG state needed). */
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

/** Build the hypsometric Mars texture once. (No bump map: derivative lighting
 * amplifies the value-noise lattice into cross-hatch artifacts.) */
function buildMarsTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const w = 512;
  const h = 256;
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
      // Sample noise on a circle in the noise plane so the texture wraps
      // seamlessly at lon ±180 (no vertical seam down the globe).
      const lonRad = (lon * Math.PI) / 180;
      const nx = 5 + Math.cos(lonRad) * 4;
      const nz = 5 + Math.sin(lonRad) * 4;
      const ny = (lat / 90) * 3;
      let elev = fbm(nx + ny * 1.9, nz - ny * 1.4) - 0.5;
      // Crustal dichotomy: northern lowlands are smoother and lower,
      // feathered over ~25 degrees of latitude instead of a hard step.
      const dichotomy = Math.min(1, Math.max(0, (lat + 5) / 25));
      elev += 0.08 - 0.26 * dichotomy;
      // Hellas-like basin (~lat -42, lon 70) and Tharsis-like bulge (~lat 0, lon -110).
      const dHellas = Math.hypot(lat + 42, (lon - 70) * 0.7);
      elev -= 0.5 * Math.exp(-(dHellas * dHellas) / 500);
      const dTharsis = Math.hypot(lat - 0, (lon + 110) * 0.7);
      elev += 0.45 * Math.exp(-(dTharsis * dTharsis) / 800);
      // MOLA-ish hypsometry: deep = dark rust, high = pale orange.
      const t = Math.min(1, Math.max(0, elev + 0.5));
      let r = 90 + t * 130;
      let g = 38 + t * 62;
      let b = 25 + t * 35;
      // Polar caps: CO2/H2O ice above |lat| ~78, feathered.
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

/** Convert lat/lon (degrees) to a position on a unit sphere. */
function latLonToVec3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
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
  void main() {
    // Back-face normals near the limb are perpendicular to the view axis;
    // the small constant keeps the halo hugging the disc, as 6 mbar should.
    float intensity = pow(max(0.22 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 4.0);
    gl_FragColor = vec4(glowColor, 1.0) * intensity * 2.2;
  }
`;

/** The spinning globe with site markers and its whisper-thin atmosphere. */
function Globe(): React.ReactElement {
  const siteId = useSimStore((s) => s.sim.siteId);
  const texture = useMemo(() => buildMarsTexture(), []);
  const group = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);
  const atmoUniforms = useMemo(
    () => ({ glowColor: { value: new THREE.Color('#e08a52') } }),
    [],
  );

  useFrame((state, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.06;
    }
    if (marker.current) {
      const pulse = 1 + 0.35 * Math.sin(state.clock.elapsedTime * 3);
      marker.current.scale.setScalar(pulse);
    }
  });

  return (
    // Mars holds a ~25 degree axial tilt; the markers ride along.
    <group ref={group} rotation={[0, 0, -0.22]}>
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        {texture ? (
          <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
        ) : (
          <meshStandardMaterial color="#8a3c1e" roughness={0.95} />
        )}
      </mesh>
      {/* whisper-thin atmosphere: 6 mbar deserves barely a rim */}
      <mesh>
        <sphereGeometry args={[1.13, 48, 48]} />
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
      {SITES.map((s) => {
        const pos = latLonToVec3(s.latitudeDeg, s.longitudeDeg, 1.01);
        const active = s.id === siteId;
        // Orient the halo ring so it lies flat on the sphere surface.
        const outward = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          pos.clone().normalize(),
        );
        return (
          <group key={s.id} position={pos} ref={active ? marker : undefined}>
            <mesh>
              <sphereGeometry args={[active ? 0.024 : 0.013, 8, 8]} />
              <meshBasicMaterial color={active ? '#59c96a' : '#7cc7e8'} />
            </mesh>
            {active ? (
              <mesh quaternion={outward}>
                <ringGeometry args={[0.04, 0.055, 32]} />
                <meshBasicMaterial color="#59c96a" transparent opacity={0.7} side={THREE.DoubleSide} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

/** Canvas wrapper for the globe panel. */
export function MarsGlobe(): React.ReactElement {
  return (
    <div className="h-[240px] shrink-0 relative">
      <Canvas camera={{ position: [0, 0.6, 2.4], fov: 40 }} gl={{ antialias: true }} dpr={[1, 2]}>
        <ambientLight intensity={0.25} />
        {/* warm key sun + faint cool space fill for a crisp terminator */}
        <directionalLight position={[4, 2, 3]} intensity={2.6} color="#fff2e0" />
        <directionalLight position={[-4, -1, -2]} intensity={0.12} color="#8ab4d8" />
        <Stars radius={40} depth={20} count={1300} factor={2.2} saturation={0} fade speed={0.4} />
        <Globe />
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
      <div className="absolute bottom-1 left-2 text-[9px] text-[var(--dim)] pointer-events-none">
        MOLA-ish hypsometry · green = your site
      </div>
    </div>
  );
}
