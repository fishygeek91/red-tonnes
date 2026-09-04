'use client';

/**
 * The city as an orbitable cutaway: pads, power fields, ISRU plant, ice mine,
 * habitats, greenhouse streets (they glow), compost drums, digesters, and the
 * cryo tank farm with live fill levels. Composting is visible architecture,
 * not an icon.
 *
 * Rendering notes: one soft-shadowed sun keyed to the live dust optical depth,
 * a butterscotch sky with stars and dust bands, site-specific cratered
 * regolith, instanced rock scatter, storm dust devils, and a warm PMREM so
 * steel reads as steel.
 */

import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA } from '@react-three/postprocessing';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGraphicsTier } from '../../hooks/useGraphicsTier';
import { useNarrowViewport } from '../../hooks/useNarrowViewport';
import { rngFromSeed, rngNext, type RngState } from '../../lib/rng';
import { getSite, opticalDepthAtSol, SITES, type Site } from '../../lib/sites';
import { inspect } from '../../lib/sim/inspect';
import { sunlightFraction } from '../../lib/sim/step';
import { clamp } from '../../lib/types';
import { useSimStore, type GraphicsQuality } from '../../store/useSimStore';
import { DustRig } from './atmosphere';
import { MAT } from './materials';
import { faceSiteToUp, MarsBody, siteOutward } from './MarsBody';
import {
  bandFromZoom,
  CITY_POLAR,
  CITY_T,
  CITY_TARGET,
  distanceFromZoom,
  DIST_FAR,
  DIST_NEAR,
  GLOBE_CENTER,
  lerp,
  MARS_RADIUS,
  ORBIT_T,
  ORBIT,
  type ViewBand,
  spaceFromZoom,
  targetBlendFromZoom,
} from './orbit';
import { buildTerrainGeometry, siteLook, SUN_DIR, terrainHeight } from './regolith';
import { Pick } from './Pick';
import { Settlement } from './Settlement';
import { Starships } from './Starships';

/** Reused by the zoom director so the frame loop does not allocate. */
const SCRATCH_DIR = new THREE.Vector3();
const SCRATCH_TARGET = new THREE.Vector3();

/** The HTML inspection card overlaid on the scene when a structure is selected. */
function InspectCard(): React.ReactElement | null {
  const sim = useSimStore((s) => s.sim);
  const inspectId = useSimStore((s) => s.inspectId);
  const setInspect = useSimStore((s) => s.setInspect);
  const narrow = useNarrowViewport();
  if (inspectId === null) {
    return null;
  }
  const card = inspect(sim, inspectId);
  const chrome = narrow
    ? 'absolute inset-x-2 bottom-2 max-h-[45%] overflow-y-auto w-auto'
    : 'absolute top-2 left-2 w-[280px]';
  return (
    <div className={`${chrome} panel border border-[var(--rust)] p-3 z-20 shadow-lg`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <div className="text-[11px] text-[var(--rust-hot)] font-bold tracking-widest uppercase">
            {card.title}
          </div>
          {card.count !== null ? (
            <div className="num text-[10px] text-[var(--dim)]">×{card.count} built</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setInspect(null)}
          className="min-w-11 min-h-11 text-[var(--dim)] hover:text-[var(--text)] text-lg leading-none"
          title="Close"
          aria-label="Close datasheet"
        >
          ×
        </button>
      </div>
      <p className="text-[10px] text-[var(--dim)] leading-snug mb-2">{card.blurb}</p>
      <div className="space-y-0.5">
        {card.lines.map((line) => (
          <div key={line.label} className="flex justify-between gap-2 text-[10px]">
            <span className="text-[var(--dim)] shrink-0">{line.label}</span>
            <span
              className={`num text-right ${
                line.tone === 'warn'
                  ? 'text-[var(--warn)]'
                  : line.tone === 'good'
                    ? 'text-[var(--green)]'
                    : 'text-[var(--text)]'
              }`}
            >
              {line.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sculpted, cratered, vertex-colored regolith for the current site. */
function Terrain(): React.ReactElement {
  const siteId = useSimStore((s) => s.sim.siteId);
  const geometry = useMemo(() => buildTerrainGeometry(siteLook(siteId)), [siteId]);
  return (
    <mesh geometry={geometry} receiveShadow material={MAT.regolith} />
  );
}

/**
 * Scatter one instanced rock field. `minR` keeps pebbles on the pad and
 * boulders off it. Pebbles skip `castShadow` so 400 specks do not fill
 * the shadow map.
 */
function RockField(props: {
  count: number;
  seed: number;
  geometry: THREE.BufferGeometry;
  minR: number;
  maxR: number;
  scaleMin: number;
  scaleMax: number;
  siteId: string;
  castShadow?: boolean;
}): React.ReactElement {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const look = siteLook(props.siteId);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const shade = new THREE.Color();
    let rng: RngState = rngFromSeed(props.seed);
    const draw = (): number => {
      const d = rngNext(rng);
      rng = d.next;
      return d.value;
    };
    for (let i = 0; i < props.count; i += 1) {
      const angle = draw() * Math.PI * 2;
      const radius = props.minR + draw() * (props.maxR - props.minR);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const span = props.scaleMax - props.scaleMin;
      const scale = props.scaleMin + draw() * draw() * span;
      p.set(x, terrainHeight(x, z, look) + scale * 0.28, z);
      e.set(draw() * Math.PI, draw() * Math.PI, draw() * Math.PI);
      q.setFromEuler(e);
      s.set(scale * (0.7 + draw() * 0.6), scale * (0.5 + draw() * 0.55), scale);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      shade.setHSL(0.05, 0.4 + draw() * 0.14, 0.14 + draw() * 0.12);
      mesh.setColorAt(i, shade);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [
    props.count,
    props.maxR,
    props.minR,
    props.scaleMax,
    props.scaleMin,
    props.seed,
    props.siteId,
  ]);
  return (
    <instancedMesh
      ref={ref}
      args={[props.geometry, MAT.rock, props.count]}
      castShadow={props.castShadow ?? true}
      receiveShadow
      frustumCulled={false}
    />
  );
}

/** Basalt scatter: boulders, mid rocks, and pad pebbles, biased by site. */
function Rocks(): React.ReactElement {
  const siteId = useSimStore((s) => s.sim.siteId);
  const bias = siteLook(siteId).boulderBias;
  const boulderGeo = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  const midGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  const pebbleGeo = useMemo(() => new THREE.TetrahedronGeometry(1, 0), []);
  const boulders = Math.max(20, Math.round(80 * bias));
  const mids = Math.max(60, Math.round(220 * (0.7 + bias * 0.3)));
  return (
    <group>
      <RockField
        count={boulders}
        seed={1971}
        geometry={boulderGeo}
        minR={36}
        maxR={130}
        scaleMin={0.35}
        scaleMax={1.35}
        siteId={siteId}
      />
      <RockField
        count={mids}
        seed={2018}
        geometry={midGeo}
        minR={32}
        maxR={120}
        scaleMin={0.12}
        scaleMax={0.55}
        siteId={siteId}
      />
      <RockField
        count={420}
        seed={4242}
        geometry={pebbleGeo}
        minR={6}
        maxR={40}
        scaleMin={0.04}
        scaleMax={0.14}
        siteId={siteId}
        castShadow={false}
      />
    </group>
  );
}

/** Ice-hauler rover: loops between the ice mine and the ISRU plant. */
function Rover(): React.ReactElement {
  const siteId = useSimStore((s) => s.sim.siteId);
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) {
      return;
    }
    const t = state.clock.elapsedTime * 0.22;
    const x = -20 + Math.cos(t) * 9;
    const z = 8 + Math.sin(t) * 5.5;
    g.position.set(x, terrainHeight(x, z, siteLook(siteId)) + 0.42, z);
    g.rotation.y = Math.atan2(Math.sin(t) * 9, Math.cos(t) * 5.5);
  });
  return (
    <group ref={group}>
      <mesh position={[0, 0.1, 0]} material={MAT.rustSteel} castShadow>
        <boxGeometry args={[1.15, 0.38, 0.72]} />
      </mesh>
      <mesh position={[-0.18, 0.4, 0]} material={MAT.iceTank} castShadow>
        <boxGeometry args={[0.62, 0.28, 0.56]} />
      </mesh>
      <mesh position={[0.42, 0.38, 0]} material={MAT.darkGlass}>
        <boxGeometry args={[0.28, 0.22, 0.5]} />
      </mesh>
      <mesh position={[0.55, 0.22, 0]} material={MAT.beacon}>
        <boxGeometry args={[0.08, 0.08, 0.55]} />
      </mesh>
      <mesh position={[0.2, 0.58, 0]} material={MAT.steel}>
        <cylinderGeometry args={[0.03, 0.03, 0.45, 6]} />
      </mesh>
      <mesh position={[0.42, 0.52, 0]} material={MAT.beacon}>
        <sphereGeometry args={[0.055, 8, 8]} />
      </mesh>
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

/**
 * Always present through a composer. PMREM / orbit camera writes can leave
 * the default framebuffer unbound; without a composer the canvas stays black
 * on phones and in planet view. Rich passes stay city + medium/high only.
 */
function SceneFX(props: { tier: GraphicsQuality; city: boolean }): React.ReactElement {
  const rich = props.city && props.tier !== 'low';
  const high = props.city && props.tier === 'high';
  return (
    <EffectComposer multisampling={high ? 4 : 0}>
      {high ? <N8AO aoRadius={2.2} intensity={1.05} quality="medium" halfRes color="#2a140c" /> : null}
      {rich ? <Bloom luminanceThreshold={0.82} mipmapBlur intensity={0.5} radius={0.52} /> : null}
      {rich ? <SMAA /> : null}
    </EffectComposer>
  );
}

/** Span between the first two touches, or null. */
function pinchSpan(e: TouchEvent): number | null {
  if (e.touches.length < 2) {
    return null;
  }
  const a = e.touches.item(0);
  const b = e.touches.item(1);
  if (!a || !b) {
    return null;
  }
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Narrow the default R3F controls handle to the fields we dolly. */
function isDolly(value: unknown): value is {
  target: THREE.Vector3;
  minPolarAngle: number;
  maxPolarAngle: number;
  enablePan: boolean;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('target' in value)) {
    return false;
  }
  return value.target instanceof THREE.Vector3;
}

/** R3F cameras are Perspective; avoid `instanceof` across duplicate three copies. */
function isPerspective(cam: THREE.Camera): cam is THREE.PerspectiveCamera {
  return 'isPerspectiveCamera' in cam && cam.isPerspectiveCamera === true;
}

/**
 * Owns the log-zoom slider: wheel and pinch change the goal, the frame
 * loop damps toward it and places the camera on a sphere around a target
 * that slides from the pad to the planet center. No mode snap.
 */
function ZoomDirector(props: {
  tGoal: React.RefObject<number>;
  lookDir: React.RefObject<THREE.Vector3 | null>;
  onBand: (band: ViewBand) => void;
}): React.ReactElement | null {
  const { tGoal, onBand } = props;
  const gl = useThree((s) => s.gl);
  const t = useRef(CITY_T);
  const lastBand = useRef<ViewBand>('city');
  const pinch = useRef<number | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      tGoal.current = clamp(tGoal.current + dy * 0.00018, 0, 1);
    };
    const onTouchStart = (e: TouchEvent): void => {
      pinch.current = pinchSpan(e);
    };
    const onTouchMove = (e: TouchEvent): void => {
      const span = pinchSpan(e);
      if (span === null || pinch.current === null || pinch.current < 1) {
        pinch.current = span;
        return;
      }
      e.preventDefault();
      const ratio = span / pinch.current;
      tGoal.current = clamp(tGoal.current - Math.log(ratio) * 0.4, 0, 1);
      pinch.current = span;
    };
    const onTouchEnd = (): void => {
      pinch.current = null;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [gl, tGoal]);

  useFrame((state, delta) => {
    if (state.size.width < 8 || state.size.height < 8) {
      return;
    }
    t.current += (tGoal.current - t.current) * (1 - Math.exp(-delta * 3.6));
    const zoom = t.current;
    const space = spaceFromZoom(zoom);
    const blend = targetBlendFromZoom(zoom);
    const framed = zoom >= ORBIT_T * 0.92;
    const dist = framed
      ? Math.max(distanceFromZoom(zoom), MARS_RADIUS * 3.5)
      : distanceFromZoom(zoom);
    ORBIT.t = zoom;
    ORBIT.space = space;
    SCRATCH_TARGET.copy(CITY_TARGET).lerp(GLOBE_CENTER, framed ? 1 : blend);
    const c = isDolly(state.controls) ? state.controls : null;
    if (c) {
      c.target.copy(SCRATCH_TARGET);
      c.minPolarAngle = lerp(0, 0.06, space);
      c.maxPolarAngle = lerp(CITY_POLAR, Math.PI - 0.08, space);
      c.enablePan = space < 0.12;
    }
    const pivot = c ? c.target : SCRATCH_TARGET;
    const cam = state.camera;
    SCRATCH_DIR.copy(cam.position).sub(pivot);
    if (SCRATCH_DIR.lengthSq() < 1e-6) {
      SCRATCH_DIR.set(0.42, 0.32, 0.84);
    }
    SCRATCH_DIR.normalize();
    const lookAt = props.lookDir;
    const look = lookAt === undefined ? null : lookAt.current;
    if (framed && look !== null) {
      SCRATCH_DIR.lerp(look, 1 - Math.exp(-delta * 2.8));
      const len = SCRATCH_DIR.length();
      if (len > 1e-6) {
        SCRATCH_DIR.multiplyScalar(1 / len);
      }
    }
    SCRATCH_DIR.setLength(dist);
    cam.position.copy(pivot).add(SCRATCH_DIR);
    if (!c) {
      cam.lookAt(pivot);
    }
    if (isPerspective(cam)) {
      cam.aspect = state.size.width / state.size.height;
      cam.near = lerp(0.12, 6, space);
      cam.far = lerp(800, 16000, space);
      cam.updateProjectionMatrix();
    }
    const band = bandFromZoom(zoom);
    if (band !== lastBand.current) {
      lastBand.current = band;
      onBand(band);
    }
  }, 1);

  return null;
}

/** Hide the settlement once it is smaller than a pin on the disc. */
function CityLayer(props: { children: React.ReactNode }): React.ReactElement {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (group.current) {
      group.current.visible = ORBIT.t < 0.72;
    }
  });
  return <group ref={group}>{props.children}</group>;
}

/** Dossier for a pin on the orbital globe. */
function SiteDossier(props: {
  site: Site;
  home: boolean;
  sol: number;
  onDropToCity: () => void;
  onLandHere: () => void;
  onChooseCargo: () => void;
  onClose: () => void;
}): React.ReactElement {
  const narrow = useNarrowViewport();
  const chrome = narrow
    ? 'absolute inset-x-2 bottom-2 w-auto'
    : 'absolute top-2 left-2 w-[280px]';
  return (
    <div className={`${chrome} panel border border-[var(--rust)] p-3 z-20 shadow-lg`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <div className="text-[11px] text-[var(--rust-hot)] font-bold tracking-widest uppercase">
            {props.site.name}
          </div>
          <div className="num text-[10px] text-[var(--dim)]">
            {props.site.latitudeDeg.toFixed(1)}°{props.site.latitudeDeg >= 0 ? 'N' : 'S'} ·{' '}
            {Math.abs(props.site.longitudeDeg).toFixed(1)}°{props.site.longitudeDeg >= 0 ? 'E' : 'W'}
          </div>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="min-w-11 min-h-11 text-[var(--dim)] hover:text-[var(--text)] text-lg leading-none"
          title="Close"
          aria-label="Close site dossier"
        >
          ×
        </button>
      </div>
      <p className="text-[10px] text-[var(--dim)] leading-snug mb-2">{props.site.blurb}</p>
      <div className="space-y-0.5 mb-2">
        <div className="flex justify-between gap-2 text-[10px]">
          <span className="text-[var(--dim)]">Elevation</span>
          <span className="num">{props.site.elevationM.toFixed(0)} m</span>
        </div>
        <div className="flex justify-between gap-2 text-[10px]">
          <span className="text-[var(--dim)]">Ice depth</span>
          <span className="num">{props.site.iceDepthM.toFixed(1)} m</span>
        </div>
        <div className="flex justify-between gap-2 text-[10px]">
          <span className="text-[var(--dim)]">Ice purity</span>
          <span className="num">{(props.site.icePurity * 100).toFixed(0)}%</span>
        </div>
        <div className="flex justify-between gap-2 text-[10px]">
          <span className="text-[var(--dim)]">Dust factor</span>
          <span className="num">{props.site.dustFactor.toFixed(2)}</span>
        </div>
      </div>
      {props.home ? (
        <button
          type="button"
          onClick={props.onDropToCity}
          className="w-full min-h-11 border border-[var(--green)] text-[var(--green)] text-[10px] tracking-widest uppercase hover:bg-[var(--green)]/10"
        >
          Drop to city
        </button>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[9px] text-[var(--dim)] leading-snug">
            Abandons this city at sol {props.sol}. Mass cannot teleport — a new
            landing starts a new ledger. Same seed and first-window cargo unless
            you pick cargo first.
          </p>
          <button
            type="button"
            onClick={props.onLandHere}
            className="w-full min-h-11 border border-[var(--rust)] text-[var(--rust-hot)] text-[10px] tracking-widest uppercase hover:bg-[var(--rust)] hover:text-black"
          >
            Land here
          </button>
          <button
            type="button"
            onClick={props.onChooseCargo}
            className="w-full min-h-11 border border-[var(--line)] text-[var(--dim)] text-[10px] tracking-widest uppercase hover:border-[var(--rust)] hover:text-[var(--text)]"
          >
            Pick cargo first
          </button>
        </div>
      )}
    </div>
  );
}

/** Canvas wrapper: one continuous zoom from the pad to the whole planet. */
export function CityScene(): React.ReactElement {
  const setInspect = useSimStore((s) => s.setInspect);
  const inspectId = useSimStore((s) => s.inspectId);
  const siteId = useSimStore((s) => s.sim.siteId);
  const sol = useSimStore((s) => s.sim.sol);
  const runLog = useSimStore((s) => s.runLog);
  const newGame = useSimStore((s) => s.newGame);
  const openSetupAtSite = useSimStore((s) => s.openSetupAtSite);
  const focusId = useSimStore((s) => s.globeFocusId);
  const setFocusId = useSimStore((s) => s.setGlobeFocus);
  const viewIntent = useSimStore((s) => s.viewIntent);
  const setViewIntent = useSimStore((s) => s.setViewIntent);
  const scrubSol = useSimStore((s) => s.scrubSol);
  const narrow = useNarrowViewport();
  const tier = useGraphicsTier();
  const [band, setBand] = useState<ViewBand>('city');
  const tGoal = useRef(CITY_T);
  const lookDir = useRef<THREE.Vector3 | null>(null);
  const pole = useMemo(() => faceSiteToUp(getSite(siteId)), [siteId]);
  const homeSite = getSite(siteId);
  const focusSite = focusId ? getSite(focusId) : null;
  const inCity = band === 'city';
  const inOrbit = band === 'orbit';
  const low = tier === 'low';
  const history = useSimStore((s) => s.sim.history);
  const siteDust = homeSite.dustFactor;
  const orbitDust = useMemo(() => {
    const snap =
      history.length === 0
        ? undefined
        : scrubSol === null
          ? history[history.length - 1]
          : history[clamp(scrubSol - 1, 0, history.length - 1)];
    const tau = snap ? snap.tau : opticalDepthAtSol(sol, false, siteDust);
    return 1 - clamp(sunlightFraction(tau) / 0.5, 0, 1);
  }, [history, scrubSol, sol, siteDust]);

  useEffect(() => {
    if (!inCity) {
      setInspect(null);
    }
  }, [inCity, setInspect]);

  useEffect(() => {
    if (focusId === null) {
      lookDir.current = null;
      return;
    }
    lookDir.current = siteOutward(getSite(focusId), pole);
  }, [focusId, pole]);

  useEffect(() => {
    if (viewIntent === 'planet') {
      tGoal.current = ORBIT_T;
      setViewIntent(null);
    } else if (viewIntent === 'city') {
      tGoal.current = CITY_T;
      setFocusId(null);
      setViewIntent(null);
    }
  }, [viewIntent, setViewIntent, setFocusId]);

  /** Ease the log-zoom to a named framing. */
  const goTo = (next: number): void => {
    tGoal.current = next;
    if (next <= CITY_T) {
      setFocusId(null);
    }
  };

  /** Open a pin dossier and climb to orbit if we are still on the dirt. */
  const lookAtSite = (id: string): void => {
    setFocusId(id);
    if (!inOrbit) {
      tGoal.current = ORBIT_T;
    }
  };

  return (
    <div className="flex-1 relative min-w-0 min-h-0">
      <Canvas
        shadows={!low}
        dpr={tier === 'high' ? [1, 2] : [1, 1.5]}
        camera={{ position: [18, 9, 20], fov: 40, near: 0.12, far: 16000 }}
        gl={{ antialias: !low, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1 }}
        resize={{ debounce: 0 }}
        style={{ background: '#1c0f0d' }}
        onCreated={(state) => {
          state.gl.toneMapping = THREE.ACESFilmicToneMapping;
          const cam = state.camera;
          if (isPerspective(cam) && state.size.height > 0) {
            cam.aspect = state.size.width / state.size.height;
            cam.updateProjectionMatrix();
          }
        }}
        onPointerMissed={() => {
          setInspect(null);
          setFocusId(null);
        }}
      >
        <color attach="background" args={['#1c0f0d']} />
        <ambientLight intensity={0.22} />
        <ZoomDirector tGoal={tGoal} lookDir={lookDir} onBand={setBand} />
        <DustRig />
        {inCity ? null : (
          <Stars
            radius={12000}
            depth={4000}
            count={low ? 800 : 2800}
            factor={6}
            saturation={0}
            fade
            speed={0.15}
          />
        )}
        <CityLayer>
          <Terrain />
          <Rocks />
          <Settlement />
          <Starships />
          <Pick id="rover">
            <Rover />
          </Pick>
        </CityLayer>
        {inCity ? null : (
          <group position={[0, -MARS_RADIUS - 1.4, 0]} quaternion={pole}>
            <MarsBody
              radius={MARS_RADIUS}
              activeSiteId={siteId}
              focusId={focusId}
              labels={inOrbit}
              pickable={inOrbit}
              showPins={inOrbit}
              showAtmosphere={inOrbit}
              pinSize={16}
              labelDistanceFactor={120}
              atmoStrength={1}
              dustAmount={orbitDust}
              sunDir={SUN_DIR}
              onPickSite={(s) => setFocusId(s.id)}
            />
          </group>
        )}
        <OrbitControls
          makeDefault
          target={[7, 1.1, -8]}
          minPolarAngle={0}
          maxPolarAngle={CITY_POLAR}
          minDistance={DIST_NEAR}
          maxDistance={DIST_FAR}
          enableDamping
          dampingFactor={0.08}
          enableZoom={false}
        />
        <SceneFX tier={tier} city={inCity} />
      </Canvas>
      <div className="absolute inset-0 pointer-events-none scene-vignette" />
      <button
        type="button"
        onClick={() => goTo(inOrbit ? CITY_T : ORBIT_T)}
        className="absolute top-2 right-2 z-20 min-h-11 px-3 panel border border-[var(--line)] text-[10px] tracking-widest uppercase text-[var(--text)] hover:border-[var(--rust-hot)]"
        title={inOrbit ? 'Descend to the settlement' : 'Zoom out to Mars'}
      >
        <span className="block">{inOrbit ? 'City' : 'Planet'}</span>
        <span className="block text-[8px] text-[var(--dim)] normal-case tracking-wide font-normal">
          {homeSite.name}
        </span>
      </button>
      {inOrbit ? (
        <div className="absolute top-14 right-2 z-20 flex flex-col gap-0.5 w-[148px]">
          {SITES.map((s) => {
            const home = s.id === siteId;
            const focused = s.id === focusId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => lookAtSite(s.id)}
                className={`min-h-9 px-2 text-left text-[9px] tracking-wide border ${
                  focused
                    ? 'border-[var(--rust-hot)] text-[var(--rust-hot)]'
                    : home
                      ? 'border-[var(--green)] text-[var(--green)]'
                      : 'border-[var(--line)] text-[var(--dim)] hover:text-[var(--text)] hover:border-[var(--dim)]'
                }`}
                title={home ? 'This run is landed here' : `Look at ${s.name}`}
              >
                {home ? '● ' : '○ '}
                {s.name}
              </button>
            );
          })}
        </div>
      ) : null}
      {!inCity && focusSite ? (
        <SiteDossier
          site={focusSite}
          home={focusSite.id === siteId}
          sol={sol}
          onDropToCity={() => goTo(CITY_T)}
          onLandHere={() => {
            newGame(runLog.seed, focusSite.id, runLog.templateId);
          }}
          onChooseCargo={() => openSetupAtSite(focusSite.id)}
          onClose={() => setFocusId(null)}
        />
      ) : null}
      {inCity ? <InspectCard /> : null}
      {inspectId === null && !focusSite ? (
        <div className="absolute bottom-2 left-2 text-[9px] text-[var(--dim)] pointer-events-none">
          {inOrbit
            ? 'click a site to land a new city · green is home'
            : band === 'climb'
              ? 'keep scrolling — the city is still below'
              : narrow
                ? 'tap a building · Planet to switch cities'
                : 'scroll out or Planet to switch cities · click a structure for its datasheet'}
        </div>
      ) : null}
    </div>
  );
}
