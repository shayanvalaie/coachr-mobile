import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// Two very soft glows behind every screen so the flat base reads as a room,
// not a void: a warmer one top-left and a fainter one bottom-right. Both
// gradients span the whole screen (transparent over most of it) so there is
// never a hard edge where one layer stops.
const AmbientBackground = () => (
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <LinearGradient
      colors={["#183328", "rgba(24, 51, 40, 0)", "rgba(24, 51, 40, 0)"]}
      locations={[0, 0.55, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.7, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <LinearGradient
      colors={["rgba(19, 40, 32, 0)", "rgba(19, 40, 32, 0)", "#132820"]}
      locations={[0, 0.6, 1]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  </View>
);

export default AmbientBackground;
