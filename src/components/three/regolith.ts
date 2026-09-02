/**
 * Shared Mars-surface math: value noise, site-specific height fields,
 * crater bowls, and the vertex-colored terrain mesh. Buildings, the rover,
 * and rock scatter all sample the same height so they sit on the ground.
 */

import * as THREE from 'three';
import { clamp } from '../../lib/types';

/** One fixed sun direction for the whole city (light, shadows, sky disc, panels). */
export const SUN_DIR = new THREE.Vector3(0.55, 0.52, 0.42).normalize();

/**
 * Surveyed anchors shared by terrain paint and building placement.
 * Changing a coordinate here moves both the dirt and the architecture.
 */
export const LAYOUT = {
  padOriginX: 13,
  padOriginZ: -18,
  padSpacing: 9,
  mineX: -26,
  mineZ: 14,
  plantX: -14,
  plantZ: 2,
  cryoX: -2,
  cryoZ: -14,
  roverCx: -20,
  roverCz: 8,
  roverRx: 9,
  roverRz: 5.5,
} as const;

/** Visual dialect of one landing site — height, palette, and scatter bias. */
export interface SiteLook {
  /** Site id this look belongs to. */
  readonly id: string;
  /** Multiplier on long-wavelength dunes (1 = Arcadia-ish). */
  readonly duneAmp: number;
  /** Multiplier on nearby knobby hills. */
  readonly knobAmp: number;
  /** Multiplier on crater bowls. */
  readonly craterAmp: number;
  /** Strength of dry-channel cuts (Jezero). */
  readonly channelAmp: number;
  /** How much low ground tints toward ice (Arcadia / Utopia). */
  readonly iceSheet: number;
  /** Boulder-count multiplier. */
  readonly boulderBias: number;
  /** Mid-tone regolith hex. */
  readonly base: string;
  /** High-standing hex. */
  readonly high: string;
  readonly low: string;
  readonly worn: string;
}

/** Arcadia: boring, flat, wet — the default demo. */
const ARCADIA: SiteLook = {
  id: 'arcadia',
  duneAmp: 0.55,
  knobAmp: 0.3,
  craterAmp: 0.65,
  channelAmp: 0,
  iceSheet: 0.62,
  boulderBias: 0.7,
  base: '#8a4e32',
  high: '#b06a42',
  low: '#6a3822',
  worn: '#6d3f28',
};

const LOOKS: Readonly<Record<string, SiteLook>> = {
  arcadia: ARCADIA,
  utopia: {
    id: 'utopia',
    duneAmp: 0.38,
    knobAmp: 0.12,
    craterAmp: 0.95,
    channelAmp: 0,
    iceSheet: 0.28,
    boulderBias: 0.45,
    base: '#7a4030',
    high: '#9a5840',
    low: '#4e281c',
    worn: '#5a3428',
  },
  erebus: {
    id: 'erebus',
    duneAmp: 0.7,
    knobAmp: 1.45,
    craterAmp: 0.55,
    channelAmp: 0,
    iceSheet: 0.4,
    boulderBias: 1.45,
    base: '#8a4628',
    high: '#c06a38',
    low: '#5a2c18',
    worn: '#6a3824',
  },
  hellas: {
    id: 'hellas',
    duneAmp: 1.15,
    knobAmp: 0.55,
    craterAmp: 1.4,
    channelAmp: 0,
    iceSheet: 0,
    boulderBias: 0.95,
    base: '#a05428',
    high: '#d07838',
    low: '#5a2414',
    worn: '#6a3020',
  },
  jezero: {
    id: 'jezero',
    duneAmp: 0.62,
    knobAmp: 0.48,
    craterAmp: 0.85,
    channelAmp: 1.15,
    iceSheet: 0,
    boulderBias: 1.05,
    base: '#7a3e28',
    high: '#a85a34',
    low: '#4a2418',
    worn: '#5c3224',
  },
};

/** Resolve a site id to its surface look, falling back to Arcadia. */
export function siteLook(siteId: string): SiteLook {
  const found = LOOKS[siteId];
  return found ?? ARCADIA;
}

/** Deterministic 2D value-noise helper (no RNG state needed). */
export function noise2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth fractal noise, 4 octaves. */
export function fbm(x: number, y: number): number {
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
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Bowl + raised rim for one crater. Zero outside ~1.35 radii. */
function craterDelta(x: number, z: number, cx: number, cz: number, radius: number, depth: number): number {
  const t = Math.hypot(x - cx, z - cz) / radius;
  if (t >= 1.4) {
    return 0;
  }
  const bowl = -depth * Math.exp(-t * t * 2.4);
  const rim = depth * 0.22 * Math.exp(-((t - 1) * (t - 1)) * 16);
  return bowl + rim;
}

/**
 * Hard-placed craters, all outside the graded base so they do not
 * punch the settlement pad. Positions are survey coordinates, meters-ish.
 */
const CRATERS: readonly { x: number; z: number; r: number; d: number }[] = [
  { x: 34, z: -42, r: 5.8, d: 1.05 },
  { x: -33, z: 36, r: 6.4, d: 1.15 },
  { x: 40, z: 22, r: 4.8, d: 0.75 },
  { x: 52, z: -38, r: 10, d: 1.9 },
  { x: -62, z: 44, r: 15, d: 2.4 },
  { x: 78, z: 56, r: 7.5, d: 1.2 },
  { x: -44, z: -68, r: 12, d: 1.8 },
  { x: 28, z: 74, r: 6.2, d: 0.95 },
  { x: -88, z: -22, r: 17, d: 2.6 },
  { x: 96, z: -76, r: 8.5, d: 1.3 },
  { x: -70, z: -90, r: 9, d: 1.4 },
  { x: 110, z: 20, r: 11, d: 1.6 },
  { x: 18, z: -95, r: 5.4, d: 0.7 },
  { x: -38, z: 58, r: 4.2, d: 0.6 },
  { x: 64, z: 18, r: 5.8, d: 0.85 },
];

/** Nearby Erebus-style knobs so the knobby site reads from the pad. */
const KNOBS: readonly { x: number; z: number; r: number; h: number }[] = [
  { x: 40, z: 30, r: 9, h: 3.4 },
  { x: -36, z: -42, r: 7, h: 2.6 },
  { x: 48, z: -8, r: 6, h: 2.2 },
  { x: -48, z: 22, r: 8, h: 2.9 },
];

/**
 * Terrain height at (x, z) for a site look: graded flat inside the base,
 * then dunes / knobs / craters / channels outside, plus the ice-mine pit.
 */
export function terrainHeight(x: number, z: number, look: SiteLook): number {
  const r = Math.hypot(x, z);
  const outside = smoothstep(26, 62, r);
  let h = (fbm(x * 0.018 + 11.3, z * 0.018 + 5.7) - 0.45) * 7 * look.duneAmp * outside;
  h += (fbm(x * 0.12 + 3.1, z * 0.12 + 8.9) - 0.5) * 0.5 * (0.12 + 0.88 * outside);
  const knobThresh = 0.64 - look.knobAmp * 0.06;
  h += Math.max(0, fbm(x * 0.035 + 90.2, z * 0.035 + 14.8) - knobThresh) * 5.2 * look.knobAmp * outside;
  if (look.knobAmp > 1) {
    for (let i = 0; i < KNOBS.length; i += 1) {
      const k = KNOBS[i];
      if (!k) {
        continue;
      }
      const d = Math.hypot(x - k.x, z - k.z);
      if (d < k.r * 1.4) {
        const u = 1 - smoothstep(k.r * 0.3, k.r, d);
        h += k.h * u * u * (look.knobAmp - 0.4) * outside;
      }
    }
  }
  for (let i = 0; i < CRATERS.length; i += 1) {
    const c = CRATERS[i];
    if (c) {
      h += craterDelta(x, z, c.x, c.z, c.r, c.d) * look.craterAmp;
    }
  }
  if (look.channelAmp > 0) {
    const c1 = Math.abs(Math.sin(x * 0.07 + 2.1) + Math.sin(z * 0.045) * 0.55);
    const c2 = Math.abs(Math.sin((x * 0.35 + z) * 0.055 + 4.0));
    const bed = Math.min(c1, c2 + 0.32);
    h -= (1 - smoothstep(0.12, 0.52, bed)) * 1.7 * look.channelAmp * outside;
  }
  const pitX = Math.abs(x - LAYOUT.mineX) / 7;
  const pitZ = Math.abs(z - LAYOUT.mineZ) / 4.2;
  const pitEdge = Math.max(pitX, pitZ);
  if (pitEdge < 1) {
    h -= 1.35 * (1 - smoothstep(0.72, 1, pitEdge));
  }
  return h - 0.08;
}

/** Distance from (x, z) to the ice-haul road segment (mine → plant). */
function distToHaulRoad(x: number, z: number): number {
  const ax = LAYOUT.mineX;
  const az = LAYOUT.mineZ;
  const bx = LAYOUT.plantX;
  const bz = LAYOUT.plantZ;
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) {
    return Math.hypot(x - ax, z - az);
  }
  const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** How close (x, z) is to a landing-apron blast ring, 1 = on a pad center. */
function padBlast(x: number, z: number): number {
  let best = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const px = LAYOUT.padOriginX + col * LAYOUT.padSpacing;
      const pz = LAYOUT.padOriginZ - row * 8;
      const d = Math.hypot(x - px, z - pz);
      const ring = 1 - smoothstep(1.4, 4.6, d);
      if (ring > best) {
        best = ring;
      }
    }
  }
  return best;
}

/**
 * Build the displaced, vertex-colored regolith mesh for one site.
 * Hypsometric tint, ice-sheet blush, worn pad, haul-road, blast scorch.
 */
export function buildTerrainGeometry(look: SiteLook): THREE.PlaneGeometry {
  const size = 280;
  const segments = 180;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(look.base);
  const high = new THREE.Color(look.high);
  const low = new THREE.Color(look.low);
  const worn = new THREE.Color(look.worn);
  const scorch = new THREE.Color('#3a2a22');
  const track = new THREE.Color('#4a3024');
  const ice = new THREE.Color('#c8d4dc');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ht = terrainHeight(x, z, look);
    pos.setY(i, ht);
    const t = clamp((ht + 0.5) / 3.5, 0, 1);
    c.copy(low).lerp(base, Math.min(1, t * 2)).lerp(high, Math.max(0, t * 2 - 1));
    const patch = fbm(x * 0.05 + 40.7, z * 0.05 + 17.2);
    c.offsetHSL(0, (patch - 0.5) * 0.08, (patch - 0.5) * 0.05);
    const wornMix = 1 - smoothstep(20, 30, Math.hypot(x, z));
    c.lerp(worn, wornMix * 0.65);
    if (look.iceSheet > 0) {
      const outside = smoothstep(28, 70, Math.hypot(x, z));
      const iceMix = look.iceSheet * (1 - smoothstep(-0.2, 0.7, ht)) * outside;
      c.lerp(ice, iceMix * 0.42);
    }
    const road = 1 - smoothstep(0.7, 2.1, distToHaulRoad(x, z));
    c.lerp(track, road * 0.55);
    const ellipse = Math.abs(
      Math.hypot((x - LAYOUT.roverCx) / LAYOUT.roverRx, (z - LAYOUT.roverCz) / LAYOUT.roverRz) - 1,
    );
    const rub = 1 - smoothstep(0.04, 0.16, ellipse);
    c.lerp(track, rub * 0.45);
    c.lerp(scorch, padBlast(x, z) * 0.7);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
