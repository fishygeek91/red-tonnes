'use client';

/**
 * Stylized but geographically plausible Mars globe: a procedurally generated
 * hypsometric texture (value noise standing in for MOLA relief, with a
 * Hellas-like low, a Tharsis-like high, and polar caps), plus markers for
 * the preset sites. No cute cartoon Mars; the sky stays thin.
 */

import { OrbitControls } from '@react-three/drei';
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

/** Build the hypsometric Mars texture once. */
function buildMarsTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    const lat = 90 - (y / h) * 180;
    for (let x = 0; x < w; x += 1) {
      const lon = (x / w) * 360 - 180;
      let elev = fbm(x / 60, y / 60) - 0.5;
      // Crustal dichotomy: northern lowlands are smoother and lower.
      elev += lat > 10 ? -0.18 : 0.08;
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
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

/** The spinning globe with site markers. */
function Globe(): React.ReactElement {
  const siteId = useSimStore((s) => s.sim.siteId);
  const texture = useMemo(() => buildMarsTexture(), []);
  const group = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Mesh>(null);

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
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[1, 48, 48]} />
        {texture ? (
          <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
        ) : (
          <meshStandardMaterial color="#8a3c1e" roughness={0.95} />
        )}
      </mesh>
      {/* whisper-thin atmosphere: 6 mbar deserves barely a rim */}
      <mesh>
        <sphereGeometry args={[1.02, 32, 32]} />
        <meshBasicMaterial color="#d8956a" transparent opacity={0.045} side={THREE.BackSide} />
      </mesh>
      {SITES.map((s) => {
        const pos = latLonToVec3(s.latitudeDeg, s.longitudeDeg, 1.01);
        const active = s.id === siteId;
        return (
          <mesh key={s.id} position={pos} ref={active ? marker : undefined}>
            <sphereGeometry args={[active ? 0.028 : 0.014, 8, 8]} />
            <meshBasicMaterial color={active ? '#59c96a' : '#7cc7e8'} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Canvas wrapper for the globe panel. */
export function MarsGlobe(): React.ReactElement {
  return (
    <div className="h-[240px] shrink-0 relative">
      <Canvas camera={{ position: [0, 0.6, 2.4], fov: 40 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.25} />
        <directionalLight position={[4, 2, 3]} intensity={2.2} color="#fff2e0" />
        <Globe />
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
      <div className="absolute bottom-1 left-2 text-[9px] text-[var(--dim)] pointer-events-none">
        MOLA-ish hypsometry · green = your site
      </div>
    </div>
  );
}
