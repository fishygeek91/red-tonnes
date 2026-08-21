'use client';

/**
 * City-first bottom sheet: city stays visible above a ~70% panel.
 * On landscape tablets the panel pins right so more of the settlement shows.
 */

import { useRef, useState } from 'react';

/** Distance (px) the handle must travel before the sheet dismisses. */
const DISMISS_PX = 72;

/**
 * Dimmed, swipe-to-dismiss sheet over the lower portion of the city.
 * @param props.open - Whether the sheet is visible.
 * @param props.title - Header label.
 * @param props.onClose - Dismiss handler (backdrop, handle swipe, or close).
 * @param props.children - Body content.
 * @param props.scrollBody - When false, the body does not scroll (child panels do).
 */
export function Sheet(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  scrollBody?: boolean;
}): React.ReactElement | null {
  const startY = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);

  if (!props.open) {
    return null;
  }

  /**
   * Begin a dismiss gesture from the grab handle / title row.
   * Close-button presses are ignored so a tap does not also drag.
   * @param event - Pointer that started on the handle.
   */
  const beginDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.target instanceof HTMLElement && event.target.closest('button') !== null) {
      return;
    }
    startY.current = event.clientY;
    dragYRef.current = 0;
    setDragY(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  /**
   * Track vertical drag; ignore upward motion.
   * @param event - Pointer move while captured.
   */
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = startY.current;
    if (start === null) {
      return;
    }
    const next = Math.max(0, event.clientY - start);
    dragYRef.current = next;
    setDragY(next);
  };

  /** Release: close if the handle traveled far enough, otherwise snap back. */
  const endDrag = (): void => {
    const traveled = dragYRef.current;
    startY.current = null;
    dragYRef.current = 0;
    setDragY(0);
    if (traveled >= DISMISS_PX) {
      props.onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col landscape:md:flex-row justify-end pointer-events-none">
      <button
        type="button"
        aria-label="Close sheet"
        className="flex-1 w-full bg-black/45 pointer-events-auto border-0"
        onClick={props.onClose}
      />
      <div
        className="pointer-events-auto w-full h-[70%] landscape:md:h-full landscape:md:w-[28rem] landscape:md:max-w-md panel border-t landscape:md:border-t-0 landscape:md:border-l border-[var(--rust)] flex flex-col min-h-0"
        style={{ transform: dragY > 0 ? `translateY(${dragY}px)` : undefined }}
        role="dialog"
        aria-label={props.title}
      >
        <div
          className="shrink-0 px-3 pt-2 pb-1 select-none touch-none"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--line)]" />
          <div className="flex items-center justify-between gap-2">
            <h2 className="panel-title text-[var(--rust-hot)]">{props.title}</h2>
            <button
              type="button"
              onClick={props.onClose}
              className="min-w-11 min-h-11 text-[var(--dim)] hover:text-[var(--text)] text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className={`flex-1 min-h-0 ${props.scrollBody === false ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
          {props.children}
        </div>
      </div>
    </div>
  );
}
