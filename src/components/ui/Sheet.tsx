import { ReactNode, useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { theme } from "../../theme/colors";
import { motion, radius, space } from "../../theme/tokens";
import AppText from "./AppText";

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  // Set on sheets that contain text inputs so the card rises above the
  // keyboard instead of being covered by it.
  keyboard?: boolean;
  children: ReactNode;
};

// Slide-up sheet on a fading backdrop. Enter is ease-out over motion.slow,
// exit is faster (motion.fast) - releases should always feel snappier than
// arrivals. Collapses to a plain fade under Reduce Motion.
const Sheet = ({ visible, onClose, title, keyboard = false, children }: Props) => {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: reduceMotion ? 0 : motion.slow,
        easing: Easing.out(Easing.cubic),
      });
    } else if (mounted) {
      progress.value = withTiming(
        0,
        {
          duration: reduceMotion ? 0 : motion.fast,
          easing: Easing.in(Easing.quad),
        },
        (finished) => {
          if (finished) runOnJS(unmount)();
        },
      );
    }
  }, [visible, mounted, progress, reduceMotion, unmount]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: reduceMotion ? 0 : (1 - progress.value) * 48 },
    ],
  }));

  if (!mounted) return null;

  const Wrapper = keyboard ? KeyboardAvoidingView : View;

  return (
    <Modal transparent visible statusBarTranslucent onRequestClose={onClose}>
      {/* Modals host a new native window on Android; gesture-handler based
          interactions inside (e.g. lineup row dragging) need their own root. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
      <Wrapper
        style={styles.root}
        {...(keyboard
          ? { behavior: Platform.OS === "ios" ? ("padding" as const) : undefined }
          : {})}
      >
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.card,
            { paddingBottom: Math.max(insets.bottom, space.md) },
            cardStyle,
          ]}
        >
          <View style={styles.grabber} />
          {title ? (
            <AppText variant="title" family="display" style={styles.title}>
              {title}
            </AppText>
          ) : null}
          {children}
        </Animated.View>
      </Wrapper>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.bg.overlay,
  },
  card: {
    backgroundColor: theme.bg.raised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.border.base,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.sm,
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: theme.border.strong,
  },
  title: {
    marginTop: space.xxs,
  },
});

export default Sheet;
