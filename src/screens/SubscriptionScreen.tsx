import React from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { useSubscription, IAP_SKUS } from "../lib/iap";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";

type Props = {
  onBack: () => void;
};

const SubscriptionScreen = ({ onBack }: Props) => {
  const { isPro, activeSku, products, loading, purchase, restore } =
    useSubscription();
  const isDevUnlocked = __DEV__ && isPro && !activeSku;
  const hasProducts = products.length > 0;

  const monthly = products.find((p) => p.sku === IAP_SKUS.MONTHLY);
  const annual = products.find((p) => p.sku === IAP_SKUS.ANNUAL);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>Upgrade</Text>
        <Text style={styles.title}>Coachr Pro</Text>

        {isPro ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeLabel}>You're on Pro</Text>
            <Text style={styles.activePlan}>
              {isDevUnlocked
                ? "Development unlock"
                : activeSku === IAP_SKUS.ANNUAL
                  ? "Annual plan"
                  : "Monthly plan"}
            </Text>
            <Text style={styles.activeNote}>
              {isDevUnlocked
                ? "This build bypasses subscription gating so you can access the full app in development."
                : "Manage or cancel in your App Store settings."}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Unlock the premium tools for coaches who want cleaner workflows
              and no interruptions.
            </Text>

            <View style={styles.benefitsCard}>
              <Text style={styles.benefitsTitle}>Everything in Pro</Text>
              <View style={styles.benefitsList}>
                <Text style={styles.benefitItem}>
                  No ads during lineup generation.
                </Text>
                <Text style={styles.benefitItem}>
                  Import rosters from spreadsheets.
                </Text>
                <Text style={styles.benefitItem}>
                  Export lineups to Excel and PDF.
                </Text>
                <Text style={styles.benefitItem}>
                  Full access to the calendar workspace.
                </Text>
              </View>
            </View>

            {!hasProducts ? (
              <View style={styles.unavailableCard}>
                <Text style={styles.unavailableTitle}>
                  Subscription products unavailable
                </Text>
                <Text style={styles.unavailableBody}>
                  Coachr couldn&apos;t load the monthly and annual plans from the
                  store for this build.
                </Text>
                <Text style={styles.unavailableBody}>
                  On the iOS simulator, attach a StoreKit configuration file to
                  the `coachrmobile` scheme or test on a real device with sandbox
                  / TestFlight.
                </Text>
                {__DEV__ ? (
                  <Text style={styles.unavailableHint}>
                    Expected product IDs: {IAP_SKUS.MONTHLY}, {IAP_SKUS.ANNUAL}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.cards}>
              {monthly ? (
                <View style={styles.card}>
                  <Text style={styles.plan}>{monthly.title}</Text>
                  <Text style={styles.price}>{monthly.localizedPrice}</Text>
                  <Text style={styles.per}>per {monthly.period}</Text>
                  <Pressable
                    disabled={loading}
                    onPress={() => purchase(monthly.sku)}
                    style={({ pressed }) => [
                      styles.cta,
                      pressed && styles.ctaPressed,
                      loading && styles.ctaDisabled,
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator
                        color={palette.accentText}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.ctaText}>Choose monthly</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {annual ? (
                <View style={styles.cardHighlight}>
                  <Text style={styles.badge}>Best value</Text>
                  <Text style={styles.plan}>{annual.title}</Text>
                  <Text style={styles.price}>{annual.localizedPrice}</Text>
                  <Text style={styles.per}>per {annual.period}</Text>
                  <Pressable
                    disabled={loading}
                    onPress={() => purchase(annual.sku)}
                    style={({ pressed }) => [
                      styles.cta,
                      pressed && styles.ctaPressed,
                      loading && styles.ctaDisabled,
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator
                        color={palette.accentText}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.ctaText}>Choose annual</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </View>

            <Pressable
              disabled={loading}
              onPress={restore}
              style={({ pressed }) => [
                styles.restoreButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.restoreText}>Restore purchases</Text>
            </Pressable>

            <Text style={styles.note}>
              You can cancel anytime in your app store settings.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default SubscriptionScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    padding: 16,
    gap: 14,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  backText: {
    color: palette.text,
    fontWeight: "700",
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  title: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: palette.subtext,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typeface.body,
  },
  activeCard: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.accent,
    gap: 6,
  },
  activeLabel: {
    color: palette.accent,
    fontFamily: typeface.heading,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  activePlan: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 20,
  },
  activeNote: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 13,
  },
  benefitsCard: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
  },
  benefitsTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 16,
  },
  benefitsList: {
    gap: 8,
  },
  unavailableCard: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 8,
  },
  unavailableTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 16,
  },
  unavailableBody: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 14,
    lineHeight: 19,
  },
  unavailableHint: {
    color: palette.accent,
    fontFamily: typeface.body,
    fontSize: 12,
    lineHeight: 18,
  },
  benefitItem: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 14,
    lineHeight: 19,
  },
  cards: {
    gap: 12,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 6,
  },
  cardHighlight: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.accent,
    gap: 6,
  },
  badge: {
    alignSelf: "flex-start",
    color: palette.accent,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
  },
  plan: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
    fontFamily: typeface.heading,
  },
  price: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "800",
    fontFamily: typeface.display,
  },
  per: {
    color: palette.subtext,
    fontFamily: typeface.body,
  },
  cta: {
    marginTop: 8,
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaPressed: {
    transform: [{ translateY: 1 }],
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: palette.accentText,
    fontWeight: "800",
  },
  restoreButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  restoreText: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 14,
    textDecorationLine: "underline",
  },
  note: {
    color: palette.subtext,
    fontSize: 12,
    fontFamily: typeface.body,
  },
});
