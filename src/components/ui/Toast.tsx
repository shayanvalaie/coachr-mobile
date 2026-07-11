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
import { StyleSheet, View } from "react-native";
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

const colorByType: Record<ToastType, string> = {
  info: theme.text.secondary,
  success: theme.success.base,
  error: theme.danger.base,
};

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

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: reduceMotion ? 0 : (1 - progress.value) * -12 },
      { scale: reduceMotion ? 1 : 0.97 + progress.value * 0.03 },
    ],
  }));

  return (
    <ToastContext.Provider value={value}>
      {children}
      {active ? (
        <View
          pointerEvents="none"
          style={[styles.host, { top: insets.top + space.xs }]}
        >
          <Animated.View style={[styles.toast, animatedStyle]}>
            <Feather
              name={iconByType[active.type ?? "info"]}
              size={16}
              color={colorByType[active.type ?? "info"]}
            />
            <AppText variant="body" family="heading" style={styles.message}>
              {active.message}
            </AppText>
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
    gap: space.xs,
    backgroundColor: theme.bg.elevated,
    borderWidth: 1,
    borderColor: theme.border.strong,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    maxWidth: 480,
    ...shadow.float,
  },
  message: {
    flexShrink: 1,
  },
});
