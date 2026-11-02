import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppText, Button } from "../ui";
import { DeclaredAgeBand } from "../../lib/privacy/contracts";
import { usePrivacy } from "./PrivacyProvider";
import { AgeEligibility } from "./AgeEligibility";
import { space } from "../../theme/tokens";

export function PrivacyAgeChoice() {
  const { state, busy, controller } = usePrivacy();
  const [choice, setChoice] = useState<DeclaredAgeBand | null>(null);
  useEffect(() => { setChoice(state && state.ageBand !== "unknown" ? state.ageBand : null); }, [state?.ageBand]);
  return <View style={{ gap: space.md }}>
    <AgeEligibility value={choice} onChange={setChoice} disabled={busy} />
    {state?.ageBand === "under13" ? <AppText color="secondary">This account is restricted. Use Profile to contact support or delete the account and its private data. Correct this choice only if it was entered in error.</AppText> : null}
    <Button label="Save age group" variant="secondary" disabled={choice === null || busy} loading={busy}
      onPress={() => { if (choice) void controller.setAgeEligibility(choice); }} />
  </View>;
}
