import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { space } from "../theme/tokens";
import AppText from "./ui/AppText";
import Button from "./ui/Button";

type Props = {
  retryAt: number;
  onRetry?: () => void;
};

export const retryWaitSeconds = (retryAt: number, now: number): number => {
  if (!Number.isFinite(retryAt) || !Number.isFinite(now)) throw new Error("Invalid retry deadline");
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
};

const RateLimitNotice = ({ retryAt, onRetry }: Props) => {
  const [now, setNow] = useState(() => Date.now());
  const waitSeconds = retryWaitSeconds(retryAt, now);
  useEffect(() => {
    setNow(Date.now());
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  return (
    <View style={styles.notice}>
      <AppText color="secondary" accessibilityLiveRegion="polite">
        {waitSeconds > 0
          ? `Too many requests. You can try again in ${waitSeconds} ${waitSeconds === 1 ? "second" : "seconds"}.`
          : "You can try again now."}
      </AppText>
      {onRetry ? <Button label="Try again" variant="secondary" disabled={waitSeconds > 0} onPress={onRetry} /> : null}
    </View>
  );
};

export default RateLimitNotice;

const styles = StyleSheet.create({ notice: { gap: space.sm } });
