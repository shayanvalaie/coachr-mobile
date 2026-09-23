import { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { theme } from "../../theme/colors";
import { space, TAB_BAR_CLEARANCE } from "../../theme/tokens";
import AmbientBackground from "./AmbientBackground";

type Props = {
  children: ReactNode;
  // Wrap content in a ScrollView. Leave false when the screen's root is a
  // FlatList (the list owns scrolling).
  scroll?: boolean;
  // Wrap in KeyboardAvoidingView. Use on any screen with text inputs.
  keyboard?: boolean;
  padded?: boolean;
  // Scroll content ends under the floating tab bar by default; screens
  // without a tab bar (sign-in, paywall) opt out.
  floatingTabBar?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

const ScreenContainer = ({
  children,
  scroll = false,
  keyboard = false,
  padded = true,
  floatingTabBar = true,
  refreshing,
  onRefresh,
  style,
  contentStyle,
}: Props) => {
  let content: ReactNode;
  if (scroll) {
    content = (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          padded && styles.padded,
          floatingTabBar ? styles.scrollContentTabBar : styles.scrollContent,
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent.base}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  } else {
    content = (
      <View style={[styles.flex, padded && styles.padded, contentStyle]}>
        {children}
      </View>
    );
  }

  if (keyboard) {
    content = (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {content}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.root, style]}>
      <AmbientBackground />
      <View style={[styles.flex, styles.topGap]}>{content}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg.base,
  },
  // The app-level SafeAreaView already consumes the top inset, so this is just
  // a small breathing gap - not a second safe-area offset.
  topGap: {
    paddingTop: space.xs,
  },
  flex: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: space.md,
  },
  scrollContent: {
    paddingBottom: space.lg,
  },
  scrollContentTabBar: {
    paddingBottom: TAB_BAR_CLEARANCE,
  },
});

export default ScreenContainer;
