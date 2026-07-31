import { useState } from "react";
import { Keyboard, StyleSheet, TouchableWithoutFeedback, View } from "react-native";
import AuthForm from "../components/auth/AuthForm";
import AuthHeader from "../components/auth/AuthHeader";
import { Card, Reveal, ScreenContainer } from "../components/ui";
import { space } from "../theme/tokens";
import { AuthMode } from "../types/auth";
import { backendClient } from "../lib/backend/client";

const AuthScreen = () => {
  const [mode, setMode] = useState<AuthMode>(AuthMode.SignIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null,
  );
  const [verificationCode, setVerificationCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLikelyEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async () => {
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
          });
        if (verifyError) throw verifyError;
        setVerificationEmail(null);
        setVerificationCode("");
        setMode(AuthMode.SignIn);
        setStatus(
          data.session ? "Email verified. Signed in." : "Email verified.",
        );
      } catch (err: any) {
        if (__DEV__) console.log("[auth] verify-email error", err);
        setError(err?.message ?? "Unable to verify email right now.");
      } finally {
        setLoading(false);
      }
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
      if (__DEV__) console.log("[auth] error", err);
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!verificationEmail) return;
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      const { error: resendError } =
        await backendClient.auth.resendVerification({
          email: verificationEmail,
        });
      if (resendError) throw resendError;
      setStatus("Verification code resent.");
    } catch (err: any) {
      if (__DEV__) console.log("[auth] resend-verification error", err);
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
    <ScreenContainer keyboard scroll contentStyle={styles.scrollContent}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.centerWrap}>
          {/* First thing shown after boot — ease the card in rather than
              popping it. Mount-only, so mode/verification swaps stay still. */}
          <Reveal>
          <Card variant="elevated" padding="lg" style={styles.card}>
            <AuthHeader mode={mode} />
            <AuthForm
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
          </Card>
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
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: space.lg,
  },
  card: {
    gap: space.sm,
  },
});

export default AuthScreen;
