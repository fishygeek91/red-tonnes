'use client';

/**
 * Effective WebGL quality: phones stay on the lite path by contract,
 * desktop honors the GFX control in the store.
 */

import { useSimStore, type GraphicsQuality } from '../store/useSimStore';
import { useNarrowViewport } from './useNarrowViewport';

/**
 * Resolve the scene's graphics tier.
 * Narrow viewports always return `low` so the GFX footer cannot lie on phones.
 * @returns `high`, `medium`, or `low`.
 */
export function useGraphicsTier(): GraphicsQuality {
  const narrow = useNarrowViewport();
  const requested = useSimStore((s) => s.graphicsQuality);
  if (narrow) {
    return 'low';
  }
  return requested;
}
