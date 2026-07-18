import { ReactNode, useEffect, useState } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { motion } from "../../theme/tokens";

type RevealProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Vertical rise distance in px. Pass 0 for an opacity-only fade. */
  rise?: number;
  duration?: number;
};

// One-shot entrance for content that arrives after a load: fade in with a
// slight rise, ease-out so the movement is front-loaded. Runs once on mount
// on the UI thread; collapses to an instant swap under Reduce Motion.
export const Reveal = ({
  children,
  style,
  rise = 6,
  duration = motion.slow,
}: RevealProps) => {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: reduceMotion ? 0 : duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, reduceMotion, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: reduceMotion ? 0 : (1 - progress.value) * rise },
    ],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
  );
};

type LoadTransitionProps = {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Loads faster than this never show a skeleton at all — a placeholder that
// exists for a frame or two reads as flicker, not feedback. During the grace
// window the skeleton renders invisibly so the region keeps its final size.
const SKELETON_GRACE_MS = 160;

// Skeleton-to-content swap. Shape the skeleton to match the content's layout
// so the swap never reflows; the fade only masks the repaint. The skeleton is
// removed instantly (exits should be snappier than arrivals).
export const LoadTransition = ({
  loading,
  skeleton,
  children,
  style,
}: LoadTransitionProps) => {
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), SKELETON_GRACE_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    if (!showSkeleton) {
      return <View style={[style, styles.holdingSpace]}>{skeleton}</View>;
    }
    return (
      <Reveal style={style} rise={0} duration={motion.fast}>
        {skeleton}
      </Reveal>
    );
  }
  return <Reveal style={style}>{children}</Reveal>;
};

const styles = StyleSheet.create({
  holdingSpace: {
    opacity: 0,
  },
});

export default Reveal;
