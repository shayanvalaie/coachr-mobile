import { Platform } from "react-native";

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
