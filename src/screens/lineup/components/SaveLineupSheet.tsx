import { RefObject } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { AppText, Button, Input, Sheet } from "../../../components/ui";
import { theme } from "../../../theme/colors";
import { radius, space } from "../../../theme/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  name: string;
  onChangeName: (name: string) => void;
  isSaving: boolean;
  isManualEditSave: boolean;
  error: string | null;
  duplicateNotice: boolean;
  onViewDuplicate: () => void;
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
  duplicateNotice,
  onViewDuplicate,
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
      {duplicateNotice ? (
        <View style={styles.duplicateNotice}>
          <AppText variant="body">
            This lineup has already been saved for this game.
          </AppText>
          <Button
            label="View saved lineup"
            variant="secondary"
            size="sm"
            onPress={onViewDuplicate}
            accessibilityLabel="View saved lineup"
          />
        </View>
      ) : null}
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
          disabled={duplicateNotice}
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
  duplicateNotice: {
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.accent.subtle,
    alignItems: "flex-start",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.xs,
  },
});

export default SaveLineupSheet;
