'use client';

/**
 * Sidebar Mars: the same globe body as the city-canvas planet view, but
 * auto-spinning and without site labels (the panel is only 240px tall).
 */

import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useSimStore } from '../../store/useSimStore';
import { MarsBody } from './MarsBody';

/** Canvas wrapper for the globe panel. */
export function MarsGlobe(): React.ReactElement {
  const siteId = useSimStore((s) => s.sim.siteId);
  return (
    <div className="h-[240px] shrink-0 relative">
      <Canvas camera={{ position: [0, 0.6, 2.4], fov: 40 }} gl={{ antialias: true }} dpr={[1, 2]}>
        <ambientLight intensity={0.25} />
        <directionalLight position={[4, 2, 3]} intensity={2.6} color="#fff2e0" />
        <directionalLight position={[-4, -1, -2]} intensity={0.12} color="#8ab4d8" />
        <Stars radius={40} depth={20} count={1300} factor={2.2} saturation={0} fade speed={0.4} />
        <MarsBody activeSiteId={siteId} autoSpin />
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
      <div className="absolute bottom-1 left-2 text-[9px] text-[var(--dim)] pointer-events-none">
        MOLA-ish hypsometry · Olympus, Valles, Hellas · green = your site
      </div>
    </div>
  );
}
