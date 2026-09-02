'use client';

/**
 * Starship traffic, driven by the real window ledgers — no fake schedule.
 * Ships on the ground = cumulative shipsLanded − shipsDeparted. When a window
 * opens (sol = window × 759) the new arrivals descend on staggered landing
 * burns; at the departure sol (+600) a fueled ship climbs out on a plume.
 * Altitude targets are pure functions of the current sol, so scrubbing the
 * timeline stays deterministic; useFrame easing supplies the smooth motion.
 */

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { DEPARTURE_OFFSET_SOLS, SOLS_PER_SYNODIC_WINDOW } from '../../lib/constants';
import { clamp } from '../../lib/types';
import { useSimStore } from '../../store/useSimStore';
import { buildHeatTileMap } from './materials';
import { Pick } from './Pick';

/** Shared ship materials (module-level: allocated once). */
const SHIP_MAT = {
  hull: new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.34, metalness: 0.55 }),
  nose: new THREE.MeshStandardMaterial({ color: '#aeb4ba', roughness: 0.3, metalness: 0.5 }),
  fin: new THREE.MeshStandardMaterial({ color: '#3c4148', roughness: 0.48, metalness: 0.4 }),
  tile: new THREE.MeshStandardMaterial({ color: '#4a4540', roughness: 0.7, metalness: 0.15 }),
  windowBand: new THREE.MeshStandardMaterial({
    color: '#1a1712',
    emissive: '#ffd9a0',
    emissiveIntensity: 1.8,
    roughness: 0.4,
  }),
  plume: new THREE.MeshBasicMaterial({
    color: '#ffb36b',
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  plumeOuter: new THREE.MeshBasicMaterial({
    color: '#ff7a2a',
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
};

let tileMapBound = false;

/** Bind the hex-tile canvas to the hull the first time a ship mounts on the client. */
function bindShipMaps(): void {
  if (tileMapBound || typeof document === 'undefined') {
    return;
  }
  const map = buildHeatTileMap();
  if (map) {
    map.repeat.set(6, 4);
    SHIP_MAT.hull.map = map;
    SHIP_MAT.hull.needsUpdate = true;
  }
  tileMapBound = true;
}

/** Max ships drawn on the apron; beyond this the fleet is implied. */
const MAX_GROUND_SHIPS = 6;

/** Parking slot for ship index i: a 2-wide column starting on the pad row. */
function slotPosition(i: number): readonly [number, number] {
  return [13 + (i % 2) * 9, -18 - Math.floor(i / 2) * 8];
}

/** One Starship, easing toward its sol-derived target altitude. */
function Starship(props: { x: number; z: number; targetY: number }): React.ReactElement {
  const group = useRef<THREE.Group>(null);
  const plume = useRef<THREE.Mesh>(null);
  const engineLight = useRef<THREE.PointLight>(null);
  const hinges = useRef<THREE.Group>(null);
  const plumeOuter = useRef<THREE.Mesh>(null);
  const kick = useRef<THREE.Mesh>(null);
  const kickMat = useRef<THREE.MeshBasicMaterial>(null);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    bindShipMaps();
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) {
      return;
    }
    if (!initialized.current) {
      g.position.y = props.targetY;
      initialized.current = true;
    }
    g.position.y += (props.targetY - g.position.y) * Math.min(1, delta * 1.6);
    const airborne = g.position.y > 0.4;
    if (plume.current) {
      plume.current.visible = airborne;
      const flicker = 1 + 0.18 * Math.sin(state.clock.elapsedTime * 31 + props.x);
      plume.current.scale.set(flicker, 1 + 0.25 * Math.abs(Math.sin(state.clock.elapsedTime * 17)), flicker);
    }
    if (plumeOuter.current) {
      plumeOuter.current.visible = airborne;
      const flicker = 1 + 0.12 * Math.sin(state.clock.elapsedTime * 19 + props.x);
      plumeOuter.current.scale.set(flicker * 1.35, 1.15, flicker * 1.35);
    }
    if (kick.current && kickMat.current) {
      const near = clamp(1 - g.position.y / 14, 0, 1);
      const blowing = g.position.y > 0.12 && g.position.y < 16;
      kick.current.visible = blowing;
      kick.current.position.y = -g.position.y + 0.1;
      const swell = 1.6 + (1 - near) * 4.2;
      kick.current.scale.set(swell, 1, swell);
      kickMat.current.opacity = blowing ? near * 0.42 : 0;
    }
    if (engineLight.current) {
      engineLight.current.intensity = airborne
        ? 16 + Math.sin(state.clock.elapsedTime * 29) * 4
        : 0;
    }
    const fold = clamp((g.position.y - 0.2) / 7, 0, 1);
    const angle = 0.1 + 0.5 * (1 - fold);
    const hingeRoot = hinges.current;
    if (hingeRoot) {
      for (let i = 0; i < hingeRoot.children.length; i += 1) {
        const yaw = hingeRoot.children[i];
        const hinge = yaw?.children[0];
        if (hinge) {
          hinge.rotation.z = angle;
        }
      }
    }
  });

  return (
    <group ref={group} position={[props.x, 0, props.z]}>
      <mesh position={[0, 0.22, 0]} material={SHIP_MAT.fin} castShadow>
        <cylinderGeometry args={[1.02, 1.1, 0.45, 20]} />
      </mesh>
      {/* three engine bells in a triangle */}
      {(
        [
          [0, 0.28],
          [-0.32, -0.2],
          [0.32, -0.2],
        ] as const
      ).map(([ex, ez]) => (
        <mesh key={`bell-${ex}-${ez}`} position={[ex, 0.04, ez]} material={SHIP_MAT.tile} castShadow>
          <cylinderGeometry args={[0.22, 0.13, 0.42, 10]} />
        </mesh>
      ))}
      <mesh position={[0, 2.9, 0]} material={SHIP_MAT.hull} castShadow receiveShadow>
        <cylinderGeometry args={[0.85, 0.85, 4.8, 22]} />
      </mesh>
      {/* darker heat-shield belly strip facing the camera-ish +z */}
      <mesh position={[0, 2.4, 0.72]} material={SHIP_MAT.tile}>
        <boxGeometry args={[0.55, 3.4, 0.06]} />
      </mesh>
      <mesh position={[0, 1.4, 0]} material={SHIP_MAT.tile}>
        <cylinderGeometry args={[0.87, 0.87, 0.18, 22]} />
      </mesh>
      <mesh position={[0, 4.4, 0]} material={SHIP_MAT.tile}>
        <cylinderGeometry args={[0.87, 0.87, 0.14, 22]} />
      </mesh>
      <mesh position={[0, 6.35, 0]} material={SHIP_MAT.nose} castShadow>
        <cylinderGeometry args={[0.16, 0.85, 2.1, 20]} />
      </mesh>
      <mesh position={[0, 7.42, 0]} material={SHIP_MAT.nose}>
        <sphereGeometry args={[0.16, 12, 8]} />
      </mesh>
      <mesh position={[0, 5.15, 0.78]} material={SHIP_MAT.windowBand}>
        <boxGeometry args={[0.55, 0.18, 0.18]} />
      </mesh>
      <mesh position={[0, 5.42, 0.76]} material={SHIP_MAT.windowBand}>
        <boxGeometry args={[0.38, 0.12, 0.14]} />
      </mesh>
      <mesh position={[1.0, 1.3, 0]} rotation={[0, 0, -0.16]} material={SHIP_MAT.fin} castShadow>
        <boxGeometry args={[0.5, 1.9, 0.14]} />
      </mesh>
      <mesh position={[-1.0, 1.3, 0]} rotation={[0, 0, 0.16]} material={SHIP_MAT.fin} castShadow>
        <boxGeometry args={[0.5, 1.9, 0.14]} />
      </mesh>
      <mesh position={[0.82, 5.9, 0]} rotation={[0, 0, -0.2]} material={SHIP_MAT.fin} castShadow>
        <boxGeometry args={[0.4, 1.1, 0.12]} />
      </mesh>
      <mesh position={[-0.82, 5.9, 0]} rotation={[0, 0, 0.2]} material={SHIP_MAT.fin} castShadow>
        <boxGeometry args={[0.4, 1.1, 0.12]} />
      </mesh>
      <group ref={hinges}>
        {[0, 1, 2].map((i) => (
          <group key={`leg-${i}`} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
            <group position={[0.88, 0.85, 0]} rotation={[0, 0, 0.58]}>
              <mesh position={[0.72, 0, 0]} material={SHIP_MAT.fin} castShadow>
                <boxGeometry args={[1.45, 0.1, 0.12]} />
              </mesh>
              <mesh position={[1.42, -0.08, 0]} material={SHIP_MAT.tile} castShadow>
                <boxGeometry args={[0.38, 0.08, 0.28]} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
      <mesh ref={plume} position={[0, -1.35, 0]} material={SHIP_MAT.plume} visible={false}>
        <coneGeometry args={[0.55, 2.8, 16]} />
      </mesh>
      <mesh ref={plumeOuter} position={[0, -1.7, 0]} material={SHIP_MAT.plumeOuter} visible={false}>
        <coneGeometry args={[0.95, 3.6, 14]} />
      </mesh>
      <mesh ref={kick} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} visible={false}>
        <ringGeometry args={[0.7, 2.8, 28]} />
        <meshBasicMaterial
          ref={kickMat}
          color="#d08347"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight ref={engineLight} position={[0, -0.8, 0]} color="#ffb36b" distance={18} intensity={0} />
    </group>
  );
}

/** Descent profile for an arrival: 85 units up, touching down over 9 sols. */
function arrivalTargetY(phase: number, stagger: number): number {
  const t = phase - stagger;
  if (t <= 0) {
    return 85;
  }
  if (t >= 9) {
    return 0;
  }
  return 85 * (1 - t / 9);
}

/** The fleet, derived entirely from ledgers and the viewed sol (live or scrubbed). */
export function Starships(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const scrubSol = useSimStore((s) => s.scrubSol);
  const viewSol = scrubSol ?? sim.sol;
  const viewWindow = Math.floor(viewSol / SOLS_PER_SYNODIC_WINDOW);
  const phase = viewSol - viewWindow * SOLS_PER_SYNODIC_WINDOW;

  let landedTotal = 0;
  let departedTotal = 0;
  let landedThisWindow = 0;
  let departedThisWindow = 0;
  for (const ledger of sim.ledgers) {
    if (ledger.window > viewWindow) {
      continue;
    }
    landedTotal += ledger.shipsLanded;
    if (ledger.window < viewWindow) {
      departedTotal += ledger.shipsDeparted;
    } else {
      landedThisWindow = ledger.shipsLanded;
      departedThisWindow = ledger.shipsDeparted;
      if (phase >= DEPARTURE_OFFSET_SOLS) {
        departedTotal += ledger.shipsDeparted;
      }
    }
  }
  const groundShips = clamp(landedTotal - departedTotal, 0, MAX_GROUND_SHIPS);

  const ships: React.ReactElement[] = [];
  for (let i = 0; i < groundShips; i += 1) {
    const [x, z] = slotPosition(i);
    const arrivalRank = i - (groundShips - landedThisWindow);
    const targetY = arrivalRank >= 0 ? arrivalTargetY(phase, arrivalRank * 5) : 0;
    ships.push(<Starship key={`ship-${i}`} x={x} z={z} targetY={targetY} />);
  }

  const sinceDeparture = phase - DEPARTURE_OFFSET_SOLS;
  if (departedThisWindow > 0 && sinceDeparture >= 0 && sinceDeparture <= 20) {
    const [x, z] = slotPosition(groundShips);
    const targetY = 95 * Math.pow(sinceDeparture / 20, 1.5);
    ships.push(<Starship key="ship-departing" x={x} z={z} targetY={targetY} />);
  }

  return <Pick id="starship">{ships}</Pick>;
}
