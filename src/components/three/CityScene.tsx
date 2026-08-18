'use client';

/**
 * The city as an orbitable cutaway: pads, power fields, ISRU plant, ice mine,
 * habitats, greenhouse streets (they glow), compost drums, digesters, and the
 * cryo tank farm with live fill levels. Composting is visible architecture,
 * not an icon. Dust storms show up as fog and a dimmed sun.
 */

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { getSite, opticalDepthAtSol } from '../../lib/sites';
import { STRUCTURES } from '../../lib/structures';
import { clamp, safeDiv } from '../../lib/types';
import { sunlightFraction } from '../../lib/sim/step';
import { useSimStore } from '../../store/useSimStore';

/** Shared materials (module-level: allocated once, reused every render). */
const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.45, metalness: 0.8 }),
  rustSteel: new THREE.MeshStandardMaterial({ color: '#7d5a44', roughness: 0.7, metalness: 0.5 }),
  regolith: new THREE.MeshStandardMaterial({ color: '#6e3620', roughness: 1 }),
  pad: new THREE.MeshStandardMaterial({ color: '#4a4038', roughness: 0.9 }),
  panel: new THREE.MeshStandardMaterial({ color: '#1b2733', roughness: 0.35, metalness: 0.6 }),
  habitat: new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.6 }),
  drum: new THREE.MeshStandardMaterial({ color: '#5d6b46', roughness: 0.8 }),
  digester: new THREE.MeshStandardMaterial({ color: '#46605d', roughness: 0.7 }),
  iceTank: new THREE.MeshStandardMaterial({ color: '#7cc7e8', roughness: 0.3, metalness: 0.4 }),
  ch4Tank: new THREE.MeshStandardMaterial({ color: '#b8c7cc', roughness: 0.3, metalness: 0.6 }),
  berm: new THREE.MeshStandardMaterial({ color: '#54291a', roughness: 1 }),
};

/** Repeat a mesh `count` times along a row with spacing. */
function Row(props: {
  count: number;
  spacing: number;
  origin: readonly [number, number, number];
  children: (i: number, pos: [number, number, number]) => React.ReactElement;
}): React.ReactElement {
  const items: React.ReactElement[] = [];
  for (let i = 0; i < props.count; i += 1) {
    items.push(
      props.children(i, [
        props.origin[0] + (i % 6) * props.spacing,
        props.origin[1],
        props.origin[2] + Math.floor(i / 6) * props.spacing,
      ]),
    );
  }
  return <group>{items}</group>;
}

/** Greenhouse street: a half-cylinder that glows greenhouse-green when alive. */
function GreenhouseStreet(props: {
  position: [number, number, number];
  length: number;
  glow: number;
}): React.ReactElement {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  // Material mutation happens inside the frame loop, not during render.
  useFrame(() => {
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.08 + props.glow * 0.9;
    }
  });
  return (
    <group position={props.position}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.1, 1.1, props.length, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial
          ref={matRef}
          color="#2a3c2c"
          roughness={0.2}
          transparent
          opacity={0.85}
          emissive="#59c96a"
          emissiveIntensity={0.1}
        />
      </mesh>
      {/* interior glow light: the scarce green pigment of the whole scene */}
      <pointLight color="#59c96a" intensity={props.glow * 3} distance={7} position={[0, 0.8, 0]} />
    </group>
  );
}

/** All the buildings, derived from structure counts + live inventories. */
function City(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const st = sim.structures;
  const last = sim.history[sim.history.length - 1];
  const tau = last ? last.tau : 0.4;
  const sun = sunlightFraction(tau);
  const ghGlow = clamp(sun / 0.5, 0.05, 1);
  const cryoCap = Math.max(1, st.cryoPlant * STRUCTURES.cryoPlant.capacityValue);
  const ch4Fill = clamp(safeDiv(sim.inv.ch4Kg, cryoCap * 0.22), 0.02, 1);
  const loxFill = clamp(safeDiv(sim.inv.loxKg, cryoCap * 0.78), 0.02, 1);
  const waterFill = clamp(safeDiv(sim.inv.waterKg, 100000), 0.05, 1);

  const flare = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    // Slow industrial flicker on the plant lighting; night never fully sleeps.
    if (flare.current) {
      flare.current.intensity = 6 + Math.sin(state.clock.elapsedTime * 1.7) * 1.5;
    }
  });

  return (
    <group>
      {/* terrain: red basalt plain with a subtle ice-table cutaway trench */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} material={MAT.regolith}>
        <planeGeometry args={[120, 120]} />
      </mesh>
      <mesh position={[-26, -1.2, 14]} material={MAT.iceTank}>
        <boxGeometry args={[14, 1.2, 8]} />
      </mesh>
      <mesh position={[-26, -0.4, 14]} material={MAT.berm}>
        <boxGeometry args={[14.5, 0.5, 8.5]} />
      </mesh>

      {/* landing pads */}
      <Row count={Math.max(0, st.pad)} spacing={9} origin={[16, 0.02, -22]}>
        {(i, pos) => (
          <mesh key={`pad-${i}`} position={pos} material={MAT.pad}>
            <cylinderGeometry args={[3.6, 3.6, 0.12, 24]} />
          </mesh>
        )}
      </Row>

      {/* solar field */}
      <Row count={st.solar * 3} spacing={2.6} origin={[10, 0.5, 12]}>
        {(i, pos) => (
          <mesh key={`sol-${i}`} position={pos} rotation={[-0.5, 0, 0]} material={MAT.panel}>
            <boxGeometry args={[2.2, 0.06, 1.4]} />
          </mesh>
        )}
      </Row>

      {/* nuclear: finned cylinders behind a berm */}
      <Row count={st.nuclear} spacing={4} origin={[24, 0.9, 8]}>
        {(i, pos) => (
          <group key={`nuc-${i}`} position={pos}>
            <mesh material={MAT.steel}>
              <cylinderGeometry args={[0.7, 0.9, 1.8, 12]} />
            </mesh>
            <mesh position={[0, 1.3, 0]} material={MAT.rustSteel}>
              <cylinderGeometry args={[1.3, 0.5, 0.8, 4]} />
            </mesh>
          </group>
        )}
      </Row>

      {/* ISRU plant: compressor/electrolyzer/sabatier as a piped block */}
      <group position={[-14, 0, 2]}>
        {(['compressor', 'electrolyzer', 'sabatier'] as const).map((id, k) =>
          st[id] > 0 ? (
            <group key={id} position={[k * 4.2, 0, 0]}>
              <mesh position={[0, 1, 0]} material={MAT.steel}>
                <boxGeometry args={[3, 2, 2.4]} />
              </mesh>
              <mesh position={[0, 2.6, 0.5]} material={MAT.rustSteel}>
                <cylinderGeometry args={[0.25, 0.25, 1.4, 8]} />
              </mesh>
            </group>
          ) : null,
        )}
        {st.sabatier > 0 ? <pointLight ref={flare} position={[6, 3.5, 0]} color="#e2661a" distance={16} /> : null}
      </group>

      {/* cryo tank farm with live fill */}
      {st.cryoPlant > 0 ? (
        <group position={[-2, 0, -14]}>
          <mesh position={[0, 1.6, 0]} material={MAT.ch4Tank}>
            <cylinderGeometry args={[1.4, 1.4, 3.2, 16]} />
          </mesh>
          <mesh position={[0, 0.15 + ch4Fill * 1.5, 0]} scale={[1.01, ch4Fill, 1.01]}>
            <cylinderGeometry args={[1.41, 1.41, 3.0, 16]} />
            <meshStandardMaterial color="#7cc7e8" transparent opacity={0.5} />
          </mesh>
          <mesh position={[3.6, 1.6, 0]} material={MAT.ch4Tank}>
            <cylinderGeometry args={[1.4, 1.4, 3.2, 16]} />
          </mesh>
          <mesh position={[3.6, 0.15 + loxFill * 1.5, 0]} scale={[1.01, loxFill, 1.01]}>
            <cylinderGeometry args={[1.41, 1.41, 3.0, 16]} />
            <meshStandardMaterial color="#a9d9f0" transparent opacity={0.5} />
          </mesh>
          {/* water tank */}
          <mesh position={[7.2, 1.2, 0]} material={MAT.iceTank}>
            <sphereGeometry args={[1.3 * (0.6 + waterFill * 0.4), 16, 16]} />
          </mesh>
        </group>
      ) : null}

      {/* habitats */}
      <Row count={st.habitat} spacing={4.5} origin={[2, 1.1, 2]}>
        {(i, pos) => (
          <mesh key={`hab-${i}`} position={pos} material={MAT.habitat}>
            <capsuleGeometry args={[1.2, 1.6, 4, 12]} />
          </mesh>
        )}
      </Row>

      {/* greenhouse streets: the emotional heart, glowing green */}
      {Array.from({ length: st.ghInflatable }, (_, i) => (
        <GreenhouseStreet key={`ghi-${i}`} position={[2 + i * 3.2, 0, -6]} length={10} glow={ghGlow} />
      ))}
      {Array.from({ length: st.ghRigid }, (_, i) => (
        <GreenhouseStreet key={`ghr-${i}`} position={[2 + i * 3.2, 0, -10]} length={8} glow={ghGlow} />
      ))}
      {/* buried grow halls: berms with green portal glow (LED — storm-proof) */}
      {Array.from({ length: st.ghBuried }, (_, i) => (
        <group key={`ghb-${i}`} position={[-8 + i * 5, 0, -8]}>
          <mesh position={[0, 0.7, 0]} material={MAT.berm}>
            <sphereGeometry args={[2.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[2.1, 0.5, 0]}>
            <boxGeometry args={[0.6, 1, 1.2]} />
            <meshStandardMaterial color="#183820" emissive="#59c96a" emissiveIntensity={1.2} />
          </mesh>
        </group>
      ))}

      {/* compost drums and digesters: visible architecture */}
      <Row count={st.composter} spacing={2.4} origin={[-6, 0.7, 6]}>
        {(i, pos) => (
          <mesh key={`cmp-${i}`} position={pos} rotation={[0, 0, Math.PI / 2]} material={MAT.drum}>
            <cylinderGeometry args={[0.7, 0.7, 1.8, 12]} />
          </mesh>
        )}
      </Row>
      <Row count={st.digester} spacing={2.6} origin={[-6, 0.9, 9]}>
        {(i, pos) => (
          <group key={`dig-${i}`} position={pos}>
            <mesh material={MAT.digester}>
              <cylinderGeometry args={[0.9, 0.9, 1.4, 12]} />
            </mesh>
            <mesh position={[0, 0.95, 0]} material={MAT.digester}>
              <sphereGeometry args={[0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
          </group>
        )}
      </Row>

      {/* soil factory + fab shop */}
      {st.soilFactory > 0 ? (
        <mesh position={[-16, 0.8, 10]} material={MAT.rustSteel}>
          <boxGeometry args={[3.4, 1.6, 2.6]} />
        </mesh>
      ) : null}
      {st.fabShop > 0 ? (
        <mesh position={[8, 1.4, 8]} material={MAT.steel}>
          <boxGeometry args={[4.5, 2.8, 3.5]} />
        </mesh>
      ) : null}
    </group>
  );
}

/** Atmosphere/fog rig that responds to the live dust optical depth. */
function DustRig(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const site = getSite(sim.siteId);
  const marsYear = Math.floor(sim.sol / 668.6);
  // Recompute tau directly so the fog moves even while paused at sol 0.
  const tau = sim.history.length > 0 ? sim.history[sim.history.length - 1].tau : opticalDepthAtSol(sim.sol, false, site.dustFactor);
  const sun = sunlightFraction(tau);
  void marsYear;
  return (
    <>
      <fog attach="fog" args={['#3a1c10', 30, Math.max(45, 160 * sun + 40)]} />
      <ambientLight intensity={0.25 + sun * 0.15} color="#e8b490" />
      <directionalLight position={[30, 40, 10]} intensity={0.4 + sun * 2.4} color="#ffd9b0" castShadow />
      {/* night-side worklights */}
      <pointLight position={[0, 8, 0]} intensity={2} color="#e2661a" distance={40} />
    </>
  );
}

/** Canvas wrapper: orthographic-feel orbit view of the settlement. */
export function CityScene(): React.ReactElement {
  return (
    <div className="flex-1 relative min-w-0">
      <Canvas
        camera={{ position: [26, 22, 26], fov: 32, near: 0.1, far: 400 }}
        gl={{ antialias: true }}
        style={{ background: 'linear-gradient(#2a130b 0%, #3f1e0f 55%, #56281a 100%)' }}
      >
        <DustRig />
        <City />
        <OrbitControls
          target={[0, 0, 0]}
          maxPolarAngle={Math.PI / 2.2}
          minDistance={12}
          maxDistance={90}
          enableDamping
        />
      </Canvas>
      <div className="absolute bottom-2 left-2 text-[9px] text-[var(--dim)] pointer-events-none">
        drag to orbit · greenhouse glow tracks real light levels · tank fills are live
      </div>
    </div>
  );
}
