// Layout and motion scales. Every spacing, radius, type, shadow, and duration
// value in the app should come from here, never from inline magic numbers.

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const type = {
  caption: { fontSize: 11, lineHeight: 15 },
  body: { fontSize: 13, lineHeight: 19 },
  bodyLg: { fontSize: 15, lineHeight: 21 },
  title: { fontSize: 18, lineHeight: 24 },
  display: { fontSize: 26, lineHeight: 31 },
} as const;

// Shadows are tinted toward the app's green-black background, not pure black.
export const shadow = {
  card: {
    shadowColor: "#04120b",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  float: {
    shadowColor: "#04120b",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

export const motion = {
  pressScale: 0.97,
  fast: 120, // exits, fades
  base: 160, // press feedback, enters
  slow: 240, // sheets, layout shifts
} as const;

export type SpaceKey = keyof typeof space;
export type RadiusKey = keyof typeof radius;
export type TypeVariant = keyof typeof type;
