import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#ffffff",
        bone: "#fafaf7",
        ink: "#111418",
        ash: "#5b626c",
        line: "#e6e4dc",
        yellow: "#FFC400",
        pass: "#16A34A",
        fail: "#DC2626",
        info: "#2563EB",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      maxWidth: { frame: "1180px" },
    },
  },
  plugins: [],
};

export default config;
