import React from "react";
import { StyleSheet, View } from "react-native";
import { useSubscription, IAP_SKUS } from "../lib/iap";
import {
  AppText,
  Button,
  Card,
  Chip,
  ScreenContainer,
  ScreenHeader,
} from "../components/ui";
import { Feather } from "../icons";
import { theme } from "../theme/colors";
import { space } from "../theme/tokens";

type Props = {
  onBack: () => void;
};

const BENEFITS = [
  "No ads during lineup generation.",
  "Import rosters from spreadsheets.",
  "Export lineups to Excel and PDF.",
  "Full access to the calendar workspace.",
];

const SubscriptionScreen = ({ onBack }: Props) => {
  const { isPro, activeSku, products, loading, purchase, restore } =
    useSubscription();
  const isDevUnlocked = __DEV__ && isPro && !activeSku;
  const hasProducts = products.length > 0;

  const monthly = products.find((p) => p.sku === IAP_SKUS.MONTHLY);
  const annual = products.find((p) => p.sku === IAP_SKUS.ANNUAL);

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <ScreenHeader title="Coachr Pro" subtitle="Upgrade" onBack={onBack} />

      {isPro ? (
        <Card style={styles.activeCard}>
          <View style={styles.cardInner}>
            <AppText
              variant="caption"
              family="heading"
              color="accent"
              style={styles.eyebrow}
            >
              You're on Pro
            </AppText>
            <AppText variant="title" family="display">
              {isDevUnlocked
                ? "Development unlock"
                : activeSku === IAP_SKUS.ANNUAL
                  ? "Annual plan"
                  : "Monthly plan"}
            </AppText>
            <AppText variant="body" color="secondary">
              {isDevUnlocked
                ? "This build bypasses subscription gating so you can access the full app in development."
                : "Manage or cancel in your App Store settings."}
            </AppText>
          </View>
        </Card>
      ) : (
        <>
          <AppText variant="bodyLg" color="secondary">
            Unlock the premium tools for coaches who want cleaner workflows
            and no interruptions.
          </AppText>

          <Card>
            <View style={styles.cardInner}>
              <AppText variant="bodyLg" family="heading">
                Everything in Pro
              </AppText>
              <View style={styles.benefitsList}>
                {BENEFITS.map((benefit) => (
                  <View key={benefit} style={styles.benefitRow}>
                    <Feather name="check" size={16} color={theme.accent.base} />
                    <AppText
                      variant="body"
                      color="secondary"
                      style={styles.benefitText}
                    >
                      {benefit}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          </Card>

          {!hasProducts ? (
            <Card>
              <View style={styles.cardInner}>
                <AppText variant="bodyLg" family="heading">
                  Subscription products unavailable
                </AppText>
                <AppText variant="body" color="secondary">
                  Coachr couldn&apos;t load the monthly and annual plans from the
                  store for this build.
                </AppText>
                <AppText variant="body" color="secondary">
                  On the iOS simulator, attach a StoreKit configuration file to
                  the `coachrmobile` scheme or test on a real device with sandbox
                  / TestFlight.
                </AppText>
                {__DEV__ ? (
                  <AppText variant="caption" color="muted">
                    Expected product IDs: {IAP_SKUS.MONTHLY}, {IAP_SKUS.ANNUAL}
                  </AppText>
                ) : null}
              </View>
            </Card>
          ) : null}

          <View style={styles.plans}>
            {annual ? (
              <Card style={styles.planSelected}>
                <View style={styles.cardInner}>
                  <View style={styles.badgeRow}>
                    <Chip label="Best value" selected icon="star" />
                  </View>
                  <AppText variant="title" family="heading">
                    {annual.title}
                  </AppText>
                  <AppText variant="display" family="display">
                    {annual.localizedPrice}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    per {annual.period}
                  </AppText>
                  <View style={styles.ctaWrap}>
                    <Button
                      label="Choose annual"
                      onPress={() => purchase(annual.sku)}
                      loading={loading}
                      fullWidth
                      accessibilityLabel="Choose annual plan"
                    />
                  </View>
                </View>
              </Card>
            ) : null}

            {monthly ? (
              <Card>
                <View style={styles.cardInner}>
                  <AppText variant="title" family="heading">
                    {monthly.title}
                  </AppText>
                  <AppText variant="display" family="display">
                    {monthly.localizedPrice}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    per {monthly.period}
                  </AppText>
                  <View style={styles.ctaWrap}>
                    <Button
                      label="Choose monthly"
                      variant="secondary"
                      onPress={() => purchase(monthly.sku)}
                      loading={loading}
                      fullWidth
                      accessibilityLabel="Choose monthly plan"
                    />
                  </View>
                </View>
              </Card>
            ) : null}
          </View>

          <Button
            label="Restore purchases"
            variant="ghost"
            onPress={restore}
            disabled={loading}
            fullWidth
            accessibilityLabel="Restore purchases"
          />

          <AppText variant="caption" color="muted" style={styles.note}>
            You can cancel anytime in your app store settings.
          </AppText>
        </>
      )}
    </ScreenContainer>
  );
};

export default SubscriptionScreen;

const styles = StyleSheet.create({
  content: {
    gap: space.sm,
  },
  cardInner: {
    gap: space.xs,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  activeCard: {
    borderColor: theme.accent.subtleBorder,
  },
  benefitsList: {
    gap: space.xs,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.xs,
  },
  benefitText: {
    flex: 1,
  },
  plans: {
    gap: space.sm,
  },
  planSelected: {
    borderColor: theme.accent.subtleBorder,
  },
  badgeRow: {
    flexDirection: "row",
  },
  ctaWrap: {
    marginTop: space.xs,
  },
  note: {
    textAlign: "center",
  },
});
