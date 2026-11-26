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
  headerBgClass?: string;
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
  headerBgClass = "bg-white",
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
      className={`m-auto w-[calc(100%-1rem)] sm:w-[calc(100%-1.5rem)] ${maxWidthClass} overflow-hidden p-0`}
    >
      <div className="flex max-h-[90dvh] flex-col">
        <header
          className={`flex items-start justify-between gap-3 border-b border-[#E5E7EB] ${headerBgClass} px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4`}
        >
          <div>
            <h1
              id={titleId}
              className="text-base font-bold tracking-tight text-[#111114] sm:text-lg"
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 text-xs font-medium text-[#4B5563] sm:text-sm">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={`Tutup ${title}`}
            className="nb-btn-sm inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center bg-[#F6F7F9] text-[#111114] hover:bg-[#E5E7EB]"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#F9FAFB] px-4 py-4 [overscroll-behavior:contain] sm:px-6 sm:py-5">
          {children}
        </div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E5E7EB] bg-white px-4 py-3 sm:gap-2.5 sm:px-6 sm:py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
