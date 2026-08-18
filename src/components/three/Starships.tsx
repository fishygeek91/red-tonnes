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
import { useRef } from 'react';
import * as THREE from 'three';
import { DEPARTURE_OFFSET_SOLS, SOLS_PER_SYNODIC_WINDOW } from '../../lib/constants';
import { clamp } from '../../lib/types';
import { useSimStore } from '../../store/useSimStore';
import { Pick } from './Pick';

/** Shared ship materials (module-level: allocated once). */
const SHIP_MAT = {
  hull: new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.32, metalness: 0.45 }),
  nose: new THREE.MeshStandardMaterial({ color: '#aeb4ba', roughness: 0.3, metalness: 0.45 }),
  fin: new THREE.MeshStandardMaterial({ color: '#3c4148', roughness: 0.5, metalness: 0.3 }),
  windowBand: new THREE.MeshStandardMaterial({
    color: '#1a1712',
    emissive: '#ffd9a0',
    emissiveIntensity: 1.8,
    roughness: 0.4,
  }),
  plume: new THREE.MeshStandardMaterial({
    color: '#2b1608',
    emissive: '#ffb36b',
    emissiveIntensity: 4,
    transparent: true,
    opacity: 0.9,
  }),
};

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
  const initialized = useRef(false);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) {
      return;
    }
    // First frame: snap to the target so a mid-descent mount starts high.
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
    if (engineLight.current) {
      engineLight.current.intensity = airborne
        ? 16 + Math.sin(state.clock.elapsedTime * 29) * 4
        : 0;
    }
  });

  return (
    <group ref={group} position={[props.x, 0, props.z]}>
      {/* engine skirt */}
      <mesh position={[0, 0.25, 0]} material={SHIP_MAT.fin} castShadow>
        <cylinderGeometry args={[1.0, 1.08, 0.5, 20]} />
      </mesh>
      {/* main tank barrel */}
      <mesh position={[0, 2.9, 0]} material={SHIP_MAT.hull} castShadow receiveShadow>
        <cylinderGeometry args={[0.85, 0.85, 4.8, 20]} />
      </mesh>
      {/* nose cone + cap */}
      <mesh position={[0, 6.35, 0]} material={SHIP_MAT.nose} castShadow>
        <cylinderGeometry args={[0.16, 0.85, 2.1, 20]} />
      </mesh>
      <mesh position={[0, 7.42, 0]} material={SHIP_MAT.nose}>
        <sphereGeometry args={[0.16, 12, 8]} />
      </mesh>
      {/* crew window band near the nose */}
      <mesh position={[0, 5.15, 0.78]} material={SHIP_MAT.windowBand}>
        <boxGeometry args={[0.55, 0.18, 0.18]} />
      </mesh>
      {/* aft flaps */}
      <mesh position={[1.0, 1.3, 0]} rotation={[0, 0, -0.16]} material={SHIP_MAT.fin} castShadow>
        <boxGeometry args={[0.5, 1.9, 0.14]} />
      </mesh>
      <mesh position={[-1.0, 1.3, 0]} rotation={[0, 0, 0.16]} material={SHIP_MAT.fin} castShadow>
        <boxGeometry args={[0.5, 1.9, 0.14]} />
      </mesh>
      {/* forward canards */}
      <mesh position={[0.82, 5.9, 0]} rotation={[0, 0, -0.2]} material={SHIP_MAT.fin} castShadow>
        <boxGeometry args={[0.4, 1.1, 0.12]} />
      </mesh>
      <mesh position={[-0.82, 5.9, 0]} rotation={[0, 0, 0.2]} material={SHIP_MAT.fin} castShadow>
        <boxGeometry args={[0.4, 1.1, 0.12]} />
      </mesh>
      {/* landing burn plume: apex at the engines, flaring downward */}
      <mesh ref={plume} position={[0, -1.35, 0]} material={SHIP_MAT.plume} visible={false}>
        <coneGeometry args={[0.6, 2.8, 16]} />
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
  // Scrubbing the timeline replays traffic: reconstruct the fleet as of the
  // viewed sol instead of the live one. Ledgers are append-only, so history
  // is just "ignore windows that had not opened yet".
  const viewSol = scrubSol ?? sim.sol;
  const viewWindow = Math.floor(viewSol / SOLS_PER_SYNODIC_WINDOW);
  const phase = viewSol - viewWindow * SOLS_PER_SYNODIC_WINDOW;

  let landedTotal = 0;
  let departedTotal = 0;
  let landedThisWindow = 0;
  let departedThisWindow = 0;
  for (const ledger of sim.ledgers) {
    if (ledger.window > viewWindow) {
      continue; // this window had not opened yet at the viewed sol
    }
    landedTotal += ledger.shipsLanded;
    if (ledger.window < viewWindow) {
      departedTotal += ledger.shipsDeparted;
    } else {
      landedThisWindow = ledger.shipsLanded;
      departedThisWindow = ledger.shipsDeparted;
      // This window's departure burn happens at phase 600; before that the
      // ships are still on the pads even if they left later in real history.
      if (phase >= DEPARTURE_OFFSET_SOLS) {
        departedTotal += ledger.shipsDeparted;
      }
    }
  }
  const groundShips = clamp(landedTotal - departedTotal, 0, MAX_GROUND_SHIPS);

  const ships: React.ReactElement[] = [];
  for (let i = 0; i < groundShips; i += 1) {
    const [x, z] = slotPosition(i);
    // The newest arrivals occupy the highest slots and are still descending.
    const arrivalRank = i - (groundShips - landedThisWindow);
    const targetY = arrivalRank >= 0 ? arrivalTargetY(phase, arrivalRank * 5) : 0;
    ships.push(<Starship key={`ship-${i}`} x={x} z={z} targetY={targetY} />);
  }

  // A fueled ship climbing out for Earth, shortly after the departure burn sol.
  const sinceDeparture = phase - DEPARTURE_OFFSET_SOLS;
  if (departedThisWindow > 0 && sinceDeparture >= 0 && sinceDeparture <= 20) {
    const [x, z] = slotPosition(groundShips);
    const targetY = 95 * Math.pow(sinceDeparture / 20, 1.5);
    ships.push(<Starship key="ship-departing" x={x} z={z} targetY={targetY} />);
  }

  return <Pick id="starship">{ships}</Pick>;
}
