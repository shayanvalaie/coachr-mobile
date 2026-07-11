import { RefObject } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { AppText, Button, Input, Sheet } from "../../../components/ui";
import { space } from "../../../theme/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  name: string;
  onChangeName: (name: string) => void;
  isSaving: boolean;
  isManualEditSave: boolean;
  error: string | null;
  inputRef: RefObject<TextInput | null>;
  onSave: () => void;
};

// Name-and-save sheet for storing the current lineup as a history version.
const SaveLineupSheet = ({
  visible,
  onClose,
  name,
  onChangeName,
  isSaving,
  isManualEditSave,
  error,
  inputRef,
  onSave,
}: Props) => (
  <Sheet visible={visible} onClose={onClose} title="Save lineup" keyboard>
    <View style={styles.body}>
      <AppText variant="body" color="secondary">
        {isManualEditSave
          ? "This will save as a new edited version in lineup history."
          : "Name this lineup to store it in lineup history."}
      </AppText>
      <Input
        ref={inputRef}
        label="Lineup name"
        value={name}
        onChangeText={onChangeName}
        placeholder="e.g. Playoff Plan A"
        autoCapitalize="words"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onSave}
        error={error}
        accessibilityLabel="Lineup name"
      />
      <View style={styles.actions}>
        <Button
          label="Cancel"
          variant="secondary"
          onPress={onClose}
          disabled={isSaving}
        />
        <Button
          label="Save lineup"
          onPress={onSave}
          loading={isSaving}
          accessibilityLabel="Save lineup"
        />
      </View>
    </View>
  </Sheet>
);

const styles = StyleSheet.create({
  body: {
    gap: space.sm,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.xs,
  },
});

export default SaveLineupSheet;
