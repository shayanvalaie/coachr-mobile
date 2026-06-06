import { useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { palette } from '../../theme/colors'
import { AuthMode } from '../../types/auth'

type Props = {
  mode: AuthMode
  email: string
  password: string
  confirm: string
  verificationEmail: string | null
  verificationCode: string
  loading: boolean
  status: string | null
  error: string | null
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onConfirmChange: (value: string) => void
  onVerificationCodeChange: (value: string) => void
  onSubmit: () => void
  onResendVerification: () => void
  onCancelVerification: () => void
  onToggleMode: () => void
}

const AuthForm = ({
  mode,
  email,
  password,
  confirm,
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
}: Props) => {
  const isVerificationStep = !!verificationEmail
  const ctaLabel = useMemo(
    () =>
      isVerificationStep
        ? 'Verify email'
        : mode === AuthMode.SignIn
          ? 'Sign in'
          : 'Create account',
    [isVerificationStep, mode],
  )
  const toggleLabel = useMemo(
    () =>
      mode === AuthMode.SignIn ? "Don't have an account? Sign up" : 'Already registered? Sign in',
    [mode],
  )

  return (
    <View style={styles.form}>
      {isVerificationStep ? (
        <>
          <Text style={styles.label}>Verification code</Text>
          <Text style={styles.helperText}>
            Enter the 6-digit code sent to {verificationEmail}.
          </Text>
          <TextInput
            value={verificationCode}
            onChangeText={onVerificationCodeChange}
            keyboardType="number-pad"
            placeholder="123456"
            placeholderTextColor="#8b92a5"
            style={styles.input}
            maxLength={6}
          />
        </>
      ) : (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={onEmailChange}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#8b92a5"
            style={styles.input}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={onPasswordChange}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#8b92a5"
            style={styles.input}
          />

          {mode === AuthMode.SignUp && (
            <>
              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                value={confirm}
                onChangeText={onConfirmChange}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor="#8b92a5"
                style={styles.input}
              />
            </>
          )}
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && { transform: [{ translateY: 1 }] },
          loading && styles.primaryButtonDisabled,
        ]}
        onPress={onSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={palette.accentText} />
        ) : (
          <Text style={styles.primaryText}>{ctaLabel}</Text>
        )}
      </Pressable>

      {isVerificationStep ? (
        <>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && { backgroundColor: 'rgba(255,255,255,0.08)' },
            ]}
            onPress={onResendVerification}
            disabled={loading}
          >
            <Text style={styles.secondaryText}>Resend code</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && { backgroundColor: 'rgba(255,255,255,0.08)' },
            ]}
            onPress={onCancelVerification}
            disabled={loading}
          >
            <Text style={styles.secondaryText}>Use different email</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { backgroundColor: 'rgba(255,255,255,0.08)' },
          ]}
          onPress={onToggleMode}
        >
          <Text style={styles.secondaryText}>{toggleLabel}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  form: {
    marginTop: 12,
    gap: 10,
  },
  label: {
    color: palette.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: palette.background,
    color: palette.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: palette.border,
    fontSize: 15,
  },
  helperText: {
    color: palette.subtext,
    fontSize: 12,
    marginTop: -2,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryText: {
    color: palette.accentText,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: palette.danger,
    fontSize: 13,
    marginTop: 4,
  },
  status: {
    color: palette.accent,
    fontSize: 13,
    marginTop: 4,
  },
})

export default AuthForm
