import { StyleSheet, Text, View } from 'react-native'
import { palette } from '../../theme/colors'
import { AuthMode } from '../../types/auth'

type Props = {
  mode: AuthMode
}

const AuthHeader = ({ mode }: Props) => (
  <View style={styles.wrapper}>
    <Text style={styles.eyebrow}>Coachr</Text>
    <Text style={styles.title}>{mode === AuthMode.SignIn ? 'Welcome back' : 'Join Coachr'}</Text>
    <Text style={styles.subtitle}>
      Sign {mode === AuthMode.SignIn ? 'in to' : 'up for'} manage teams, rosters, and lineups.
    </Text>
  </View>
)

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: palette.subtext,
    fontSize: 15,
    lineHeight: 22,
  },
})

export default AuthHeader
