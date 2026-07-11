import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { AppText, Button, Input } from '../ui'
import { space } from '../../theme/tokens'
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
        <Input
          label="Verification code"
          hint={`Enter the 6-digit code sent to ${verificationEmail}.`}
          value={verificationCode}
          onChangeText={onVerificationCodeChange}
          keyboardType="number-pad"
          placeholder="123456"
          maxLength={6}
          accessibilityLabel="Verification code"
        />
      ) : (
        <>
          <Input
            label="Email"
            value={email}
            onChangeText={onEmailChange}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            accessibilityLabel="Email"
          />

          <Input
            label="Password"
            value={password}
            onChangeText={onPasswordChange}
            secureTextEntry
            placeholder="••••••••"
            accessibilityLabel="Password"
          />

          {mode === AuthMode.SignUp && (
            <Input
              label="Confirm password"
              value={confirm}
              onChangeText={onConfirmChange}
              secureTextEntry
              placeholder="••••••••"
              accessibilityLabel="Confirm password"
            />
          )}
        </>
      )}

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

      <View style={styles.ctaWrap}>
        <Button
          label={ctaLabel}
          onPress={onSubmit}
          loading={loading}
          fullWidth
          accessibilityLabel={ctaLabel}
        />
      </View>

      {isVerificationStep ? (
        <>
          <Button
            label="Resend code"
            variant="ghost"
            onPress={onResendVerification}
            disabled={loading}
            fullWidth
            accessibilityLabel="Resend verification code"
          />
          <Button
            label="Use different email"
            variant="ghost"
            onPress={onCancelVerification}
            disabled={loading}
            fullWidth
            accessibilityLabel="Use a different email"
          />
        </>
      ) : (
        <Button
          label={toggleLabel}
          variant="ghost"
          onPress={onToggleMode}
          fullWidth
          accessibilityLabel={toggleLabel}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  form: {
    marginTop: space.sm,
    gap: space.sm,
  },
  ctaWrap: {
    marginTop: space.xxs,
  },
})

export default AuthForm
