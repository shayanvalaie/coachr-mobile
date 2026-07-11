import { Platform, TextStyle } from "react-native";
import { type, TypeVariant } from "./tokens";

export const typeface = {
  display: Platform.select({
    ios: "AvenirNext-Bold",
    android: "sans-serif-condensed",
    default: "System",
  }),
  heading: Platform.select({
    ios: "AvenirNext-DemiBold",
    android: "sans-serif-medium",
    default: "System",
  }),
  body: Platform.select({
    ios: "Avenir Next",
    android: "sans-serif",
    default: "System",
  }),
  mono: Platform.select({
    ios: "Courier",
    android: "monospace",
    default: "monospace",
  }),
};

export type TypefaceKey = keyof typeof typeface;

// Combines the size scale with a font family so call sites never hand-pick
// fontSize/lineHeight pairs: textStyle("title", "heading").
export const textStyle = (
  variant: TypeVariant,
  family: TypefaceKey = "body",
): TextStyle => ({
  fontSize: type[variant].fontSize,
  lineHeight: type[variant].lineHeight,
  fontFamily: typeface[family],
});
