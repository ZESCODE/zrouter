// Canonical status colors — single source of truth for status HEX, mirroring
// the semantic tokens in src/app/globals.css (--color-success / --color-warning
// / --color-danger).
//
// Use these HEX values ONLY where a CSS class can't reach — canvas, SVG
// strokes (Recharts), or inline styles. For normal DOM, prefer the Tailwind
// utilities (`text-success`, `bg-error/10`, …) which already read the same
// tokens.
export const STATUS_HEX = {
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
  muted: "#6b7280",
};
