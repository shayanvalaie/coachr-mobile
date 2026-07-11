// Semantic color tokens. Screens reference roles (bg.raised, text.secondary,
// accent.subtle), never raw hex values, so a light theme later is a second
// theme object plus a useTheme() hook - no screen changes.

export const withAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const forestDark = {
  bg: {
    base: "#0f1f18",
    raised: "#183129",
    elevated: "#1e3b31",
    overlay: "rgba(7, 14, 11, 0.65)",
  },
  text: {
    primary: "#f6f1e7",
    secondary: "#c9c0ab",
    muted: withAlpha("#c9c0ab", 0.6),
    onAccent: "#1c1205",
  },
  // Amber is the single primary. Green is semantic success only.
  accent: {
    base: "#f2a63b",
    pressed: "#d98f28",
    subtle: withAlpha("#f2a63b", 0.14),
    subtleBorder: withAlpha("#f2a63b", 0.4),
  },
  border: {
    subtle: withAlpha("#f6f1e7", 0.08),
    base: "#2a4a3d",
    strong: withAlpha("#f6f1e7", 0.16),
  },
  success: {
    base: "#7ecf9d",
    subtle: withAlpha("#7ecf9d", 0.14),
  },
  danger: {
    base: "#ef6b5b",
    subtle: withAlpha("#ef6b5b", 0.14),
    subtleBorder: withAlpha("#ef6b5b", 0.4),
  },
} as const;

export type AppTheme = typeof forestDark;
export const theme: AppTheme = forestDark;
