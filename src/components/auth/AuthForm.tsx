import { Linking, StyleSheet, View } from "react-native";
import { AppPressable, AppText, Button, Input } from "../ui";
import { Feather } from "../../icons";
import { PRIVACY_URL, TERMS_URL } from "../../lib/privacy/contracts";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { AuthMode } from "../../types/auth";

type Props = {
  mode: AuthMode;
  email: string;
  password: string;
  confirm: string;
  acceptedTerms: boolean;
  onToggleAcceptedTerms: () => void;
  verificationEmail: string | null;
  verificationCode: string;
  loading: boolean;
  status: string | null;
  error: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onVerificationCodeChange: (value: string) => void;
  onSubmit: () => void;
  onResendVerification: () => void;
  onCancelVerification: () => void;
  onToggleMode: () => void;
  onForgotPassword: () => void;
};

// Inline text link under the form ("New here? Create an account").
const FooterLink = ({
  prompt,
  action,
  onPress,
  disabled,
}: {
  prompt: string;
  action: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <AppPressable
    onPress={onPress}
    disabled={disabled}
    pressScale={1}
    style={styles.footerLink}
    accessibilityRole="button"
    accessibilityLabel={action}
  >
    <AppText variant="caption" color="secondary">
      {prompt}{" "}
      <AppText variant="caption" family="heading" color="accent">
        {action}
      </AppText>
    </AppText>
  </AppPressable>
);

const AuthForm = ({
  mode,
  email,
  password,
  confirm,
  acceptedTerms,
  onToggleAcceptedTerms,
  verificationEmail,
  verificationCode,
  loading,
  status,
  error,
  onEmailChange,
  onPasswordChange,
  onConfirmChange,
  onVerificationCodeChange,
  onSubmit,
  onResendVerification,
  onCancelVerification,
  onToggleMode,
  onForgotPassword,
}: Props) => {
  const isVerificationStep = !!verificationEmail;
  const isSignIn = mode === AuthMode.SignIn;
  const ctaLabel = isVerificationStep
    ? "Verify email"
    : isSignIn
      ? "Sign in"
      : "Create account";

  return (
    <View style={styles.form}>
      {isVerificationStep ? (
        <Input
          hint={`Enter the 6-digit code sent to ${verificationEmail}.`}
          value={verificationCode}
          onChangeText={onVerificationCodeChange}
          keyboardType="number-pad"
          placeholder="Verification code"
          maxLength={6}
          accessibilityLabel="Verification code"
        />
      ) : (
        <>
          <Input
            value={email}
            onChangeText={onEmailChange}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="Email"
            accessibilityLabel="Email"
          />
          <Input
            value={password}
            onChangeText={onPasswordChange}
            secureTextEntry
            placeholder="Password"
            accessibilityLabel="Password"
          />
          {!isSignIn ? (
            <Input
              value={confirm}
              onChangeText={onConfirmChange}
              secureTextEntry
              placeholder="Confirm password"
              accessibilityLabel="Confirm password"
            />
          ) : null}
        </>
      )}

      {!isSignIn && !isVerificationStep ? (
        <View style={styles.termsRow}>
          <AppPressable
            onPress={onToggleAcceptedTerms}
            disabled={loading}
            hitSlop={10}
            style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            accessibilityLabel="I agree to the Privacy Policy and Terms of Use"
          >
            {acceptedTerms ? (
              <Feather name="check" size={14} color={theme.text.onAccent} />
            ) : null}
          </AppPressable>
          <AppText variant="caption" color="secondary" style={styles.termsText}>
            I agree to the{" "}
            <AppText
              variant="caption"
              family="heading"
              color="accent"
              accessibilityRole="link"
              onPress={() => { void Linking.openURL(PRIVACY_URL); }}
            >
              Privacy Policy
            </AppText>{" "}
            and{" "}
            <AppText
              variant="caption"
              family="heading"
              color="accent"
              accessibilityRole="link"
              onPress={() => { void Linking.openURL(TERMS_URL); }}
            >
              Terms of Use
            </AppText>
            .
          </AppText>
        </View>
      ) : null}

      {isSignIn && !isVerificationStep ? (
        <FooterLink
          prompt=""
          action="Forgot password?"
          onPress={onForgotPassword}
          disabled={loading}
        />
      ) : null}
      {error ? (
        <AppText variant="body" color="danger">
          {error}
        </AppText>
      ) : null}
      {status ? (
        <AppText variant="body" color="secondary">
          {status}
        </AppText>
      ) : null}

      <Button
        label={ctaLabel}
        onPress={onSubmit}
        loading={loading}
        size="lg"
        fullWidth
        accessibilityLabel={ctaLabel}
        style={styles.cta}
      />

      {isVerificationStep ? (
        <View style={styles.footerRow}>
          <FooterLink
            prompt="Didn't get it?"
            action="Resend code"
            onPress={onResendVerification}
            disabled={loading}
          />
          <FooterLink
            prompt="Wrong address?"
            action="Use a different email"
            onPress={onCancelVerification}
            disabled={loading}
          />
        </View>
      ) : (
        <FooterLink
          prompt={isSignIn ? "New here?" : "Already have an account?"}
          action={isSignIn ? "Create an account" : "Sign in"}
          onPress={onToggleMode}
          disabled={loading}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  form: {
    gap: space.xs + 2,
  },
  cta: {
    marginTop: space.xxs,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 32,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.border.strong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: theme.accent.base,
    borderColor: theme.accent.base,
  },
  termsText: {
    flex: 1,
  },
  footerLink: {
    alignSelf: "center",
    minHeight: 32,
    justifyContent: "center",
  },
  footerRow: {
    gap: space.xxs,
  },
});

export default AuthForm;
