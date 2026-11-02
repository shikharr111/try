import type { SVGProps } from "react";

/**
 * Small inline SVG icon set (24x24 stroke icons). No external icon package is needed, so nothing extra has to be
 * installed. Icons are decorative (aria-hidden); every control that uses one also has a visible or aria label.
 */
const paths = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  projects: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  plus: "M12 5v14M5 12h14",
  overview: "M3 12 12 4l9 8M5 10v10h5v-6h4v6h5V10",
  plan: "M4 6h10M4 12h16M4 18h12M16 4v4M10 10v4M14 16v4",
  reports: "M8 4h8l4 4v12H8zM8 4v16H4V8zM12 12h5M12 16h5",
  delays: "M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  analytics: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  import: "M12 3v12M7 10l5 5 5-5M4 21h16",
  ai: "M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z",
  report: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .5-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 2L6 8.5 4 8l-1 3 2 1v2l-2 1 1 3 2-.5L7.5 19 7 21l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  menu: "M4 6h16M4 12h16M4 18h16",
  chevronDown: "M6 9l6 6 6-6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  logout: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9",
  close: "M6 6l12 12M18 6 6 18",
  check: "M5 12l5 5 9-10",
  info: "M12 8v.01M12 11v5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  alert: "M12 4 2 20h20zM12 10v4M12 17v.01",
  org: "M4 21V8l8-4 8 4v13M9 21v-6h6v6M8 11h.01M12 11h.01M16 11h.01",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 1 1 8 0v3",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  filter: "M3 5h18l-7 8v6l-4-2v-4z",
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={paths[name]} />
    </svg>
  );
}
