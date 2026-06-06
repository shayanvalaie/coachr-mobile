import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";

const TOUR_KEY = "coachr_onboarding_tour_v1";
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const HIGHLIGHT_PAD = 10;
const ARROW_SIZE = 10;
const CARD_GAP = 8;

export type TourStep = {
  ref: React.RefObject<View | null>;
  title: string;
  description: string;
};

type Rect = { x: number; y: number; width: number; height: number };

type CardProps = {
  title: string;
  description: string;
  stepIndex: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
  onSkip: () => void;
};

const TourCard = ({
  title,
  description,
  stepIndex,
  total,
  isLast,
  onNext,
  onSkip,
}: CardProps) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.stepPill}>
        <Text style={styles.stepPillText}>
          {stepIndex + 1} / {total}
        </Text>
      </View>
    </View>
    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.cardDesc}>{description}</Text>
    <View style={styles.cardActions}>
      <Pressable
        style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}
        onPress={onSkip}
      >
        <Text style={styles.skipText}>Skip tour</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.9 }]}
        onPress={onNext}
      >
        <Text style={styles.nextText}>{isLast ? "Done" : "Next →"}</Text>
      </Pressable>
    </View>
  </View>
);

type Props = {
  steps: TourStep[];
  onDone: () => void;
};

const FirstTimeTour = ({ steps, onDone }: Props) => {
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rects, setRects] = useState<Rect[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(TOUR_KEY).then((val) => {
      if (!val) setVisible(true);
    });
  }, []);

  const measureAll = useCallback(() => {
    const measured: (Rect | null)[] = new Array(steps.length).fill(null);
    let remaining = steps.length;

    steps.forEach((step, i) => {
      step.ref.current?.measureInWindow((x, y, width, height) => {
        measured[i] = { x, y, width, height };
        remaining--;
        if (remaining === 0 && measured.every(Boolean)) {
          setRects(measured as Rect[]);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }
      });
    });
  }, [steps, fadeAnim]);

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(measureAll, 150);
    return () => clearTimeout(id);
  }, [visible, measureAll]);

  // Re-measure on step change so positions stay accurate
  useEffect(() => {
    if (!visible || rects.length < steps.length) return;
    setTimeout(measureAll, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const dismiss = useCallback(() => {
    AsyncStorage.setItem(TOUR_KEY, "done");
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      onDone();
    });
  }, [fadeAnim, onDone]);

  const handleNext = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      dismiss();
    }
  }, [stepIndex, steps.length, dismiss]);

  if (!visible || rects.length < steps.length) return null;

  const rect = rects[stepIndex];
  if (!rect || rect.width === 0) return null;

  const hx = rect.x - HIGHLIGHT_PAD;
  const hy = rect.y - HIGHLIGHT_PAD;
  const hw = rect.width + HIGHLIGHT_PAD * 2;
  const hh = rect.height + HIGHLIGHT_PAD * 2;
  const cx = hx + hw / 2; // horizontal center of highlight

  // Put tooltip below if element sits in top 55% of screen
  const tooltipBelow = hy + hh < SCREEN_H * 0.55;
  const isLast = stepIndex === steps.length - 1;

  return (
    <Modal
      transparent
      animationType="none"
      visible
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
        {/* ── Spotlight strips ── */}
        <View style={[styles.strip, { top: 0, left: 0, right: 0, height: Math.max(0, hy) }]} />
        <View style={[styles.strip, { top: hy + hh, left: 0, right: 0, bottom: 0 }]} />
        <View style={[styles.strip, { top: hy, left: 0, width: Math.max(0, hx), height: hh }]} />
        <View style={[styles.strip, { top: hy, left: hx + hw, right: 0, height: hh }]} />

        {/* ── Highlight ring ── */}
        <View style={[styles.highlight, { top: hy, left: hx, width: hw, height: hh }]} />

        {/* ── Tooltip below ── */}
        {tooltipBelow && (
          <>
            {/* Arrow pointing up */}
            <View
              style={[
                styles.arrowUp,
                {
                  top: hy + hh + CARD_GAP,
                  left: Math.min(
                    Math.max(cx - ARROW_SIZE, 16),
                    SCREEN_W - 16 - ARROW_SIZE * 2,
                  ),
                },
              ]}
            />
            <View style={[styles.cardWrap, { top: hy + hh + CARD_GAP + ARROW_SIZE }]}>
              <TourCard
                title={steps[stepIndex].title}
                description={steps[stepIndex].description}
                stepIndex={stepIndex}
                total={steps.length}
                isLast={isLast}
                onNext={handleNext}
                onSkip={dismiss}
              />
            </View>
          </>
        )}

        {/* ── Tooltip above ── */}
        {!tooltipBelow && (
          <>
            <View style={[styles.cardWrap, { bottom: SCREEN_H - hy + CARD_GAP + ARROW_SIZE }]}>
              <TourCard
                title={steps[stepIndex].title}
                description={steps[stepIndex].description}
                stepIndex={stepIndex}
                total={steps.length}
                isLast={isLast}
                onNext={handleNext}
                onSkip={dismiss}
              />
            </View>
            {/* Arrow pointing down */}
            <View
              style={[
                styles.arrowDown,
                {
                  top: hy - CARD_GAP - ARROW_SIZE,
                  left: Math.min(
                    Math.max(cx - ARROW_SIZE, 16),
                    SCREEN_W - 16 - ARROW_SIZE * 2,
                  ),
                },
              ]}
            />
          </>
        )}
      </Animated.View>
    </Modal>
  );
};

export default FirstTimeTour;

const CARD_BG = "#1c2820";

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  strip: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  highlight: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: palette.accent,
    // subtle glow
    shadowColor: palette.accent,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  arrowUp: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderLeftColor: "transparent",
    borderRightWidth: ARROW_SIZE,
    borderRightColor: "transparent",
    borderBottomWidth: ARROW_SIZE,
    borderBottomColor: CARD_BG,
  },
  arrowDown: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderLeftColor: "transparent",
    borderRightWidth: ARROW_SIZE,
    borderRightColor: "transparent",
    borderTopWidth: ARROW_SIZE,
    borderTopColor: CARD_BG,
  },
  cardWrap: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.3)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(242,166,59,0.15)",
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.4)",
  },
  stepPillText: {
    color: palette.accent,
    fontFamily: typeface.heading,
    fontSize: 11,
  },
  cardTitle: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 18,
  },
  cardDesc: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 13,
    lineHeight: 19,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 13,
  },
  nextBtn: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.7)",
  },
  nextText: {
    color: palette.accentText,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
});
