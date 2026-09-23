import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Feather } from "../../icons";
import { theme } from "../../theme/colors";
import { motion, radius, space } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import AppText from "./AppText";
import Input from "./Input";
import { ListGroup, ListRow } from "./ListGroup";
import Sheet from "./Sheet";

export type PickerOption = { code: string; name: string };

type Props = {
  label: string;
  placeholder: string;
  options: ReadonlyArray<PickerOption>;
  value: string | null;
  onChange: (code: string) => void;
  error?: string | null;
  // Which side of the option the closed field shows. Codes fit narrow fields
  // (state beside city); names read better on their own (sport).
  display?: "code" | "name";
  // Adds a filter box above long lists.
  searchable?: boolean;
};

// Input-styled field that opens a sheet of options. One row per option, the
// selected one ticked; picking closes the sheet.
const OptionPicker = ({
  label,
  placeholder,
  options,
  value,
  onChange,
  error,
  display = "name",
  searchable = false,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.code === value) ?? null;
  // A stored value outside the list (older data) still shows rather than reading as unset.
  const shown = selected ? selected[display] : value;

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (option) =>
        option.code.toLowerCase().startsWith(term) || option.name.toLowerCase().includes(term),
    );
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const select = (code: string) => {
    onChange(code);
    close();
  };

  return (
    <View style={styles.container}>
      <AppText variant="caption" family="heading" color="secondary">
        {label}
      </AppText>
      <AppPressable
        onPress={() => setOpen(true)}
        pressScale={motion.pressScale}
        style={[styles.field, open && styles.fieldFocused, !!error && styles.fieldError]}
        accessibilityRole="button"
        accessibilityLabel={shown ? `${label}, ${shown}` : `${label}, not set`}
        accessibilityHint={`Opens a list of ${label.toLowerCase()} options`}
      >
        <AppText variant="bodyLg" color={shown ? "primary" : "muted"} numberOfLines={1}>
          {shown ?? placeholder}
        </AppText>
        <Feather name="chevron-down" size={16} color={theme.text.muted} />
      </AppPressable>
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <Sheet visible={open} onClose={close} title={label} keyboard={searchable}>
        {searchable ? (
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${label.toLowerCase()}s`}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            left={<Feather name="search" size={16} color={theme.accent.base} />}
            accessibilityLabel={`Search ${label.toLowerCase()}s`}
          />
        ) : null}
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {matches.length > 0 ? (
            <ListGroup>
              {matches.map((option) => (
                <ListRow
                  key={option.code}
                  title={option.name}
                  value={display === "code" ? option.code : undefined}
                  chevron={false}
                  right={
                    option.code === value ? (
                      <Feather name="check" size={16} color={theme.accent.base} />
                    ) : undefined
                  }
                  onPress={() => select(option.code)}
                  accessibilityLabel={option.name}
                />
              ))}
            </ListGroup>
          ) : (
            <AppText variant="caption" color="secondary" style={styles.empty}>
              Nothing matches "{query.trim()}".
            </AppText>
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xxs,
    backgroundColor: theme.bg.recessed,
    borderWidth: 1,
    borderColor: theme.border.glass,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    minHeight: 46,
  },
  fieldFocused: {
    borderColor: theme.accent.subtleBorder,
  },
  fieldError: {
    borderColor: theme.danger.subtleBorder,
  },
  list: {
    flexShrink: 1,
  },
  empty: {
    paddingVertical: space.sm,
  },
});

export default OptionPicker;
