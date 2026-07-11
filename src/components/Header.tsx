import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "../icons";
import { theme } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import { AppPressable, AppText } from "./ui";

type Props = {
  onUserPress?: () => void;
  onMenuPress?: () => void;
  onInfoPress?: () => void;
  showMenu?: boolean;
};

const Header = ({ onUserPress, onMenuPress, onInfoPress, showMenu = true }: Props) => (
  <View style={styles.container}>
    {showMenu ? (
      <AppPressable
        style={styles.iconButton}
        onPress={onMenuPress}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        hitSlop={8}
      >
        <Feather name="menu" size={20} color={theme.text.primary} />
      </AppPressable>
    ) : (
      <View style={styles.iconSpacer} />
    )}

    <View style={styles.titleWrap}>
      <AppText variant="caption" color="secondary" style={styles.eyebrow}>
        Lineup Studio
      </AppText>
      <AppText variant="display" family="display" style={styles.title}>
        COACHR
      </AppText>
    </View>

    <View style={styles.rightGroup}>
      {onInfoPress ? (
        <AppPressable
          style={styles.iconButton}
          onPress={onInfoPress}
          accessibilityRole="button"
          accessibilityLabel="Replay app tour"
          hitSlop={8}
        >
          <Feather name="info" size={20} color={theme.text.primary} />
        </AppPressable>
      ) : null}

      <AppPressable
        style={styles.iconButton}
        onPress={onUserPress}
        accessibilityRole="button"
        accessibilityLabel="User menu"
        hitSlop={8}
      >
        <Feather name="user" size={20} color={theme.text.primary} />
      </AppPressable>
    </View>
  </View>
);

export default memo(Header);

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.bg.elevated,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: theme.border.base,
  },
  titleWrap: {
    alignItems: "center",
    gap: 1,
    flex: 1,
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 2.4,
  },
  title: {
    letterSpacing: 2,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: theme.bg.raised,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border.base,
  },
  iconSpacer: {
    width: 42,
    height: 42,
  },
});
