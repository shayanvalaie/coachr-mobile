import RateLimitNotice from "../components/RateLimitNotice";
import { retryDeadline } from "../lib/backend/utils";
import { useState } from "react";
import {
  Keyboard,
  Linking,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import PasswordResetForm from "../components/auth/PasswordResetForm";
import AuthForm from "../components/auth/AuthForm";
import AuthHeader from "../components/auth/AuthHeader";
import { AgeEligibility } from "../components/privacy/AgeEligibility";
import { AGE_POLICY_VERSION, DeclaredAgeBand, PRIVACY_URL, TERMS_URL } from "../lib/privacy/contracts";
import { AppPressable, AppText, Reveal, ScreenContainer } from "../components/ui";
import { space } from "../theme/tokens";
import { AuthMode } from "../types/auth";
import { backendClient } from "../lib/backend/client";

const AuthScreen = () => {
  const [resettingPassword, setResettingPassword] = useState(false);
  const [mode, setMode] = useState<AuthMode>(AuthMode.SignIn);
  const [ageBand, setAgeBand] = useState<DeclaredAgeBand | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null,
  );
  const [verificationCode, setVerificationCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const isLikelyEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async () => {
    if (retryAt !== null && Date.now() < retryAt) return;
    setError(null);
    setStatus(null);
    const normalizedEmail = email.trim().toLowerCase();

    if (verificationEmail) {
      const normalizedCode = verificationCode.trim();
      if (!/^\d{6}$/.test(normalizedCode)) {
        setError("Enter the 6-digit verification code.");
        return;
      }

      setLoading(true);
      try {
        const { data, error: verifyError } =
          await backendClient.auth.verifyEmail({
            email: verificationEmail,
            code: normalizedCode,
            password,
          });
        if (verifyError) throw verifyError;
        setVerificationEmail(null);
        setVerificationCode("");
        setMode(AuthMode.SignIn);
        setStatus(
          data.session ? "Email verified. Signed in." : "Email verified.",
        );
      } catch (err: any) {
        setRetryAt(retryDeadline(err));
        setError(err?.message ?? "Unable to verify email right now.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === AuthMode.SignUp && (ageBand === null || ageBand === "under13")) {
      setError("Coachr accounts require an age group of 13 or older.");
      return;
    }
    if (!normalizedEmail || !password) {
      setError("Email and password are required.");
      return;
    }
    if (!isLikelyEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === AuthMode.SignUp && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (mode === AuthMode.SignUp && password !== confirm) {
      setError("Passwords must match.");
      return;
    }

    setLoading(true);
    try {
      if (mode === AuthMode.SignIn) {
        const { data, error: signInError } =
          await backendClient.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
        if (signInError) {
          const message = signInError.message.toLowerCase();
          if (
            message.includes("email not verified") ||
            message.includes("verification")
          ) {
            setVerificationEmail(normalizedEmail);
            setVerificationCode("");
            setStatus(
              "Enter the 6-digit code from your email to finish signing in.",
            );
            return;
          }
          throw signInError;
        }
        setStatus("Signed in.");
        if (__DEV__)
          console.log("[auth] sign-in success", data?.session?.user?.id);
      } else {
        const { data, error: signUpError } = await backendClient.auth.signUp({
          email: normalizedEmail,
          password,
          ageBand: ageBand!,
          policyVersion: AGE_POLICY_VERSION,
        });
        if (signUpError) throw signUpError;
        const needsEmailVerify = !data.session;
        if (needsEmailVerify) {
          setVerificationEmail(normalizedEmail);
          setVerificationCode("");
          setStatus("Verification code sent. Check your email.");
        } else {
          setStatus("Account created and signed in.");
        }
        if (__DEV__)
          console.log("[auth] sign-up success", data?.session?.user?.id);
        setConfirm("");
      }
    } catch (err: any) {
      setRetryAt(retryDeadline(err));
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (retryAt !== null && Date.now() < retryAt) return;
    if (!verificationEmail) return;
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      const { error: resendError } =
        await backendClient.auth.resendVerification({
          email: verificationEmail,
          password,
        });
      if (resendError) throw resendError;
      setStatus("Verification code resent.");
    } catch (err: any) {
      setRetryAt(retryDeadline(err));
      setError(err?.message ?? "Unable to resend verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelVerification = () => {
    setVerificationEmail(null);
    setVerificationCode("");
    setError(null);
    setStatus(null);
  };

  const handleToggleMode = () => {
    setMode(mode === AuthMode.SignIn ? AuthMode.SignUp : AuthMode.SignIn);
    setVerificationEmail(null);
    setVerificationCode("");
    setError(null);
    setStatus(null);
  };

  return (
    <ScreenContainer
      keyboard
      scroll
      floatingTabBar={false}
      contentStyle={styles.scrollContent}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.column}>
          {/* First thing shown after boot - ease it in rather than popping.
              Mount-only, so mode/verification swaps stay still. */}
          <Reveal style={styles.stack}>
            <AuthHeader />
            {mode === AuthMode.SignUp && !verificationEmail && !resettingPassword ?
              <AgeEligibility value={ageBand} onChange={setAgeBand} disabled={loading} /> : null}
            {mode === AuthMode.SignUp && !verificationEmail && !resettingPassword &&
              (ageBand === null || ageBand === "under13") ? (
                <AppPressable onPress={handleToggleMode}><AppText>Already have an account? Sign in</AppText></AppPressable>
              ) : resettingPassword ? (
              <PasswordResetForm
                initialEmail={email}
                onBack={(nextEmail, completed) => {
                  setEmail(nextEmail);
                  setPassword("");
                  setConfirm("");
                  setMode(AuthMode.SignIn);
                  setResettingPassword(false);
                  setError(null);
                  setStatus(
                    completed
                      ? "Password updated. Sign in with your new password."
                      : null,
                  );
                }}
              />
            ) : (
              <AuthForm
                onForgotPassword={() => setResettingPassword(true)}
                mode={mode}
                email={email}
                password={password}
                confirm={confirm}
                verificationEmail={verificationEmail}
                verificationCode={verificationCode}
                status={status}
                error={error}
                loading={loading}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                onConfirmChange={setConfirm}
                onVerificationCodeChange={setVerificationCode}
                onSubmit={handleSubmit}
                onResendVerification={handleResendVerification}
                onCancelVerification={handleCancelVerification}
                onToggleMode={handleToggleMode}
              />
            )}
            {retryAt !== null ? <RateLimitNotice retryAt={retryAt} /> : null}
            <View style={{flexDirection: "row", gap: space.md}}>
              <AppPressable onPress={() => { void Linking.openURL(PRIVACY_URL); }}><AppText>Privacy Policy</AppText></AppPressable>
              <AppPressable onPress={() => { void Linking.openURL(TERMS_URL); }}><AppText>Terms of Use</AppText></AppPressable>
            </View>
          </Reveal>
        </View>
      </TouchableWithoutFeedback>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  // Full-bleed, no card. Brand and form read as one centered column: the empty
  // space frames it above and below rather than collecting in a gap between
  // the two, and the group holds still when the form grows (sign-up's third
  // input, the verification step) instead of shoving the wordmark around.
  // Slightly more top padding than bottom keeps the CTA in easy thumb reach.
  column: {
    flex: 1,
    justifyContent: "center",
    paddingTop: space.xl * 2,
    paddingBottom: space.xl,
  },
  stack: {
    gap: space.xl * 2,
  },
});

export default AuthScreen;
