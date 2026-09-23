import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, IconName } from "../../icons";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { notifyError, notifySuccess } from "../../lib/haptics";
import { theme } from "../../theme/colors";
import { motion, radius, shadow, space } from "../../theme/tokens";
import AppText from "./AppText";

type ToastType = "info" | "success" | "error";

type ToastOptions = {
  message: string;
  type?: ToastType;
  durationMs?: number;
  // When set, the toast becomes tappable: `actionLabel` shows as a hint under
  // the message and `onPress` fires (then the toast dismisses) when tapped.
  actionLabel?: string;
  onPress?: () => void;
};

type ToastContextValue = {
  show: (options: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Transient feedback only: saves, load failures, confirmations. Keep
// Alert.alert for destructive confirms and inline Input errors for validation.
export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
};

const iconByType: Record<ToastType, IconName> = {
  info: "info",
  success: "check-circle",
  error: "alert-circle",
};

// The toast is a cream pill with dark text, so the type tints are the deep
// versions of the palette colours - legible on light, still recognisable.
const iconColorByType: Record<ToastType, string> = {
  info: "#a8641a",
  success: "#2f7a4f",
  error: "#c8412f",
};

const TOAST_SURFACE = "rgba(246, 241, 231, 0.9)";
const TOAST_TEXT = theme.text.onAccent;
// Clears the floating tab bar with room to spare.
const TOAST_BOTTOM_OFFSET = 110;

type ActiveToast = ToastOptions & { id: number };

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState<ActiveToast | null>(null);
  const queue = useRef<ActiveToast[]>([]);
  const counter = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(0);

  const dismiss = useCallback(() => {
    setActive(null);
  }, []);

  const handlePress = useCallback(() => {
    if (!active?.onPress) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    active.onPress();
    dismiss();
  }, [active, dismiss]);

  const runNext = useCallback(() => {
    const next = queue.current.shift();
    if (next) setActive(next);
  }, []);

  useEffect(() => {
    if (!active) {
      runNext();
      return;
    }

    if (active.type === "success") notifySuccess();
    if (active.type === "error") notifyError();

    progress.value = withTiming(1, {
      duration: reduceMotion ? 0 : motion.base,
      easing: Easing.out(Easing.cubic),
    });

    hideTimer.current = setTimeout(() => {
      progress.value = withTiming(
        0,
        {
          duration: reduceMotion ? 0 : motion.fast,
          easing: Easing.in(Easing.quad),
        },
        (finished) => {
          if (finished) runOnJS(dismiss)();
        },
      );
    }, active.durationMs ?? 2600);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [active, dismiss, progress, reduceMotion, runNext]);

  const show = useCallback((options: ToastOptions) => {
    counter.current += 1;
    const toast: ActiveToast = { type: "info", ...options, id: counter.current };
    setActive((current) => {
      if (current) {
        queue.current.push(toast);
        return current;
      }
      return toast;
    });
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  // Rises from the bottom edge and settles above the tab bar.
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: reduceMotion ? 0 : (1 - progress.value) * 12 },
      { scale: reduceMotion ? 1 : 0.97 + progress.value * 0.03 },
    ],
  }));

  return (
    <ToastContext.Provider value={value}>
      {children}
      {active ? (
        <View
          pointerEvents="box-none"
          style={[styles.host, { bottom: insets.bottom + TOAST_BOTTOM_OFFSET }]}
        >
          <Animated.View
            pointerEvents={active.onPress ? "auto" : "none"}
            style={animatedStyle}
          >
            <Pressable
              disabled={!active.onPress}
              onPress={handlePress}
              accessibilityRole={active.onPress ? "button" : undefined}
              accessibilityLabel={
                active.onPress
                  ? `${active.message}. ${active.actionLabel ?? "Tap to open."}`
                  : undefined
              }
              style={({ pressed }) => [
                styles.toast,
                { borderRadius: active.actionLabel ? radius.lg : radius.pill },
                pressed && active.onPress && styles.toastPressed,
              ]}
            >
              <Feather
                name={iconByType[active.type ?? "info"]}
                size={18}
                color={iconColorByType[active.type ?? "info"]}
              />
              <View style={styles.messageColumn}>
                <AppText variant="body" family="heading" style={styles.message}>
                  {active.message}
                </AppText>
                {active.actionLabel ? (
                  <AppText variant="caption" style={styles.actionLabel}>
                    {active.actionLabel}
                  </AppText>
                ) : null}
              </View>
              {active.onPress ? (
                <Feather name="chevron-right" size={18} color={TOAST_TEXT} />
              ) : null}
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: space.md,
    right: space.md,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: TOAST_SURFACE,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    maxWidth: 480,
    ...shadow.glass,
  },
  toastPressed: {
    opacity: 0.9,
  },
  messageColumn: {
    flexShrink: 1,
    gap: 2,
  },
  message: {
    flexShrink: 1,
    color: TOAST_TEXT,
  },
  actionLabel: {
    color: "rgba(28, 18, 5, 0.7)",
  },
});
