import { StyleSheet, View } from 'react-native'
import { AppText } from '../ui'
import { space } from '../../theme/tokens'
import { AuthMode } from '../../types/auth'

type Props = {
  mode: AuthMode
}

const AuthHeader = ({ mode }: Props) => (
  <View style={styles.wrapper}>
    <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
      Coachr
    </AppText>
    <AppText variant="display" family="display">
      {mode === AuthMode.SignIn ? 'Welcome back' : 'Join Coachr'}
    </AppText>
    <AppText variant="bodyLg" color="secondary">
      Sign {mode === AuthMode.SignIn ? 'in to' : 'up for'} manage teams, rosters, and lineups.
    </AppText>
  </View>
)

const styles = StyleSheet.create({
  wrapper: {
    gap: space.xs,
  },
  eyebrow: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
})

export default AuthHeader
