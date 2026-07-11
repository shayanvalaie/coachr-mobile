import * as Haptics from "expo-haptics";

// Central haptics vocabulary. Route all haptic calls through here so intensity
// stays consistent: light tap for primary actions and toggles, notifications
// for outcomes. Never fire haptics per keystroke or per drag-move.

const silently = (run: () => Promise<unknown>) => {
  run().catch(() => {
    // Haptics are best-effort; never surface failures.
  });
};

export const tapLight = () =>
  silently(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

export const tapMedium = () =>
  silently(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

export const notifySuccess = () =>
  silently(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );

export const notifyError = () =>
  silently(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  );
