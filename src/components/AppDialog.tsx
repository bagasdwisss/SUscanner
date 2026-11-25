"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface AppDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  lightDismiss?: boolean;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AppDialog({
  open,
  onClose,
  title,
  subtitle,
  lightDismiss = true,
  maxWidthClass = "max-w-2xl",
  children,
  footer,
}: AppDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pressedOutsideRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback light-dismiss for browsers without HTMLDialogElement closedBy support (e.g. Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !lightDismiss) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    const handlePointerDown = (e: PointerEvent) => {
      pressedOutsideRef.current = isOutside(e);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (pressedOutsideRef.current && isOutside(e)) {
        dialog.close();
      }
      pressedOutsideRef.current = false;
    };

    dialog.addEventListener("pointerdown", handlePointerDown);
    dialog.addEventListener("pointerup", handlePointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", handlePointerDown);
      dialog.removeEventListener("pointerup", handlePointerUp);
    };
  }, [lightDismiss]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = "";
    }
    onClose();
  };

  const closedByProps = {
    closedby: lightDismiss ? "any" : "closerequest",
  } as Record<string, string>;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleClose}
      {...closedByProps}
      className={`m-auto w-[calc(100%-1.5rem)] ${maxWidthClass} rounded-2xl border border-[var(--border-subtle)] p-0 shadow-2xl`}
    >
      <div className="flex max-h-[88dvh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <h1
              id={titleId}
              className="text-lg font-bold tracking-tight text-[var(--ink-primary)]"
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-[var(--ink-secondary)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={`Tutup ${title}`}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink-primary)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 [overscroll-behavior:contain]">
          {children}
        </div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 px-5 py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
