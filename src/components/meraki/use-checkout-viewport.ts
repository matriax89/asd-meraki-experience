"use client";

import { useEffect, type RefObject } from "react";

/** Keep the single dialog scroller inside the visible viewport, including an open mobile keyboard. */
export function useCheckoutViewport(dialog: RefObject<HTMLDialogElement | null>, open: boolean) {
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const revealFocus = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const active = document.activeElement;
        const scroller = element.querySelector<HTMLElement>("[data-checkout-scroll]");
        if (!(active instanceof HTMLElement) || !scroller?.contains(active)) return;
        const input = active.getBoundingClientRect();
        const bounds = scroller.getBoundingClientRect();
        const gap = 18;
        if (input.bottom > bounds.bottom - gap) scroller.scrollTop += input.bottom - bounds.bottom + gap;
        else if (input.top < bounds.top + gap) scroller.scrollTop -= bounds.top - input.top + gap;
      });
    };
    const resize = () => {
      const height = viewport?.height || window.innerHeight;
      element.style.setProperty("--checkout-viewport-height", `${height}px`);
      element.style.setProperty("--checkout-viewport-top", `${viewport?.offsetTop || 0}px`);
      revealFocus();
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    element.addEventListener("focusin", revealFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      element.removeEventListener("focusin", revealFocus);
      element.style.removeProperty("--checkout-viewport-height");
      element.style.removeProperty("--checkout-viewport-top");
    };
  }, [dialog, open]);
}
