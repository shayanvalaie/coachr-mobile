import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

// One process-wide subscription to the OS "Reduce Motion" setting. The hook is
// used by every pressable, so a per-mount native query and listener would run
// dozens of times per screen.
let reduceMotionEnabled = false;
let started = false;
const listeners = new Set<() => void>();

const update = (enabled: boolean) => {
  if (enabled === reduceMotionEnabled) return;
  reduceMotionEnabled = enabled;
  listeners.forEach((listener) => listener());
};

const start = () => {
  started = true;
  AccessibilityInfo.isReduceMotionEnabled().then(update);
  AccessibilityInfo.addEventListener("reduceMotionChanged", update);
};

const subscribe = (listener: () => void) => {
  if (!started) start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => reduceMotionEnabled;

// True when the OS "Reduce Motion" setting is on. Animations should collapse
// to instant state changes (opacity-only at most) when this returns true.
export const useReducedMotion = (): boolean => useSyncExternalStore(subscribe, getSnapshot);
