import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";

type Props = {
  onUserPress?: () => void;
  onMenuPress?: () => void;
  showMenu?: boolean;
};

const Header = ({ onUserPress, onMenuPress, showMenu = true }: Props) => (
  <View style={styles.container}>
    {showMenu ? (
      <Pressable
        style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
        onPress={onMenuPress}
        accessibilityLabel="Open menu"
        hitSlop={8}
      >
        <Feather name="menu" size={20} color={palette.text} />
      </Pressable>
    ) : (
      <View style={styles.iconSpacer} />
    )}

    <View style={styles.titleWrap}>
      <Text style={styles.eyebrow}>Lineup Studio</Text>
      <Text style={styles.title}>COACHR</Text>
    </View>

    <Pressable
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
      onPress={onUserPress}
      accessibilityLabel="User menu"
      hitSlop={8}
    >
      <Feather name="user" size={20} color={palette.text} />
    </Pressable>
  </View>
);

export default memo(Header);

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.cardAlt,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  titleWrap: {
    alignItems: "center",
    gap: 1,
    flex: 1,
  },
  eyebrow: {
    color: palette.subtext,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 2.4,
    fontFamily: typeface.body,
  },
  title: {
    color: palette.text,
    fontSize: 24,
    letterSpacing: 2,
    fontFamily: typeface.display,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
  },
  iconSpacer: {
    width: 42,
    height: 42,
  },
});
