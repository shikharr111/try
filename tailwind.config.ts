import type { Config } from "tailwindcss";

// Restrained industrial palette: warm neutral greys + one safety-orange accent. Status colours always
// ship with a text label or icon, never colour alone.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#1c1f23", soft: "#3a3f46", mute: "#5d646d" },
        steel: { 50: "#f5f6f7", 100: "#eceef0", 200: "#dcdfe3", 300: "#c3c8ce", 400: "#9aa1a9", 500: "#737b85", 600: "#565d66", 700: "#40464e", 800: "#2a2e34", 900: "#1c1f23" },
        accent: { DEFAULT: "#b45309", strong: "#92400e", soft: "#fef3e2" },
        ok: { DEFAULT: "#166534", soft: "#e6f4ea" },
        warn: { DEFAULT: "#92400e", soft: "#fdf1d8" },
        bad: { DEFAULT: "#9b1c1c", soft: "#fbe9e9" },
        info: { DEFAULT: "#1e4e8c", soft: "#e8f0fa" },
      },
      keyframes: { "toast-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } } },
      animation: { "toast-in": "toast-in 160ms ease-out" },
      fontFamily: { sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"], mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"] },
    },
  },
  plugins: [],
};
export default config;
