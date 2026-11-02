"use client";
import { useEffect } from "react";

/**
 * Paints the page edges (what shows when you swipe back, pull past the top or bounce at the bottom on a phone) in the
 * same colour as the current screen, instead of the browser's default white. Restores the previous colours on unmount.
 */
export function useBackdrop(color: string) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.backgroundColor, body: body.style.backgroundColor };
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    const hadMeta = !!meta;
    const prevMeta = meta ? meta.content : "";
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    html.style.backgroundColor = color;
    body.style.backgroundColor = color;
    meta.content = color;
    return () => {
      html.style.backgroundColor = prev.html;
      body.style.backgroundColor = prev.body;
      if (hadMeta && meta) meta.content = prevMeta;
      else if (meta) meta.remove();
    };
  }, [color]);
}
