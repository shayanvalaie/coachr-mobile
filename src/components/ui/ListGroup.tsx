import { Children, Fragment, ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Feather, IconName } from "../../icons";
import { theme } from "../../theme/colors";
import { motion, space } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import AppText from "./AppText";
import Card from "./Card";

type GroupProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// One raised card holding several rows separated by hairlines - the
// "grouped list" that replaces stacks of individual cards.
export const ListGroup = ({ children, style }: GroupProps) => {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <Card padding="none" style={style}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={styles.divider} /> : null}
          {row}
        </Fragment>
      ))}
    </Card>
  );
};

type RowProps = {
  title: string;
  subtitle?: string;
  // Right-aligned secondary text (e.g. the league name on "Team rules").
  value?: string;
  icon?: IconName;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  danger?: boolean;
  busy?: boolean;
  chevron?: boolean;
  accessibilityLabel?: string;
};

export const ListRow = ({
  title,
  subtitle,
  value,
  icon,
  left,
  right,
  onPress,
  onLongPress,
  danger = false,
  busy = false,
  chevron = !!onPress,
  accessibilityLabel,
}: RowProps) => {
  const content = (
    <View style={styles.row}>
      {icon ? (
        <Feather
          name={icon}
          size={16}
          color={danger ? theme.danger.base : theme.text.secondary}
        />
      ) : null}
      {left}
      <View style={styles.text}>
        <AppText
          variant="bodyLg"
          family="heading"
          color={danger ? "danger" : "primary"}
          numberOfLines={1}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="secondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {right}
      {chevron ? (
        <Feather
          name="chevron-right"
          size={18}
          color={danger ? theme.danger.base : theme.text.muted}
        />
      ) : null}
    </View>
  );

  if (!onPress && !onLongPress) return content;

  return (
    <AppPressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 350 : undefined}
      disabled={busy}
      pressScale={motion.pressScale}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      accessibilityState={{ disabled: busy, busy }}
    >
      {content}
    </AppPressable>
  );
};

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: theme.border.subtle,
    marginHorizontal: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    minHeight: 56,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  value: {
    maxWidth: "40%",
  },
});
