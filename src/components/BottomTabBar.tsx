import React, { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, IconName } from "../icons";
import { theme } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import AppPressable from "./ui/AppPressable";
import AppText from "./ui/AppText";
import GlassSurface from "./ui/GlassSurface";

export type MainTabKey = "home" | "roster" | "lineup" | "calendar" | "profile";

type Props = {
  activeTab: MainTabKey;
  onSelectTab: (tab: MainTabKey) => void;
};

const tabs: Array<{ key: MainTabKey; label: string; icon: IconName }> = [
  { key: "home", label: "Home", icon: "home" },
  { key: "roster", label: "Roster", icon: "users" },
  { key: "lineup", label: "Lineup", icon: "target" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "profile", label: "Profile", icon: "user" },
];

const STATE_TRANSITION_MS = 200;
const TRANSPARENT_ACCENT = "rgba(242, 166, 59, 0)";

const TabItem = ({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
}) => {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: STATE_TRANSITION_MS });
  }, [active, progress]);

  const surfaceStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [TRANSPARENT_ACCENT, theme.accent.subtle],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [TRANSPARENT_ACCENT, theme.accent.subtleBorder],
    ),
  }));

  return (
    <AppPressable
      style={styles.tabButton}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      pressScale={0.97}
    >
      <Animated.View style={[styles.tabSurface, surfaceStyle]}>
        <Feather
          name={icon}
          size={18}
          color={active ? theme.accent.base : theme.text.secondary}
        />
        <AppText
          variant="caption"
          family="heading"
          color={active ? "accent" : "secondary"}
          style={styles.tabLabel}
        >
          {label}
        </AppText>
      </Animated.View>
    </AppPressable>
  );
};

// Floating glass pill. Absolutely positioned so content scrolls beneath it;
// every scroll view pads its bottom by TAB_BAR_CLEARANCE to compensate.
const BottomTabBar = ({ activeTab, onSelectTab }: Props) => {
  const insets = useSafeAreaInsets();
  // The app-level SafeAreaView already clears the home indicator, so only a
  // small gap is needed on notched devices; older devices get more air.
  const paddingBottom = insets.bottom > 0 ? space.xs : space.md;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom }]}>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(15, 31, 24, 0)", "rgba(15, 31, 24, 0.85)", "rgba(15, 31, 24, 0.85)"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <GlassSurface strong radius={radius.tab} contentStyle={styles.pill}>
        {tabs.map((tab) => (
          <TabItem
            key={tab.key}
            label={tab.label}
            icon={tab.icon}
            active={tab.key === activeTab}
            onPress={() => onSelectTab(tab.key)}
          />
        ))}
      </GlassSurface>
    </View>
  );
};

export default memo(BottomTabBar);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.xs,
    paddingHorizontal: space.sm + 2,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.xxs,
    gap: 2,
  },
  tabButton: {
    flex: 1,
  },
  tabSurface: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
  },
});
