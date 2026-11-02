import { View } from "react-native";
import { AppPressable, AppText } from "../ui";
import { PUBLICATION_CONFIRMATION } from "../../lib/moderation/contracts";
import { space } from "../../theme/tokens";
export function PublicationConfirmation({ confirmed, onChange, disabled = false }: { confirmed: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <View style={{ gap: space.sm }}>
    <AppText color="secondary">{PUBLICATION_CONFIRMATION}</AppText>
    <AppPressable onPress={() => onChange(!confirmed)} disabled={disabled} accessibilityRole="checkbox"
      accessibilityState={{ checked: confirmed, disabled }} accessibilityLabel="Submit these fields for public review"
      style={{ minHeight: 48, justifyContent: "center", paddingVertical: space.sm }}>
      <AppText>{confirmed ? "✓ " : "○ "}Submit these fields for public review</AppText>
    </AppPressable>
  </View>;
}
