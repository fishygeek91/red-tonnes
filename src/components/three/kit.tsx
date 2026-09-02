'use client';

/**
 * Industrial kitbash pieces: pipes, insulation bands, stacks, posts.
 * Kept tiny and material-shared so a denser city does not explode draw calls
 * with unique materials.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { MAT } from './materials';

/** Repeat a mesh `count` times along a 6-wide row with spacing. */
export function Row(props: {
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

/**
 * A cylinder spanning two world points. Degenerate (zero-length) runs
 * collapse to a 1 cm stub so normalize never sees a zero vector.
 */
export function Pipe(props: {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  radius?: number;
  material?: THREE.Material;
}): React.ReactElement {
  const radius = props.radius ?? 0.07;
  const material = props.material ?? MAT.steel;
  const xform = useMemo(() => {
    const ax = props.from[0];
    const ay = props.from[1];
    const az = props.from[2];
    const bx = props.to[0];
    const by = props.to[1];
    const bz = props.to[2];
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const length = Math.max(Math.hypot(dx, dy, dz), 0.01);
    const mid: [number, number, number] = [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2];
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx / length, dy / length, dz / length),
    );
    return { length, mid, quat };
  }, [props.from, props.to]);
  return (
    <mesh position={xform.mid} quaternion={xform.quat} material={material} castShadow>
      <cylinderGeometry args={[radius, radius, xform.length, 8]} />
    </mesh>
  );
}

/** Insulation / flange ring around a vertical tank. */
export function Band(props: { y: number; radius: number; tube?: number }): React.ReactElement {
  return (
    <mesh position={[0, props.y, 0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.rustSteel}>
      <torusGeometry args={[props.radius, props.tube ?? 0.055, 8, 20]} />
    </mesh>
  );
}

/** Exhaust / intake stack with a flared lip. */
export function Stack(props: {
  position: readonly [number, number, number];
  height?: number;
  radius?: number;
}): React.ReactElement {
  const height = props.height ?? 1.6;
  const radius = props.radius ?? 0.16;
  return (
    <group position={[props.position[0], props.position[1], props.position[2]]}>
      <mesh position={[0, height / 2, 0]} material={MAT.rustSteel} castShadow>
        <cylinderGeometry args={[radius, radius, height, 8]} />
      </mesh>
      <mesh position={[0, height + 0.08, 0]} material={MAT.intake} castShadow>
        <cylinderGeometry args={[radius * 1.6, radius, 0.16, 8]} />
      </mesh>
    </group>
  );
}

/** Sleepered pipe run: the long-distance plumbing that makes the loop readable. */
export function PipedRun(props: {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  radius?: number;
  material?: THREE.Material;
}): React.ReactElement {
  const dx = props.to[0] - props.from[0];
  const dy = props.to[1] - props.from[1];
  const dz = props.to[2] - props.from[2];
  const len = Math.hypot(dx, dy, dz);
  const steps = Math.max(2, Math.floor(len / 3.4));
  const sleepers: React.ReactElement[] = [];
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    sleepers.push(
      <mesh
        key={`sl-${i}`}
        position={[props.from[0] + dx * t, props.from[1] + dy * t - 0.22, props.from[2] + dz * t]}
        material={MAT.rustSteel}
      >
        <boxGeometry args={[0.2, 0.4, 0.2]} />
      </mesh>,
    );
  }
  return (
    <group>
      <Pipe from={props.from} to={props.to} radius={props.radius} material={props.material} />
      {sleepers}
    </group>
  );
}

/** Strobe lamp — intensity is pulsed on the shared MAT.beacon. */
export function BeaconLamp(props: { position: readonly [number, number, number] }): React.ReactElement {
  return (
    <mesh position={[props.position[0], props.position[1], props.position[2]]} material={MAT.beacon}>
      <sphereGeometry args={[0.07, 8, 8]} />
    </mesh>
  );
}
