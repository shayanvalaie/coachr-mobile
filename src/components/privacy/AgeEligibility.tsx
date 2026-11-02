import { View } from "react-native";
import { AppPressable, AppText } from "../ui";
import { DeclaredAgeBand } from "../../lib/privacy/contracts";
import { space } from "../../theme/tokens";
import { theme } from "../../theme/colors";

type Props = { value: DeclaredAgeBand | null; onChange: (value: DeclaredAgeBand) => void; disabled?: boolean };
const choices: Array<{ value: DeclaredAgeBand; label: string }> = [
  { value: "under13", label: "Under 13" },
  { value: "teen13to17", label: "13–17" },
  { value: "adult18plus", label: "18 or older" },
];
export function AgeEligibility({ value, onChange, disabled = false }: Props) {
  return <View style={{ gap: space.sm }}>
    <AppText family="heading">Your age group</AppText>
    <AppText variant="caption" color="secondary">Choose your age group. We store this group, not your date of birth.</AppText>
    <View accessibilityRole="radiogroup" accessibilityLabel="Your age group" style={{ gap: space.xs }}>
      {choices.map(choice => <AppPressable key={choice.value} onPress={() => onChange(choice.value)} disabled={disabled}
        accessibilityRole="radio" accessibilityState={{ checked: value === choice.value, disabled }}
        accessibilityLabel={choice.label} style={{ minHeight: 48, padding: space.md, borderWidth: 1,
          borderColor: value === choice.value ? theme.accent.base : theme.border.subtle, borderRadius: 12 }}>
        <AppText>{choice.label}</AppText>
      </AppPressable>)}
    </View>
    {value === "under13" ? <AppText variant="caption" color="secondary">Coachr accounts are available from age 13. If you already have an account, you can contact support or delete it from Profile.</AppText> : null}
  </View>;
}
