import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { useReducedMotion } from "./useReducedMotion";
import { PlaceValue } from "../lib/placeSearch";
import { parseCount } from "../utils/formNumbers";

type Field = "name" | "sport" | "place" | "size" | "rules";
type Values = {
  name: string;
  sport: string | null;
  place: PlaceValue | null;
  segments: string;
  players: string;
  rules: string;
};

export function useLeagueValidation(values: Values) {
  const reduceMotion = useReducedMotion();
  const [submitted, setSubmitted] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const fields = useRef<Partial<Record<Field, View | null>>>({});
  const errors: Partial<Record<Field, string>> = {};
  if (values.name.trim().length < 2)
    errors.name = "Enter a league name with at least 2 characters.";
  if (!values.sport) errors.sport = "Select a sport.";
  if (!values.place)
    errors.place =
      "City and ZIP code are required. Select a matching location from the results.";
  if (
    parseCount(values.segments) === null ||
    parseCount(values.players) === null
  )
    errors.size =
      "Enter innings or periods and players on field, each from 1 to 30.";
  if (values.rules.trim().length < 10)
    errors.rules = "Describe your league rules in at least 10 characters.";

  const validate = () => {
    setSubmitted(true);
    const first = (Object.keys(errors) as Field[])[0];
    if (!first) return true;
    // Measure after inline errors have rendered, relative to the scroll content.
    requestAnimationFrame(() => {
      const scroll = scrollRef.current;
      const field = fields.current[first];
      // RN 0.81 exposes this native ref but omits it from ScrollView's TS type.
      // Fabric measureLayout requires the ref itself, not getInnerViewNode's ID.
      const content = (scroll as (ScrollView & { getInnerViewRef(): View | null }) | null)?.getInnerViewRef();
      if (scroll && field && content)
        field.measureLayout(
          content,
          (_x, y) => {
            scroll.scrollTo({
              y: Math.max(0, y - 16),
              animated: !reduceMotion,
            });
          },
          () => {},
        );
    });
    return false;
  };
  return { scrollRef, fields, validate, errors: submitted ? errors : {} };
}
