import { useState } from "react";
import { View } from "react-native";
import { backendClient } from "../../lib/backend/client";
import { space } from "../../theme/tokens";
import { AppText, Button, Input } from "../ui";

type Props = {
  initialEmail: string;
  onBack: (email: string, completed: boolean) => void;
};

export default function PasswordResetForm({ initialEmail, onBack }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const normalizedEmail = email.trim().toLowerCase();

  const submit = async (resend = false) => {
    if (loading) return;
    setError(null);
    setStatus(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (sent && !resend) {
      if (!/^\d{6}$/.test(code.trim())) {
        setError("Enter the 6-digit reset code.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords must match.");
        return;
      }
    } else if (Date.now() < resendAt) {
      setError("Please wait a minute before requesting another code.");
      return;
    }
    setLoading(true);
    try {
      const result =
        sent && !resend
          ? await backendClient.auth.resetPassword({
              email: normalizedEmail,
              code: code.trim(),
              password,
            })
          : await backendClient.auth.forgotPassword({ email: normalizedEmail });
      if (result.error) throw result.error;
      if (sent && !resend) {
        onBack(normalizedEmail, true);
      } else {
        setSent(true);
        setCode("");
        setResendAt(Date.now() + 60_000);
        setStatus(
          "If an account exists for this email, a reset code has been sent. Check your inbox and spam folder. Codes expire in 15 minutes.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reset your password. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="title">Reset password</AppText>
      {sent ? (
        <>
          <AppText color="secondary">
            Enter the code sent to {normalizedEmail} and choose a new password.
          </AppText>
          <Input
            label="Reset code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
            editable={!loading}
          />
          <Input
            label="New password"
            hint="At least 8 characters."
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            editable={!loading}
          />
          <Input
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            editable={!loading}
          />
        </>
      ) : (
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          editable={!loading}
        />
      )}
      {error ? (
        <AppText color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      {status ? (
        <AppText color="secondary" accessibilityLiveRegion="polite">
          {status}
        </AppText>
      ) : null}
      <Button
        label={sent ? "Reset password" : "Send reset code"}
        loading={loading}
        onPress={() => void submit()}
        fullWidth
      />
      {sent ? (
        <>
          <Button
            label="Resend code"
            variant="secondary"
            disabled={loading}
            onPress={() => void submit(true)}
          />
          <Button
            label="Use a different email"
            variant="secondary"
            disabled={loading}
            onPress={() => {
              setSent(false);
              setCode("");
              setPassword("");
              setConfirm("");
              setError(null);
              setStatus(null);
            }}
          />
        </>
      ) : null}
      <Button
        label="Back to sign in"
        variant="secondary"
        disabled={loading}
        onPress={() => onBack(normalizedEmail, false)}
      />
    </View>
  );
}
