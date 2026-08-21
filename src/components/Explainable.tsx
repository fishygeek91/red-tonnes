'use client';

/**
 * Tap/click-to-explain: the hover `title=` tooltips are invisible on phones.
 * One open popover at a time; click outside, tap again, or scroll to close.
 * The panel is portaled so overflow:auto sheets do not clip the formula.
 */

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Shared "which formula is open" gate so only one popover shows. */
interface ExplainGate {
  readonly openId: string | null;
  readonly setOpenId: (id: string | null) => void;
}

/** Viewport box used to pin the portaled popover. */
interface PopBox {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly placeAbove: boolean;
}

const ExplainContext = createContext<ExplainGate | null>(null);

/**
 * Provides a single open-popover id for a screen (desktop or city-first).
 * @param props - Children that may contain Explainable controls.
 */
export function ExplainableProvider(props: { children: React.ReactNode }): React.ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);
  return <ExplainContext.Provider value={{ openId, setOpenId }}>{props.children}</ExplainContext.Provider>;
}

/**
 * Use the nearest gate, or a local fallback if rendered outside a provider.
 * @returns Open-id controller.
 */
function useExplainGate(): ExplainGate {
  const ctx = useContext(ExplainContext);
  const [openId, setOpenId] = useState<string | null>(null);
  if (ctx !== null) {
    return ctx;
  }
  return { openId, setOpenId };
}

/**
 * Measure the trigger and decide whether the panel sits below or above.
 * @param rect - Trigger bounding box.
 * @returns Pin coordinates.
 */
function boxFromRect(rect: DOMRect): PopBox {
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeAbove = spaceBelow < 132 && rect.top > spaceBelow;
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    placeAbove,
  };
}

/**
 * A tappable label/value whose formula opens in a small panel.
 * @param props.explanation - Formula / assumption copy (same text as the old tooltips).
 * @param props.children - Visible label and value.
 * @param props.className - Optional wrapper classes.
 * @param props.align - Popover alignment; `end` pins to the right for row layouts.
 */
export function Explainable(props: {
  explanation: string;
  children: React.ReactNode;
  className?: string;
  align?: 'start' | 'end';
}): React.ReactElement {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const { openId, setOpenId } = useExplainGate();
  const open = openId === id;
  const [box, setBox] = useState<PopBox | null>(null);

  /** Toggle the panel and pin it to the trigger's current viewport box. */
  const toggle = (): void => {
    if (open) {
      setOpenId(null);
      return;
    }
    const el = rootRef.current;
    if (el !== null) {
      setBox(boxFromRect(el.getBoundingClientRect()));
    }
    setOpenId(id);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    /** Close when the pointer lands outside the trigger and the popover. */
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const root = rootRef.current;
      const pop = popRef.current;
      if ((root !== null && root.contains(target)) || (pop !== null && pop.contains(target))) {
        return;
      }
      setOpenId(null);
    };
    /** Scroll moves the trigger; close rather than chase it. */
    const onScroll = (): void => {
      setOpenId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, setOpenId]);

  const popWidth = 288;
  let popLeft = 8;
  if (box !== null) {
    const raw = props.align === 'end' ? box.right - popWidth : box.left;
    popLeft = Math.max(8, Math.min(raw, window.innerWidth - popWidth - 8));
  }

  return (
    <div ref={rootRef} className={`relative ${props.className ?? ''}`}>
      <button
        type="button"
        onClick={toggle}
        className="stat-hover text-left w-full min-w-0"
        aria-expanded={open}
        aria-controls={id}
        title={props.explanation}
      >
        {props.children}
      </button>
      {typeof document !== 'undefined' && open && box !== null
        ? createPortal(
            <div
              ref={popRef}
              id={id}
              role="note"
              className="panel border border-[var(--rust)] px-2.5 py-2 text-[10px] leading-snug text-[var(--text)] shadow-lg"
              style={{
                position: 'fixed',
                zIndex: 60,
                width: `min(${popWidth}px, calc(100vw - 16px))`,
                left: popLeft,
                ...(box.placeAbove
                  ? { bottom: window.innerHeight - box.top + 4 }
                  : { top: box.bottom + 4 }),
              }}
            >
              {props.explanation}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
