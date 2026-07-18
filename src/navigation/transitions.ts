import { Animated, Easing } from "react-native";
import type {
  BottomTabNavigationOptions,
  BottomTabScreenProps,
} from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

// Shared screen-transition config so every navigator (tabs + native stacks)
// animates with the same cross-fade language. All values respect the OS
// "Reduce Motion" setting via the `reducedMotion` flag the callers pass in.

const DURATION = 220;
// Reduce Motion keeps the fade (opacity-only is fine) but makes it quicker.
const REDUCED_DURATION = 120;
// Native stacks can't run the JS interpolator, so they use a plain fade at
// this (slightly quicker) duration to match the "slight fade" feel.
const STACK_FADE_DURATION = 200;

type SceneInterpolator = NonNullable<
  BottomTabNavigationOptions["sceneStyleInterpolator"]
>;

const timingSpec = (
  reducedMotion: boolean,
): BottomTabNavigationOptions["transitionSpec"] => ({
  animation: "timing",
  config: {
    duration: reducedMotion ? REDUCED_DURATION : DURATION,
    easing: Easing.out(Easing.cubic),
  },
});

// Pure cross-fade — the outgoing scene fades out while the incoming one fades
// in, no positional movement. `progress` is a classic Animated.Value in the
// range [-1, 0, 1] (0 = focused/centered).
const forFadeOnly: SceneInterpolator = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({
      inputRange: [-1, 0, 1],
      outputRange: [0, 1, 0],
    }),
  },
});

// Options for the bottom-tab navigator.
export const tabTransitionOptions = (
  reducedMotion: boolean,
): Pick<
  BottomTabNavigationOptions,
  "animation" | "transitionSpec" | "sceneStyleInterpolator"
> => ({
  // Must NOT be "none": bottom-tabs treats `animation: "none"` as "transitions
  // disabled" and ignores a custom sceneStyleInterpolator entirely. Any named
  // preset enables transitions; our spec + interpolator below override it.
  animation: "fade",
  transitionSpec: timingSpec(reducedMotion),
  sceneStyleInterpolator: forFadeOnly,
});

// Options for native-stack navigators (Home stack, root stack). A slight
// cross-fade — the outgoing screen fades out while the incoming one fades in.
export const stackTransitionOptions = (
  reducedMotion: boolean,
): Pick<NativeStackNavigationOptions, "animation" | "animationDuration"> => ({
  animation: "fade",
  animationDuration: reducedMotion ? REDUCED_DURATION : STACK_FADE_DURATION,
});

// Re-exported so option callbacks elsewhere stay typed without extra imports.
export type { BottomTabScreenProps };
