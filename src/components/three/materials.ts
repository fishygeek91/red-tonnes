/**
 * Shared city materials and the few canvas maps that make primitives
 * read as hardware (solar cells, sintered pad grain, steel grain).
 * Allocated once at module load; canvas maps bind on the first client call.
 *
 * Metalness is allowed to sit higher than the old unmapped kit because
 * CityScene installs a warm PMREM environment — without it, steel is a
 * black hole. Storm coating lerps these toward dusty brown in the frame loop.
 */

import * as THREE from 'three';
import { clamp } from '../../lib/types';

/**
 * Paint a 2D canvas and wrap it as a Three texture, or null when there
 * is no document (SSR) or no 2D context.
 * @param width - Canvas width in pixels.
 * @param height - Canvas height in pixels.
 * @param paint - Painter; receives the 2D context and size.
 * @param colorSpace - sRGB for albedo, linear for data maps (normal, roughness, bump).
 */
function canvasMap(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  paint(ctx, width, height);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = colorSpace;
  map.anisotropy = 4;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  return map;
}

/**
 * Deterministic 0–1 hash from an integer index (pad grain, gravel).
 * @param i - Sample index.
 */
function hash1(i: number): number {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/** Dark photovoltaic cells with silver busbars. */
function buildSolarMap(): THREE.CanvasTexture | null {
  return canvasMap(128, 80, (ctx, w, h) => {
    ctx.fillStyle = '#152230';
    ctx.fillRect(0, 0, w, h);
    const cols = 8;
    const rows = 5;
    const gw = w / cols;
    const gh = h / rows;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const shade = 18 + ((x * 17 + y * 13) % 14);
        ctx.fillStyle = `rgb(${shade},${shade + 12},${shade + 28})`;
        ctx.fillRect(x * gw + 1, y * gh + 1, gw - 2, gh - 2);
      }
    }
    ctx.strokeStyle = 'rgba(180, 196, 210, 0.45)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * gw, 0);
      ctx.lineTo(x * gw, h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(200, 170, 120, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  });
}

/** Sintered-regolith grain for landing discs. */
function buildPadMap(): THREE.CanvasTexture | null {
  return canvasMap(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#4a4038';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i += 1) {
      const x = (Math.sin(i * 127.1) * 43758.5453) % 1;
      const y = (Math.sin(i * 311.7) * 23421.917) % 1;
      const px = Math.abs(x) * w;
      const py = Math.abs(y) * h;
      const shade = 50 + (i % 40);
      ctx.fillStyle = `rgba(${shade + 20},${shade},${shade - 8},0.35)`;
      ctx.fillRect(px, py, 1.4, 1.4);
    }
    ctx.strokeStyle = 'rgba(226, 102, 26, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/**
 * Sintered-pad normal: mostly +Z with pebble perturbation.
 * Linear data map — not sRGB.
 */
function buildPadNormal(): THREE.CanvasTexture | null {
  return canvasMap(
    128,
    128,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const n = hash1(x * 19 + y * 47);
          const nx = 128 + (n - 0.5) * 36;
          const ny = 128 + (hash1(x * 31 + y * 13) - 0.5) * 36;
          img.data[i] = nx;
          img.data[i + 1] = ny;
          img.data[i + 2] = 255;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    THREE.LinearSRGBColorSpace,
  );
}

/**
 * Brushed-steel normal: faint longitudinal streaks.
 * Linear data map — not sRGB.
 */
function buildSteelNormal(): THREE.CanvasTexture | null {
  return canvasMap(
    128,
    64,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const streak = hash1(y * 3 + Math.floor(x / 8) * 11);
          img.data[i] = 128 + (streak - 0.5) * 18;
          img.data[i + 1] = 128 + (hash1(x + y * 90) - 0.5) * 8;
          img.data[i + 2] = 255;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    THREE.LinearSRGBColorSpace,
  );
}

/**
 * Brushed-steel roughness: darker streaks read rougher.
 * Linear data map — not sRGB.
 */
function buildSteelRoughness(): THREE.CanvasTexture | null {
  return canvasMap(
    128,
    64,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const shade = 70 + hash1(y * 5 + Math.floor(x / 6)) * 90;
          img.data[i] = shade;
          img.data[i + 1] = shade;
          img.data[i + 2] = shade;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    THREE.LinearSRGBColorSpace,
  );
}

/**
 * Gravel / regolith normal for the city terrain plane.
 * Linear data map — not sRGB.
 */
function buildGravelNormal(): THREE.CanvasTexture | null {
  return canvasMap(
    128,
    128,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const n = hash1(x * 73 + y * 41);
          img.data[i] = 128 + (n - 0.5) * 52;
          img.data[i + 1] = 128 + (hash1(x * 29 + y * 91) - 0.5) * 52;
          img.data[i + 2] = 220 + n * 35;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    THREE.LinearSRGBColorSpace,
  );
}

/** Hex heat-tile grout for Starship barrels. */
export function buildHeatTileMap(): THREE.CanvasTexture | null {
  return canvasMap(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(0, 0, w, h);
    const tw = 8;
    const th = 10;
    for (let y = 0; y < h / th + 1; y += 1) {
      for (let x = 0; x < w / tw + 1; x += 1) {
        const ox = (y % 2) * (tw / 2);
        const shade = 130 + ((x * 19 + y * 7) % 28);
        ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 6})`;
        ctx.fillRect(x * tw + ox + 0.6, y * th + 0.6, tw - 1.2, th - 1.2);
      }
    }
  });
}

/**
 * Heat-tile roughness: grout reads rougher than the tiles.
 * Linear data map — not sRGB.
 */
export function buildHeatTileRoughness(): THREE.CanvasTexture | null {
  return canvasMap(
    64,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(0, 0, w, h);
      const tw = 8;
      const th = 10;
      for (let y = 0; y < h / th + 1; y += 1) {
        for (let x = 0; x < w / tw + 1; x += 1) {
          const ox = (y % 2) * (tw / 2);
          const shade = 55 + ((x * 19 + y * 7) % 22);
          ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
          ctx.fillRect(x * tw + ox + 0.6, y * th + 0.6, tw - 1.2, th - 1.2);
        }
      }
    },
    THREE.LinearSRGBColorSpace,
  );
}

/** Soft radial sprite for dust motes. */
export function buildDustSprite(): THREE.CanvasTexture | null {
  return canvasMap(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Shared city materials — mutate emissiveIntensity / dust coat in the frame loop only. */
export const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: '#a7adb4', roughness: 0.38, metalness: 0.55 }),
  rustSteel: new THREE.MeshStandardMaterial({ color: '#7d5a44', roughness: 0.58, metalness: 0.35 }),
  pad: new THREE.MeshStandardMaterial({ color: '#4a4038', roughness: 0.88, metalness: 0.05 }),
  padRing: new THREE.MeshStandardMaterial({
    color: '#3a3028',
    emissive: '#e2661a',
    emissiveIntensity: 1.6,
    roughness: 0.6,
  }),
  solar: new THREE.MeshStandardMaterial({ color: '#1d2c3c', roughness: 0.22, metalness: 0.45 }),
  habitat: new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.5, metalness: 0.15 }),
  habitatWindow: new THREE.MeshStandardMaterial({
    color: '#241a10',
    emissive: '#ffd9a0',
    emissiveIntensity: 1.8,
    roughness: 0.4,
  }),
  drum: new THREE.MeshStandardMaterial({ color: '#5d6b46', roughness: 0.78 }),
  digester: new THREE.MeshStandardMaterial({ color: '#46605d', roughness: 0.68, metalness: 0.2 }),
  iceTank: new THREE.MeshStandardMaterial({ color: '#7cc7e8', roughness: 0.22, metalness: 0.35 }),
  ch4Tank: new THREE.MeshPhysicalMaterial({
    color: '#c3d0d5',
    roughness: 0.28,
    metalness: 0.55,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
  }),
  waterDome: new THREE.MeshPhysicalMaterial({
    color: '#7cc7e8',
    roughness: 0.12,
    metalness: 0.08,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    // Transmission needs a scene buffer the EffectComposer does not provide.
    transmission: 0,
    thickness: 1.2,
    ior: 1.33,
    clearcoat: 0.55,
    clearcoatRoughness: 0.15,
  }),
  berm: new THREE.MeshStandardMaterial({ color: '#54291a', roughness: 1 }),
  rock: new THREE.MeshStandardMaterial({ color: '#5f2f1c', roughness: 1, flatShading: true }),
  beacon: new THREE.MeshStandardMaterial({
    color: '#3a1505',
    emissive: '#e2661a',
    emissiveIntensity: 1.8,
    roughness: 0.4,
  }),
  frost: new THREE.MeshStandardMaterial({
    color: '#a9d9f0',
    emissive: '#7cc7e8',
    emissiveIntensity: 0.35,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.5,
  }),
  plant: new THREE.MeshStandardMaterial({
    color: '#1a3a22',
    emissive: '#3d9a4a',
    emissiveIntensity: 0.6,
    roughness: 0.85,
  }),
  intake: new THREE.MeshStandardMaterial({ color: '#5c636a', roughness: 0.42, metalness: 0.5 }),
  darkGlass: new THREE.MeshStandardMaterial({ color: '#1a2228', roughness: 0.15, metalness: 0.4 }),
  deck: new THREE.MeshStandardMaterial({ color: '#3a322c', roughness: 0.75 }),
  bunk: new THREE.MeshStandardMaterial({ color: '#6a4030', roughness: 0.7 }),
  cutRim: new THREE.MeshStandardMaterial({
    color: '#c9c4ba',
    emissive: '#e2661a',
    emissiveIntensity: 0.55,
    roughness: 0.4,
  }),
  flare: new THREE.MeshBasicMaterial({ color: '#ff7a2a' }),
  regolith: new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
  }),
};

/** Dust-coat target: a dry, iron-oxide brown. */
const DUST = new THREE.Color('#6a3a22');

/** One coat-able material and the values to restore toward. */
interface CoatEntry {
  readonly mat: THREE.MeshStandardMaterial;
  readonly color: THREE.Color;
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat: number | null;
}

/**
 * Snapshot a material's clear-sol look so storms can lerp without drift.
 * @param mat - Shared standard or physical material.
 * @param clearcoat - Physical clearcoat to restore, or null if none.
 */
function coatEntry(mat: THREE.MeshStandardMaterial, clearcoat: number | null = null): CoatEntry {
  return {
    mat,
    color: mat.color.clone(),
    roughness: mat.roughness,
    metalness: mat.metalness,
    clearcoat,
  };
}

/** Hardware that should look coated in a storm. Beacons and crops are excluded. */
const COAT: readonly CoatEntry[] = [
  coatEntry(MAT.steel),
  coatEntry(MAT.rustSteel),
  coatEntry(MAT.pad),
  coatEntry(MAT.habitat),
  coatEntry(MAT.rock),
  coatEntry(MAT.berm),
  coatEntry(MAT.deck),
  coatEntry(MAT.drum),
  coatEntry(MAT.ch4Tank, 0.45),
  coatEntry(MAT.iceTank),
  coatEntry(MAT.intake),
  coatEntry(MAT.darkGlass),
  coatEntry(MAT.digester),
  coatEntry(MAT.regolith),
];

/**
 * Lerp shared hardware toward a dusty coat. Absolute from the clear-sol
 * snapshot so successive frames do not accumulate. Call from the frame loop.
 * @param amount - 0 = clear sol, 1 = global dust storm.
 */
export function applyDustCoat(amount: number): void {
  const a = clamp(amount, 0, 1);
  for (let i = 0; i < COAT.length; i += 1) {
    const e = COAT[i];
    if (!e) {
      continue;
    }
    e.mat.color.copy(e.color).lerp(DUST, a * 0.78);
    e.mat.roughness = e.roughness + (1 - e.roughness) * a * 0.8;
    e.mat.metalness = e.metalness * (1 - a * 0.85);
    if (e.clearcoat !== null && e.mat instanceof THREE.MeshPhysicalMaterial) {
      e.mat.clearcoat = e.clearcoat * (1 - a * 0.85);
    }
  }
}

let mapsBound = false;

/**
 * Attach canvas maps on the client. Safe to call every mount; no-ops after
 * the first successful bind so HMR does not leak textures.
 */
export function bindCanvasMaps(): void {
  if (mapsBound || typeof document === 'undefined') {
    return;
  }
  const solar = buildSolarMap();
  if (solar) {
    MAT.solar.map = solar;
    MAT.solar.needsUpdate = true;
  }
  const pad = buildPadMap();
  if (pad) {
    pad.repeat.set(1, 1);
    MAT.pad.map = pad;
    MAT.pad.needsUpdate = true;
  }
  const padN = buildPadNormal();
  if (padN) {
    padN.repeat.set(3, 4);
    MAT.pad.normalMap = padN;
    MAT.pad.normalScale = new THREE.Vector2(0.55, 0.55);
    MAT.pad.needsUpdate = true;
  }
  const steelN = buildSteelNormal();
  const steelR = buildSteelRoughness();
  if (steelN) {
    steelN.repeat.set(4, 2);
    MAT.steel.normalMap = steelN;
    MAT.steel.normalScale = new THREE.Vector2(0.35, 0.35);
    MAT.rustSteel.normalMap = steelN;
    MAT.rustSteel.normalScale = new THREE.Vector2(0.45, 0.45);
    MAT.ch4Tank.normalMap = steelN;
    MAT.ch4Tank.normalScale = new THREE.Vector2(0.22, 0.22);
    MAT.ch4Tank.needsUpdate = true;
  }
  if (steelR) {
    steelR.repeat.set(4, 2);
    MAT.steel.roughnessMap = steelR;
    MAT.intake.roughnessMap = steelR;
    MAT.ch4Tank.roughnessMap = steelR;
  }
  MAT.steel.needsUpdate = true;
  MAT.rustSteel.needsUpdate = true;
  const gravel = buildGravelNormal();
  if (gravel) {
    gravel.repeat.set(28, 28);
    MAT.regolith.normalMap = gravel;
    MAT.regolith.normalScale = new THREE.Vector2(0.58, 0.58);
    MAT.regolith.needsUpdate = true;
  }
  mapsBound = true;
}
