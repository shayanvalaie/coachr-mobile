import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// True when the OS "Reduce Motion" setting is on. Animations should collapse
// to instant state changes (opacity-only at most) when this returns true.
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduced(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduced(enabled),
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
};
