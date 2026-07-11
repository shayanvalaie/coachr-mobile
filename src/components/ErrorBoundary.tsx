import { Component, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme/colors";
import { typeface } from "../theme/typography";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    if (__DEV__) console.log("[ErrorBoundary]", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            An unexpected error occurred. Your data is safe. Try again, and if
            the problem continues, restart the app.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={this.handleRetry}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg.base,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.bg.raised,
    borderColor: theme.border.base,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  title: {
    fontFamily: typeface.heading,
    fontSize: 18,
    color: theme.text.primary,
  },
  body: {
    fontFamily: typeface.body,
    fontSize: 14,
    lineHeight: 20,
    color: theme.text.secondary,
  },
  button: {
    marginTop: 8,
    backgroundColor: theme.accent.base,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    fontFamily: typeface.heading,
    fontSize: 15,
    color: theme.text.onAccent,
  },
});

export default ErrorBoundary;
