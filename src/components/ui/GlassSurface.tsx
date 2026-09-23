import { ReactNode } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { theme } from "../../theme/colors";
import { radius as radiusScale, shadow } from "../../theme/tokens";

type Props = {
  children?: ReactNode;
  radius?: number;
  // Tab bar uses the stronger tint so labels stay legible over any content.
  strong?: boolean;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

// The chrome surface: a dark tint over a blur of whatever scrolls beneath.
// Split into an outer (shadow) and inner (clip) view because iOS drops the
// shadow of any view that also clips its children.
const GlassSurface = ({
  children,
  radius = radiusScale.xl,
  strong = false,
  borderColor = theme.border.glass,
  style,
  contentStyle,
}: Props) => {
  const tint = strong ? theme.bg.glassStrong : theme.bg.glass;
  // Android has no cheap backdrop blur; a solid surface keeps text crisp.
  const fill = Platform.OS === "ios" ? tint : theme.bg.elevated;

  return (
    <View style={[styles.outer, { borderRadius: radius, backgroundColor: fill }, style]}>
      <View style={[styles.clip, { borderRadius: radius, borderColor }, contentStyle]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        ) : null}
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    ...shadow.glass,
  },
  clip: {
    overflow: "hidden",
    borderWidth: 1,
  },
});

export default GlassSurface;
