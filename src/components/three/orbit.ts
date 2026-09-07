/**
 * Continuous city-to-orbit zoom. Distance is logarithmic so each scroll
 * notch is a similar *perceptual* step from the pad to a whole-planet disc.
 * The globe is a sphere buried just under the settlement so the camera
 * never snaps between two scenes.
 */

import * as THREE from 'three';
import { clamp } from '../../lib/types';

/** Mars radius in city units. Terrain spans ~130; this keeps the pad a local patch. */
export const MARS_RADIUS = 1680;

/** Globe center: north pole sits near the world origin (the city). */
export const GLOBE_CENTER = new THREE.Vector3(0, -MARS_RADIUS, 0);

/** Closest street-level dolly. */
export const DIST_NEAR = 8;

/** Default settlement framing (matches the historic [18, 9, 20] perch). */
export const DIST_CITY = 31.2;

/** Wide disc: ~3.5 radii so a 40° lens sees the limb, not a surface patch. */
export const DIST_FAR = MARS_RADIUS * 4.2;

/** Look-at while walking the streets. */
export const CITY_TARGET = new THREE.Vector3(7, 1.1, -8);

/** Polar cap so the city camera cannot duck under the dirt. */
export const CITY_POLAR = Math.PI / 2.15;

/** Shared per-frame orbit read by the sky, fog, globe, and FX. */
export interface OrbitShare {
  /** Log-zoom in [0, 1]: 0 = street, 1 = wide planet. */
  t: number;
  /** 0 = surface weather, 1 = deep space. Smoothstep of t. */
  space: number;
  /** True while the wheel/pinch is catching up or the user is dragging. */
  busy: boolean;
  /** Pointer is down on the canvas (orbit rotate). */
  drag: boolean;
  /** Storm mix 0–1, written by DustRig so the globe need not subscribe to history. */
  dust: number;
  /** Normalized insolation 0–1 after dust. Written by DustRig each frame. */
  daylight: number;
  /** Live (or scrubbed) optical depth. Written by DustRig each frame. */
  tau: number;
}

/**
 * Live altitude share. ZoomDirector writes it every frame; the sky, fog,
 * and globe read it. A module singleton so we never mutate a React prop.
 */
export const ORBIT: OrbitShare = {
  t: 0,
  space: 0,
  busy: false,
  drag: false,
  dust: 0,
  daylight: 1,
  tau: 0.4,
};

/** Which band the camera is in — used for UI, FX, and pickable pins. */
export type ViewBand = 'city' | 'climb' | 'orbit';

const LOG_NEAR = Math.log(DIST_NEAR);
const LOG_FAR = Math.log(DIST_FAR);
const LOG_SPAN = LOG_FAR - LOG_NEAR;

/** Map a world distance onto the log-zoom slider. */
export function zoomFromDistance(dist: number): number {
  return clamp((Math.log(Math.max(dist, DIST_NEAR)) - LOG_NEAR) / LOG_SPAN, 0, 1);
}

/** Map the log-zoom slider back to a world distance. */
export function distanceFromZoom(t: number): number {
  return Math.exp(LOG_NEAR + clamp(t, 0, 1) * LOG_SPAN);
}

/** Canonical zoom for the settlement hero shot. */
export const CITY_T = zoomFromDistance(DIST_CITY);

ORBIT.t = CITY_T;

/** Canonical zoom for a framed whole-planet view (outside the sphere). */
export const ORBIT_T = zoomFromDistance(MARS_RADIUS * 3.5);

/** Hermite smoothstep on [edge0, edge1]. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * How much the sky/fog have given way to space. Starts only after the
 * old city max-dolly (~90 units) so the hero shot stays butterscotch.
 */
export function spaceFromZoom(t: number): number {
  return smoothstep(0.36, 0.66, t);
}

/**
 * Blend the orbit target from the pad to the planet center. Starts later
 * than `space` so you can see curvature while still circling the city.
 */
export function targetBlendFromZoom(t: number): number {
  return smoothstep(0.7, 0.92, t);
}

/** Classify the current zoom for chrome and feature flags. */
export function bandFromZoom(t: number): ViewBand {
  if (t < 0.4) {
    return 'city';
  }
  if (t < 0.7) {
    return 'climb';
  }
  return 'orbit';
}

/** Linear interpolate. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
