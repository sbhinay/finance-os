"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({
  title,
  children,
  onClose,
  wide,
  maxWidth,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  maxWidth?: number | string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="finance-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="finance-drawer finance-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ maxWidth: maxWidth ?? (wide ? 760 : 540) }}
      >
        <div className="finance-modal-header">
          <div id={titleId} className="finance-modal-title">{title}</div>
          <button type="button" onClick={onClose} className="finance-button finance-modal-close" aria-label={`Close ${title}`}>
            Close
          </button>
        </div>
        <div className="finance-modal-content">{children}</div>
      </div>
    </div>,
    document.body
  );
}
