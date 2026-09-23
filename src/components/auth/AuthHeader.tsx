import { StyleSheet, View } from "react-native";
import { AppText } from "../ui";
import { space } from "../../theme/tokens";
import { typeface } from "../../theme/typography";

// Wordmark block above the sign-in form. The eyebrow rides tight on top of the
// wordmark; the tagline gets a little more air below it, so the identity reads
// as one mark rather than three evenly stacked lines.
const AuthHeader = () => (
  <View style={styles.wrapper}>
    <AppText variant="caption" family="heading" color="secondary" style={styles.eyebrow}>
      Lineup Studio
    </AppText>
    <AppText style={styles.wordmark}>COACHR</AppText>
    <AppText variant="bodyLg" color="secondary" style={styles.tagline}>
      Fair lineups for every inning. Your rules, your roster, one tap.
    </AppText>
  </View>
);

const styles = StyleSheet.create({
  wrapper: {
    gap: space.xs,
  },
  eyebrow: {
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },
  wordmark: {
    fontFamily: typeface.display,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: 2.4,
  },
  tagline: {
    maxWidth: 280,
    marginTop: space.xxs,
  },
});

export default AuthHeader;
