import { ReactNode, useCallback } from "react";
import {
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { tapLight } from "../../lib/haptics";
import { motion } from "../../theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style"> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  // Scale applied while pressed. Pass 1 to disable (e.g. list rows).
  pressScale?: number;
  haptic?: boolean;
};

// The one pressable for the app: consistent scale-down press feedback
// (ease-out in, snappy release), optional light haptic, static under
// Reduce Motion. Compose all buttons, chips, tiles, and rows from this.
const AppPressable = ({
  children,
  style,
  pressScale = motion.pressScale,
  haptic = false,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: Props) => {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (!reduceMotion && pressScale !== 1) {
        scale.value = withTiming(pressScale, {
          duration: motion.fast,
          easing: Easing.out(Easing.quad),
        });
      }
      onPressIn?.(event);
    },
    [onPressIn, pressScale, reduceMotion, scale],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      if (!reduceMotion && pressScale !== 1) {
        scale.value = withTiming(1, {
          duration: motion.base,
          easing: Easing.out(Easing.quad),
        });
      }
      onPressOut?.(event);
    },
    [onPressOut, pressScale, reduceMotion, scale],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (haptic) tapLight();
      onPress?.(event);
    },
    [haptic, onPress],
  );

  return (
    <AnimatedPressable
      {...rest}
      style={[animatedStyle, style]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
    >
      {children}
    </AnimatedPressable>
  );
};

export default AppPressable;
