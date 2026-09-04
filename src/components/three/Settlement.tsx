'use client';

/**
 * Settlement architecture: every structure family is a small kitbash so the
 * mass/energy loop is visible — ice trench to plant to tanks — not a field
 * of unlabeled primitives. Counts and tank fills still come from the sim.
 */

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGraphicsTier } from '../../hooks/useGraphicsTier';
import { LOX_TO_CH4_RATIO } from '../../lib/constants';
import { STRUCTURES } from '../../lib/structures';
import { clamp, safeDiv } from '../../lib/types';
import { sunlightFraction } from '../../lib/sim/step';
import type { SimState, SolSnapshot } from '../../lib/sim/state';
import { useSimStore } from '../../store/useSimStore';
import { Band, BeaconLamp, Pipe, PipedRun, Row, Stack } from './kit';
import { MAT } from './materials';
import { LAYOUT, SUN_DIR } from './regolith';
import { Pick } from './Pick';

/**
 * The snapshot the scene should render: the scrubbed sol's when the player
 * is viewing history, else the latest. history[i].sol === i + 1 by
 * construction (the first snapshot is pushed after the sol-0 → sol-1 step).
 */
function viewSnapshot(sim: SimState, scrubSol: number | null): SolSnapshot | undefined {
  if (sim.history.length === 0) {
    return undefined;
  }
  if (scrubSol === null) {
    return sim.history[sim.history.length - 1];
  }
  const idx = clamp(scrubSol - 1, 0, sim.history.length - 1);
  return sim.history[idx];
}

/** Quaternion that aims a +Y panel normal at the scene sun. */
const PANEL_AIM = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), SUN_DIR);

/** Solar field grid: 6-wide rows, same as the old `Row` helper. */
const SOLAR_ORIGIN: readonly [number, number, number] = [10, 0.55, 12];
const SOLAR_SPACING = 2.6;

/**
 * Instanced photovoltaic field. One draw per part instead of `count` unique
 * SolarBlocks — this is the row that grows with local output.
 */
function InstancedSolarField(props: { count: number }): React.ReactElement | null {
  const frameRef = useRef<THREE.InstancedMesh>(null);
  const cellRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);
  const boxRef = useRef<THREE.InstancedMesh>(null);
  const frameGeo = useMemo(() => new THREE.BoxGeometry(2.32, 0.04, 1.52), []);
  const cellGeo = useMemo(() => new THREE.BoxGeometry(2.2, 0.05, 1.4), []);
  const postGeo = useMemo(() => new THREE.CylinderGeometry(0.05, 0.06, 0.55, 6), []);
  const boxGeo = useMemo(() => new THREE.BoxGeometry(0.18, 0.12, 0.14), []);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const cell = cellRef.current;
    const post = postRef.current;
    const box = boxRef.current;
    if (!frame || !cell || !post || !box) {
      return;
    }
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const identity = new THREE.Quaternion();
    const local = new THREE.Vector3();
    for (let i = 0; i < props.count; i += 1) {
      const x = SOLAR_ORIGIN[0] + (i % 6) * SOLAR_SPACING;
      const y = SOLAR_ORIGIN[1];
      const z = SOLAR_ORIGIN[2] + Math.floor(i / 6) * SOLAR_SPACING;
      local.set(0, -0.025, 0).applyQuaternion(PANEL_AIM);
      p.set(x, y, z).add(local);
      m.compose(p, PANEL_AIM, s);
      frame.setMatrixAt(i, m);
      local.set(0, 0, 0).applyQuaternion(PANEL_AIM);
      p.set(x, y, z).add(local);
      m.compose(p, PANEL_AIM, s);
      cell.setMatrixAt(i, m);
      p.set(x, y - 0.28, z);
      m.compose(p, identity, s);
      post.setMatrixAt(i, m);
      p.set(x + 0.7, y - 0.08, z);
      m.compose(p, identity, s);
      box.setMatrixAt(i, m);
    }
    frame.instanceMatrix.needsUpdate = true;
    cell.instanceMatrix.needsUpdate = true;
    post.instanceMatrix.needsUpdate = true;
    box.instanceMatrix.needsUpdate = true;
  }, [props.count]);

  if (props.count < 1) {
    return null;
  }
  return (
    <group>
      <instancedMesh
        ref={frameRef}
        args={[frameGeo, MAT.steel, props.count]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={cellRef}
        args={[cellGeo, MAT.solar, props.count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={postRef}
        args={[postGeo, MAT.steel, props.count]}
        castShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={boxRef}
        args={[boxGeo, MAT.rustSteel, props.count]}
        frustumCulled={false}
      />
    </group>
  );
}

/** Sintered pad with chevrons, ring, and four strobe posts. */
function LandingPad(props: { position: [number, number, number] }): React.ReactElement {
  return (
    <group position={props.position}>
      <mesh material={MAT.pad} receiveShadow>
        <cylinderGeometry args={[3.6, 3.6, 0.12, 32]} />
      </mesh>
      <mesh position={[0, 0.07, 0]} material={MAT.padRing}>
        <torusGeometry args={[3.3, 0.045, 8, 48]} />
      </mesh>
      <mesh position={[0, 0.08, 0]} material={MAT.padRing}>
        <torusGeometry args={[1.1, 0.03, 6, 24]} />
      </mesh>
      {[0, 1, 2, 3].map((k) => {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const x = Math.cos(a) * 3.45;
        const z = Math.sin(a) * 3.45;
        return (
          <group key={`post-${k}`} position={[x, 0, z]}>
            <mesh position={[0, 0.55, 0]} material={MAT.steel} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 1.1, 6]} />
            </mesh>
            <BeaconLamp position={[0, 1.16, 0]} />
          </group>
        );
      })}
    </group>
  );
}

/** Kilopower-ish reactor: core, radial radiators, berm, warning lamp. */
function Reactor(props: { position: [number, number, number] }): React.ReactElement {
  return (
    <group position={props.position}>
      <mesh material={MAT.steel} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.7, 1.8, 12]} />
      </mesh>
      <mesh position={[0, 1.15, 0]} material={MAT.intake} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.7, 8]} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const a = (k * Math.PI) / 3;
        return (
          <mesh
            key={`fin-${k}`}
            position={[Math.cos(a) * 0.85, 1.35, Math.sin(a) * 0.85]}
            rotation={[0, -a, 0.15]}
            material={MAT.rustSteel}
            castShadow
          >
            <boxGeometry args={[0.06, 1.5, 1.1]} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.15, 0]} material={MAT.berm} receiveShadow>
        <cylinderGeometry args={[1.6, 1.8, 0.35, 16]} />
      </mesh>
      <BeaconLamp position={[0, 2.15, 0]} />
    </group>
  );
}

/** Ice-table trench, headframe, and a parked excavator. */
function IceMine(): React.ReactElement {
  return (
    <group position={[LAYOUT.mineX, 0, LAYOUT.mineZ]}>
      <mesh position={[0, -0.85, 0]} material={MAT.iceTank}>
        <boxGeometry args={[12.5, 1.5, 7.2]} />
      </mesh>
      <mesh position={[0, -0.15, 0]} material={MAT.berm} receiveShadow>
        <boxGeometry args={[14.2, 0.45, 8.4]} />
      </mesh>
      {[-6.4, 6.4].map((x) => (
        <mesh key={`wall-${x}`} position={[x, 0.35, 0]} material={MAT.berm} castShadow>
          <boxGeometry args={[0.7, 1.4, 8.2]} />
        </mesh>
      ))}
      {/* headframe */}
      <mesh position={[-4.2, 2.1, 0]} material={MAT.steel} castShadow>
        <boxGeometry args={[0.16, 4.2, 0.16]} />
      </mesh>
      <mesh position={[-2.2, 2.1, 0]} material={MAT.steel} castShadow>
        <boxGeometry args={[0.16, 4.2, 0.16]} />
      </mesh>
      <mesh position={[-3.2, 4.2, 0]} material={MAT.steel} castShadow>
        <boxGeometry args={[2.4, 0.16, 0.16]} />
      </mesh>
      <mesh position={[-3.2, 4.35, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.rustSteel}>
        <cylinderGeometry args={[0.22, 0.22, 0.5, 10]} />
      </mesh>
      {/* excavator */}
      <group position={[3.4, 0.55, 1.6]}>
        <mesh material={MAT.rustSteel} castShadow>
          <boxGeometry args={[1.4, 0.7, 1.1]} />
        </mesh>
        <mesh position={[0.9, 0.35, 0]} rotation={[0, 0, -0.55]} material={MAT.steel} castShadow>
          <boxGeometry args={[1.8, 0.16, 0.16]} />
        </mesh>
        <mesh position={[2.1, -0.15, 0]} material={MAT.steel} castShadow>
          <boxGeometry args={[0.45, 0.28, 0.5]} />
        </mesh>
        <BeaconLamp position={[0.5, 0.55, 0]} />
      </group>
    </group>
  );
}

/** CO2 compressor: intake stack is the tell. */
function CompressorSkid(): React.ReactElement {
  return (
    <group>
      <mesh position={[0, 1, 0]} material={MAT.steel} castShadow receiveShadow>
        <boxGeometry args={[3, 2, 2.4]} />
      </mesh>
      <mesh position={[0, 0.08, 0]} material={MAT.rustSteel} receiveShadow>
        <boxGeometry args={[3.3, 0.16, 2.7]} />
      </mesh>
      <Stack position={[0.9, 2, 0.3]} height={1.8} radius={0.22} />
      <mesh position={[-0.9, 2.15, 0.6]} material={MAT.intake} castShadow>
        <boxGeometry args={[0.9, 0.12, 1.4]} />
      </mesh>
      <mesh position={[-0.9, 2.35, 0.6]} material={MAT.intake} castShadow>
        <boxGeometry args={[0.9, 0.12, 1.4]} />
      </mesh>
    </group>
  );
}

/** Electrolyzer: stacked cell plates and ice-blue product pipe. */
function ElectrolyzerSkid(): React.ReactElement {
  return (
    <group>
      <mesh position={[0, 1, 0]} material={MAT.steel} castShadow receiveShadow>
        <boxGeometry args={[3, 2, 2.4]} />
      </mesh>
      {[-0.45, 0, 0.45].map((x) => (
        <mesh key={`cell-${x}`} position={[x, 2.15, 0]} material={MAT.iceTank} castShadow>
          <boxGeometry args={[0.35, 0.7, 1.8]} />
        </mesh>
      ))}
      <Pipe from={[-1.2, 1.2, 1.3]} to={[-1.2, 1.2, 2.6]} radius={0.08} material={MAT.iceTank} />
    </group>
  );
}

/** Sabatier: insulated vessel, heat fins, flare stack. */
function SabatierSkid(): React.ReactElement {
  return (
    <group>
      <group position={[0, 1.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh material={MAT.ch4Tank} castShadow receiveShadow>
          <cylinderGeometry args={[0.85, 0.85, 3.1, 16]} />
        </mesh>
        <Band y={-0.95} radius={0.88} />
        <Band y={0.95} radius={0.88} />
      </group>
      {[-0.6, 0, 0.6].map((z) => (
        <mesh key={`fin-${z}`} position={[0, 2.05, z]} material={MAT.rustSteel} castShadow>
          <boxGeometry args={[1.6, 0.08, 0.35]} />
        </mesh>
      ))}
      <Stack position={[0.2, 1.9, -0.9]} height={2.2} radius={0.12} />
      <mesh position={[0.2, 4.18, -0.9]} material={MAT.flare}>
        <sphereGeometry args={[0.14, 10, 8]} />
      </mesh>
    </group>
  );
}

/** Cryo tank farm with live CH4 / LOX / water fills and a pump skid. */
function CryoFarm(props: { ch4Fill: number; loxFill: number; waterFill: number }): React.ReactElement {
  return (
    <group position={[LAYOUT.cryoX, 0, LAYOUT.cryoZ]}>
      <group position={[0, 0, 0]}>
        <mesh position={[0, 1.6, 0]} material={MAT.ch4Tank} castShadow receiveShadow>
          <cylinderGeometry args={[1.4, 1.4, 3.2, 20]} />
        </mesh>
        <Band y={0.7} radius={1.42} />
        <Band y={1.6} radius={1.42} />
        <Band y={2.5} radius={1.42} />
        <mesh position={[0, 0.15 + props.ch4Fill * 1.5, 0]} scale={[1.01, props.ch4Fill, 1.01]} material={MAT.frost}>
          <cylinderGeometry args={[1.41, 1.41, 3.0, 20]} />
        </mesh>
      </group>
      <group position={[3.6, 0, 0]}>
        <mesh position={[0, 1.6, 0]} material={MAT.ch4Tank} castShadow receiveShadow>
          <cylinderGeometry args={[1.4, 1.4, 3.2, 20]} />
        </mesh>
        <Band y={0.7} radius={1.42} />
        <Band y={1.6} radius={1.42} />
        <Band y={2.5} radius={1.42} />
        <mesh position={[0, 0.15 + props.loxFill * 1.5, 0]} scale={[1.01, props.loxFill, 1.01]} material={MAT.frost}>
          <cylinderGeometry args={[1.41, 1.41, 3.0, 20]} />
        </mesh>
      </group>
      <mesh position={[7.2, 1.2, 0]} material={MAT.waterDome} receiveShadow>
        <sphereGeometry args={[1.3 * (0.6 + props.waterFill * 0.4), 24, 24]} />
      </mesh>
      <mesh position={[1.8, 0.35, 1.8]} material={MAT.steel} castShadow>
        <boxGeometry args={[1.6, 0.7, 1.1]} />
      </mesh>
      <Pipe from={[0, 0.7, 1.4]} to={[1.2, 0.7, 1.8]} />
      <Pipe from={[3.6, 0.7, 1.4]} to={[2.4, 0.7, 1.8]} />
      <Pipe from={[7.2, 0.9, 1.1]} to={[2.6, 0.55, 1.8]} radius={0.06} material={MAT.iceTank} />
    </group>
  );
}

/** Shared airlock, berm, and antenna bits used by both sealed and cutaway cans. */
function HabitatKit(props: { linked: boolean }): React.ReactElement {
  return (
    <>
      <mesh position={[0, -0.15, 1.55]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steel} castShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.7, 12]} />
      </mesh>
      <mesh position={[0, -0.55, 0]} material={MAT.berm} receiveShadow>
        <cylinderGeometry args={[1.55, 1.75, 0.35, 16]} />
      </mesh>
      <mesh position={[0.15, 2.15, 0]} material={MAT.steel} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.9, 6]} />
      </mesh>
      <mesh position={[0.15, 2.62, 0]} rotation={[0.6, 0, 0]} material={MAT.steel}>
        <boxGeometry args={[0.35, 0.04, 0.18]} />
      </mesh>
      {props.linked ? (
        <mesh position={[-2.25, 0.15, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.habitat}>
          <cylinderGeometry args={[0.32, 0.32, 2.1, 10]} />
        </mesh>
      ) : null}
    </>
  );
}

/**
 * First habitat is a teaching cutaway: half the pressure hull peeled so bunks
 * and the ECLSS rack read as a place people live, not a capsule icon.
 */
function HabitatCutaway(props: { position: [number, number, number]; linked: boolean }): React.ReactElement {
  return (
    <group position={props.position} rotation={[0, -0.7, 0]}>
      <group rotation={[0, Math.PI / 2, 0]}>
        <mesh material={MAT.habitat} castShadow receiveShadow>
          <cylinderGeometry args={[1.2, 1.2, 1.6, 22, 1, false, 0, Math.PI]} />
        </mesh>
        <mesh position={[0, 0.8, 0]} material={MAT.habitat} castShadow>
          <sphereGeometry args={[1.2, 22, 12, 0, Math.PI, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, -0.8, 0]} material={MAT.habitat} castShadow>
          <sphereGeometry args={[1.2, 22, 12, 0, Math.PI, Math.PI / 2, Math.PI / 2]} />
        </mesh>
      </group>
      {/* cut rim so the slice reads as intentional */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, 0]} material={MAT.cutRim}>
        <torusGeometry args={[1.21, 0.03, 8, 28, Math.PI]} />
      </mesh>
      <mesh position={[0, -0.62, 0]} material={MAT.deck}>
        <cylinderGeometry args={[1.05, 1.05, 0.08, 20]} />
      </mesh>
      <mesh position={[-0.35, -0.22, -0.25]} material={MAT.bunk} castShadow>
        <boxGeometry args={[0.7, 0.16, 1.15]} />
      </mesh>
      <mesh position={[0.45, -0.22, -0.15]} material={MAT.bunk} castShadow>
        <boxGeometry args={[0.55, 0.16, 0.95]} />
      </mesh>
      <mesh position={[0.55, 0.25, -0.55]} material={MAT.steel} castShadow>
        <boxGeometry args={[0.35, 0.9, 0.45]} />
      </mesh>
      <mesh position={[0.55, 0.15, -0.55]} material={MAT.habitatWindow}>
        <boxGeometry args={[0.18, 0.22, 0.12]} />
      </mesh>
      <pointLight color="#ffd9a0" intensity={6.5} distance={7} position={[0.15, 0.4, 0.2]} />
      <HabitatKit linked={props.linked} />
    </group>
  );
}

/** Sealed habitat can: airlock, portholes, berm skirt, roof antenna. */
function HabitatCan(props: { position: [number, number, number]; linked: boolean }): React.ReactElement {
  return (
    <group position={props.position}>
      <mesh material={MAT.habitat} castShadow receiveShadow>
        <capsuleGeometry args={[1.2, 1.6, 4, 16]} />
      </mesh>
      <mesh position={[0, 0.25, 1.16]} material={MAT.habitatWindow}>
        <boxGeometry args={[0.9, 0.28, 0.14]} />
      </mesh>
      <mesh position={[0, 0.7, 1.16]} material={MAT.habitatWindow}>
        <boxGeometry args={[0.55, 0.18, 0.12]} />
      </mesh>
      <mesh position={[0, -0.15, 1.95]} material={MAT.darkGlass}>
        <boxGeometry args={[0.5, 0.7, 0.08]} />
      </mesh>
      <HabitatKit linked={props.linked} />
    </group>
  );
}

/** Two rows of cone crops along a greenhouse street. */
function CropStands(props: { length: number }): React.ReactElement {
  const items: React.ReactElement[] = [];
  const step = 0.52;
  let n = 0;
  for (let x = -props.length / 2 + 0.7; x <= props.length / 2 - 0.7; x += step) {
    for (const z of [-0.36, 0.36]) {
      items.push(
        <mesh key={`p-${n}`} position={[x, 0.28, z]} material={MAT.plant} castShadow>
          <coneGeometry args={[0.13, 0.38, 5]} />
        </mesh>,
      );
      n += 1;
    }
  }
  return <group>{items}</group>;
}

/** Greenhouse street: ribs, crop rows, end airlocks. Glow tracks insolation. */
function GreenhouseStreet(props: {
  position: [number, number, number];
  length: number;
  glow: number;
  rigid: boolean;
}): React.ReactElement {
  const shell = useRef<THREE.MeshStandardMaterial>(null);
  const tier = useGraphicsTier();
  const high = tier === 'high';
  useFrame(() => {
    if (shell.current) {
      // The shell is a window, not a lamp — crops carry the street's glow.
      // Medium/low film is more opaque, so it keeps a little more of its own light.
      shell.current.emissiveIntensity = high
        ? 0.03 + props.glow * 0.18
        : 0.05 + props.glow * 0.35;
    }
    MAT.plant.emissiveIntensity = 0.28 + props.glow * 1.15;
  });
  const ribs: React.ReactElement[] = [];
  const step = props.rigid ? 1.6 : 2.1;
  for (let x = -props.length / 2 + 0.8; x <= props.length / 2 - 0.8; x += step) {
    ribs.push(
      <mesh key={`rib-${x}`} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.habitat}>
        <torusGeometry args={[1.12, props.rigid ? 0.055 : 0.035, 6, 16, Math.PI]} />
      </mesh>,
    );
  }
  return (
    <group position={props.position}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.1, 1.1, props.length, 24, 1, false, 0, Math.PI]} />
        {high ? (
          <meshPhysicalMaterial
            ref={shell}
            color={props.rigid ? '#2a3834' : '#2a3c2c'}
            roughness={props.rigid ? 0.08 : 0.32}
            metalness={0}
            transparent
            opacity={props.rigid ? 0.7 : 0.5}
            depthWrite={false}
            side={THREE.DoubleSide}
            // N8AO + EffectComposer has no transmission buffer — physical film, not a black shell.
            transmission={0}
            clearcoat={props.rigid ? 0.42 : 0.08}
            clearcoatRoughness={props.rigid ? 0.1 : 0.55}
            attenuationColor="#3d9a4a"
            emissive="#59c96a"
            emissiveIntensity={0.05}
          />
        ) : (
          <meshStandardMaterial
            ref={shell}
            color={props.rigid ? '#2a3834' : '#2a3c2c'}
            roughness={props.rigid ? 0.12 : 0.22}
            metalness={props.rigid ? 0.15 : 0}
            transparent
            opacity={props.rigid ? 0.82 : 0.68}
            depthWrite={false}
            emissive="#59c96a"
            emissiveIntensity={0.1}
          />
        )}
      </mesh>
      {ribs}
      <mesh position={[0, 0.06, 0.36]} material={MAT.deck}>
        <boxGeometry args={[props.length - 1.2, 0.08, 0.5]} />
      </mesh>
      <mesh position={[0, 0.06, -0.36]} material={MAT.deck}>
        <boxGeometry args={[props.length - 1.2, 0.08, 0.5]} />
      </mesh>
      <CropStands length={props.length} />
      <mesh position={[props.length / 2 - 0.12, 0.1, 0]} castShadow material={MAT.habitat}>
        <boxGeometry args={[0.28, 1.7, 2.15]} />
      </mesh>
      <mesh position={[-props.length / 2 + 0.12, 0.1, 0]} castShadow material={MAT.habitat}>
        <boxGeometry args={[0.28, 1.7, 2.15]} />
      </mesh>
      <mesh position={[props.length / 2 + 0.35, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.steel} castShadow>
        <cylinderGeometry args={[0.38, 0.38, 0.55, 10]} />
      </mesh>
      {high ? (
        <pointLight color="#59c96a" intensity={props.glow * 3} distance={7} position={[0, 0.8, 0]} />
      ) : null}
    </group>
  );
}

/** Buried LED hall: berm, glowing portal, vent stacks. */
function BuriedHall(props: { position: [number, number, number]; glow: number }): React.ReactElement {
  return (
    <group position={props.position}>
      <mesh position={[0, 0.7, 0]} material={MAT.berm} castShadow receiveShadow>
        <sphereGeometry args={[2.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[2.15, 0.5, 0]}>
        <boxGeometry args={[0.55, 1.05, 1.25]} />
        <meshStandardMaterial color="#183820" emissive="#59c96a" emissiveIntensity={1.4 + props.glow * 0.8} />
      </mesh>
      <Stack position={[-0.8, 1.4, 0.9]} height={0.9} radius={0.1} />
      <Stack position={[-0.2, 1.5, -1.0]} height={0.7} radius={0.08} />
    </group>
  );
}

/** Slowly turning compost drum on axle stands. */
function CompostDrum(props: { position: [number, number, number] }): React.ReactElement {
  const drum = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (drum.current) {
      drum.current.rotation.y += delta * 0.32;
    }
  });
  return (
    <group position={props.position} rotation={[0, 0, Math.PI / 2]}>
      <mesh position={[0, 0.55, 0]} material={MAT.rustSteel}>
        <boxGeometry args={[0.12, 1.1, 0.12]} />
      </mesh>
      <mesh position={[0, -0.55, 0]} material={MAT.rustSteel}>
        <boxGeometry args={[0.12, 1.1, 0.12]} />
      </mesh>
      <group ref={drum}>
        <mesh material={MAT.drum} castShadow receiveShadow>
          <cylinderGeometry args={[0.7, 0.7, 1.8, 12]} />
        </mesh>
        {[-0.85, 0.85].map((y) => (
          <mesh key={`flange-${y}`} position={[0, y, 0]} material={MAT.rustSteel}>
            <cylinderGeometry args={[0.78, 0.78, 0.1, 12]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Digester pot with gas dome and a feed pipe. */
function DigesterPot(props: { position: [number, number, number] }): React.ReactElement {
  return (
    <group position={props.position}>
      <mesh material={MAT.digester} castShadow receiveShadow>
        <cylinderGeometry args={[0.9, 0.9, 1.4, 12]} />
      </mesh>
      <mesh position={[0, 0.95, 0]} material={MAT.digester} castShadow>
        <sphereGeometry args={[0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <Stack position={[0, 1.7, 0]} height={0.55} radius={0.08} />
      <Pipe from={[0.9, 0.4, 0]} to={[1.6, 0.4, -1.4]} radius={0.06} material={MAT.digester} />
    </group>
  );
}

/** Soil factory: hopper, wash tank, output pile. */
function SoilFactory(): React.ReactElement {
  return (
    <group position={[-16, 0, 10]}>
      <mesh position={[0, 0.8, 0]} material={MAT.rustSteel} castShadow receiveShadow>
        <boxGeometry args={[3.4, 1.6, 2.6]} />
      </mesh>
      <mesh position={[0, 2.1, 0]} material={MAT.intake} castShadow>
        <cylinderGeometry args={[0.15, 1.15, 1.1, 6]} />
      </mesh>
      <mesh position={[2.1, 0.7, 0]} material={MAT.iceTank} castShadow>
        <cylinderGeometry args={[0.7, 0.7, 1.4, 12]} />
      </mesh>
      <mesh position={[-2.0, 0.35, 1.2]} material={MAT.berm} castShadow>
        <sphereGeometry args={[0.7, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <Stack position={[1.2, 1.6, 1.0]} height={1.1} radius={0.1} />
    </group>
  );
}

/** Fab shop: sawtooth roof, door, crane rail, radio mast. */
function FabShop(): React.ReactElement {
  return (
    <group position={[8, 0, 8]}>
      <mesh position={[0, 1.4, 0]} material={MAT.steel} castShadow receiveShadow>
        <boxGeometry args={[4.5, 2.8, 3.5]} />
      </mesh>
      {[-1.1, 0, 1.1].map((z) => (
        <mesh
          key={`tooth-${z}`}
          position={[0, 3.05, z]}
          rotation={[-0.42, 0, 0]}
          material={MAT.rustSteel}
          castShadow
        >
          <boxGeometry args={[4.6, 0.1, 1.35]} />
        </mesh>
      ))}
      <mesh position={[0, 1.1, 1.78]} material={MAT.darkGlass}>
        <boxGeometry args={[1.6, 1.8, 0.08]} />
      </mesh>
      <mesh position={[0, 3.35, 0]} material={MAT.steel}>
        <boxGeometry args={[5.2, 0.08, 0.12]} />
      </mesh>
      <mesh position={[0, 4.4, -1.4]} material={MAT.steel} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 2.2, 6]} />
      </mesh>
      <mesh position={[0, 5.45, -1.4]} rotation={[0.5, 0.4, 0]} material={MAT.steel}>
        <cylinderGeometry args={[0.28, 0.08, 0.12, 12]} />
      </mesh>
      <BeaconLamp position={[2.1, 3.0, 1.6]} />
    </group>
  );
}

/** All the buildings, derived from structure counts + live inventories. */
export function Settlement(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const scrubSol = useSimStore((s) => s.scrubSol);
  const st = sim.structures;
  const snap = viewSnapshot(sim, scrubSol);
  const tau = snap ? snap.tau : 0.4;
  const sun = sunlightFraction(tau);
  const ghGlow = clamp(sun / 0.5, 0.05, 1);
  const cryoCap = Math.max(1, st.cryoPlant * STRUCTURES.cryoPlant.capacityValue);
  const scrubbing = scrubSol !== null && snap !== undefined;
  const ch4Kg = scrubbing ? snap.methaloxKg / (1 + LOX_TO_CH4_RATIO) : sim.inv.ch4Kg;
  const loxKg = scrubbing ? snap.methaloxKg - ch4Kg : sim.inv.loxKg;
  const waterKg = scrubbing ? snap.waterKg : sim.inv.waterKg;
  const ch4Fill = clamp(safeDiv(ch4Kg, cryoCap * 0.22), 0.02, 1);
  const loxFill = clamp(safeDiv(loxKg, cryoCap * 0.78), 0.02, 1);
  const waterFill = clamp(safeDiv(waterKg, 100000), 0.05, 1);

  const flare = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (flare.current) {
      flare.current.intensity = 6 + Math.sin(state.clock.elapsedTime * 1.7) * 1.5;
    }
  });

  return (
    <group>
      <Pick id="iceMine">
        <IceMine />
      </Pick>

      <Pick id="pad">
        <Row count={Math.max(0, st.pad)} spacing={LAYOUT.padSpacing} origin={[LAYOUT.padOriginX, 0.02, LAYOUT.padOriginZ]}>
          {(i, pos) => <LandingPad key={`pad-${i}`} position={pos} />}
        </Row>
      </Pick>

      <Pick id="solar">
        <InstancedSolarField key={`sol-${st.solar * 3}`} count={st.solar * 3} />
      </Pick>

      <Pick id="nuclear">
        <Row count={st.nuclear} spacing={4.6} origin={[24, 0.55, 8]}>
          {(i, pos) => <Reactor key={`nuc-${i}`} position={pos} />}
        </Row>
      </Pick>

      <group position={[LAYOUT.plantX, 0, LAYOUT.plantZ]}>
        {st.compressor > 0 ? (
          <Pick id="compressor">
            <group position={[0, 0, 0]}>
              <CompressorSkid />
            </group>
          </Pick>
        ) : null}
        {st.electrolyzer > 0 ? (
          <Pick id="electrolyzer">
            <group position={[4.2, 0, 0]}>
              <ElectrolyzerSkid />
            </group>
          </Pick>
        ) : null}
        {st.sabatier > 0 ? (
          <Pick id="sabatier">
            <group position={[8.4, 0, 0]}>
              <SabatierSkid />
              <pointLight ref={flare} position={[0.2, 4.4, -0.9]} color="#e2661a" distance={16} />
            </group>
          </Pick>
        ) : null}
        {st.compressor > 0 && st.electrolyzer > 0 ? (
          <Pipe from={[1.6, 1.1, 0]} to={[2.6, 1.1, 0]} radius={0.08} />
        ) : null}
        {st.electrolyzer > 0 && st.sabatier > 0 ? (
          <Pipe from={[5.8, 1.1, 0]} to={[6.8, 1.1, 0]} radius={0.08} />
        ) : null}
      </group>

      {/* Process plumbing: ice water in, methalox out. */}
      {st.compressor > 0 ? (
        <PipedRun
          from={[LAYOUT.mineX + 6, 0.7, LAYOUT.mineZ - 1]}
          to={[LAYOUT.plantX - 1.6, 0.7, LAYOUT.plantZ]}
          radius={0.09}
          material={MAT.iceTank}
        />
      ) : null}
      {st.cryoPlant > 0 && st.sabatier > 0 ? (
        <PipedRun
          from={[LAYOUT.plantX + 9.6, 0.75, LAYOUT.plantZ]}
          to={[LAYOUT.cryoX - 0.2, 0.75, LAYOUT.cryoZ + 2]}
          radius={0.08}
          material={MAT.ch4Tank}
        />
      ) : null}

      {st.cryoPlant > 0 ? (
        <Pick id="cryoPlant">
          <CryoFarm ch4Fill={ch4Fill} loxFill={loxFill} waterFill={waterFill} />
        </Pick>
      ) : null}

      <Pick id="habitat">
        <Row count={st.habitat} spacing={4.5} origin={[2, 1.1, 2]}>
          {(i, pos) =>
            i === 0 ? (
              <HabitatCutaway key={`hab-${i}`} position={pos} linked={false} />
            ) : (
              <HabitatCan key={`hab-${i}`} position={pos} linked={i % 6 !== 0} />
            )
          }
        </Row>
      </Pick>

      <Pick id="ghInflatable">
        {Array.from({ length: st.ghInflatable }, (_, i) => (
          <GreenhouseStreet
            key={`ghi-${i}`}
            position={[2 + i * 3.2, 0, -6]}
            length={10}
            glow={ghGlow}
            rigid={false}
          />
        ))}
      </Pick>
      <Pick id="ghRigid">
        {Array.from({ length: st.ghRigid }, (_, i) => (
          <GreenhouseStreet
            key={`ghr-${i}`}
            position={[2 + i * 3.2, 0, -10]}
            length={8}
            glow={ghGlow}
            rigid
          />
        ))}
      </Pick>
      <Pick id="ghBuried">
        {Array.from({ length: st.ghBuried }, (_, i) => (
          <BuriedHall key={`ghb-${i}`} position={[-8 + i * 5, 0, -8]} glow={ghGlow} />
        ))}
      </Pick>

      <Pick id="composter">
        <Row count={st.composter} spacing={2.4} origin={[-6, 0.7, 6]}>
          {(i, pos) => <CompostDrum key={`cmp-${i}`} position={pos} />}
        </Row>
      </Pick>
      <Pick id="digester">
        <Row count={st.digester} spacing={2.6} origin={[-6, 0.9, 9]}>
          {(i, pos) => <DigesterPot key={`dig-${i}`} position={pos} />}
        </Row>
      </Pick>

      {st.soilFactory > 0 ? (
        <Pick id="soilFactory">
          <SoilFactory />
        </Pick>
      ) : null}
      {st.fabShop > 0 ? (
        <Pick id="fabShop">
          <FabShop />
        </Pick>
      ) : null}
    </group>
  );
}
