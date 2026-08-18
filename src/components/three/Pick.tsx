'use client';

/**
 * Clickable wrapper for scene objects: any mesh inside selects the given
 * inspection id (opening the live datasheet card) and shows a pointer
 * cursor on hover. Shared by the city buildings, the Starships, and the rover.
 */

import type { ThreeEvent } from '@react-three/fiber';
import type { InspectId } from '../../lib/sim/inspect';
import { useSimStore } from '../../store/useSimStore';

/** Wraps scene children in a group that selects `id` for inspection on click. */
export function Pick(props: { id: InspectId; children: React.ReactNode }): React.ReactElement {
  const setInspect = useSimStore((s) => s.setInspect);
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        setInspect(props.id);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {props.children}
    </group>
  );
}
