import React, { useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSubscription, IAP_SKUS, IapSku, SubscriptionProduct } from "../lib/iap";
import {
  lockOrientation,
  ORIENTATION_LOCK_PORTRAIT_UP,
} from "./lineup/orientation";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  IconButton,
  LoadTransition,
  PageHeader,
  ScreenContainer,
  Skeleton,
} from "../components/ui";
import { Feather } from "../icons";
import { theme } from "../theme/colors";
import { motion, radius, space } from "../theme/tokens";
import { typeface } from "../theme/typography";

type Props = {
  onClose: () => void;
};

const BENEFITS = [
  "No ads during lineup generation",
  "Import rosters from spreadsheets",
  "Export lineups to Excel and PDF",
  "Full access to the calendar",
];

// Required on the paywall by App Store Review Guideline 3.1.2. Point these at
// your hosted, publicly reachable pages (and match the URLs in App Store
// Connect metadata). The Terms URL may be your own EULA or Apple's standard
// EULA: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
const TERMS_URL = "https://coachrapp.io/terms";
const PRIVACY_URL = "https://coachrapp.io/privacy";

// "$29.99" -> "$", "CA$29.99" -> "CA$". Good enough for a per-month estimate.
const currencyPrefix = (localizedPrice: string) =>
  localizedPrice.replace(/[\d.,\s]/g, "");

const perMonthLabel = (annual: SubscriptionProduct) =>
  annual.price == null
    ? null
    : `${currencyPrefix(annual.localizedPrice)}${(annual.price / 12).toFixed(2)}/mo`;

const savingsPercent = (annual: SubscriptionProduct, monthly: SubscriptionProduct) => {
  if (annual.price == null || monthly.price == null || monthly.price <= 0) return 0;
  return Math.round((1 - annual.price / (monthly.price * 12)) * 100);
};

type PlanCardProps = {
  name: string;
  priceLine: string;
  selected: boolean;
  tag?: string;
  elevated?: boolean;
  onPress: () => void;
};

const PlanCard = ({ name, priceLine, selected, tag, elevated, onPress }: PlanCardProps) => (
  <AppPressable
    onPress={onPress}
    pressScale={motion.pressScale}
    accessibilityRole="radio"
    accessibilityLabel={`${name}, ${priceLine}`}
    accessibilityState={{ selected }}
    style={[
      styles.plan,
      elevated && styles.planElevated,
      selected && styles.planSelected,
    ]}
  >
    <View style={styles.planText}>
      <View style={styles.planNameRow}>
        <AppText variant="bodyLg" family="heading">
          {name}
        </AppText>
        {tag ? (
          <View style={styles.tag}>
            <AppText style={styles.tagText}>{tag}</AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="body" color="secondary">
        {priceLine}
      </AppText>
    </View>
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected ? <Feather name="check" size={13} color={theme.text.onAccent} /> : null}
    </View>
  </AppPressable>
);

const SubscriptionScreen = ({ onClose }: Props) => {
  const { isPro, activeSku, products, loading, purchase, restore } =
    useSubscription();
  // This paywall is presented as a native fullScreenModal, which escapes the
  // app-level SafeAreaView that pads the rest of the app. Apply the insets
  // here so the header clears the notch and the CTA clears the home bar.
  const insets = useSafeAreaInsets();
  // The paywall can be opened from the landscape lineup editor, which holds a
  // landscape orientation lock; force portrait so the modal isn't sideways.
  useEffect(() => {
    void lockOrientation(ORIENTATION_LOCK_PORTRAIT_UP);
  }, []);

  const isDevUnlocked = __DEV__ && isPro && !activeSku;
  const hasProducts = products.length > 0;
  // True only while the store products are first being fetched. Once products
  // exist, `loading` also flips during purchase/restore and must not swap the
  // plan cards back to skeletons.
  const isInitialLoading = loading && !hasProducts;

  const monthly = products.find((p) => p.sku === IAP_SKUS.MONTHLY);
  const annual = products.find((p) => p.sku === IAP_SKUS.ANNUAL);
  const [selectedSku, setSelectedSku] = useState<IapSku>(IAP_SKUS.ANNUAL);
  const selectedProduct =
    selectedSku === IAP_SKUS.ANNUAL ? (annual ?? monthly) : (monthly ?? annual);

  const savings = annual && monthly ? savingsPercent(annual, monthly) : 0;
  const annualPerMonth = annual ? perMonthLabel(annual) : null;

  const ctaLabel = selectedProduct
    ? selectedProduct.sku === IAP_SKUS.ANNUAL
      ? `Start annual · ${selectedProduct.localizedPrice}/yr`
      : `Start monthly · ${selectedProduct.localizedPrice}/mo`
    : "Start Pro";

  return (
    <View style={styles.root}>
      <ScreenContainer
        scroll
        floatingTabBar={false}
        contentStyle={[styles.content, { paddingTop: insets.top }]}
      >
        {/* The paywall is a full-screen modal with no swipe-to-dismiss, so the
            close button is the only way out (required by App Store review). */}
        <PageHeader
          eyebrow="Coachr Pro"
          title="Cleaner game days"
          right={
            <IconButton icon="x" size={36} onPress={onClose} accessibilityLabel="Close" />
          }
        />

        {isPro ? (
          <Card variant="glass" radius="xl" borderColor={theme.accent.subtleBorder}>
            <View style={styles.cardInner}>
              <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
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
            <View style={styles.benefitsList}>
              {BENEFITS.map((benefit) => (
                <View key={benefit} style={styles.benefitRow}>
                  <Feather name="check" size={16} color={theme.accent.base} />
                  <AppText variant="body" color="secondary" style={styles.benefitText}>
                    {benefit}
                  </AppText>
                </View>
              ))}
            </View>

            <LoadTransition
              loading={isInitialLoading}
              style={styles.plans}
              skeleton={
                <>
                  <Skeleton height={72} radius={radius.lg} />
                  <Skeleton height={72} radius={radius.lg} delay={60} />
                </>
              }
            >
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

              {annual ? (
                <PlanCard
                  name="Annual"
                  priceLine={
                    annualPerMonth
                      ? `${annual.localizedPrice} per year · ${annualPerMonth}`
                      : `${annual.localizedPrice} per year`
                  }
                  tag={savings > 0 ? `Save ${savings}%` : undefined}
                  elevated
                  selected={selectedProduct?.sku === annual.sku}
                  onPress={() => setSelectedSku(annual.sku)}
                />
              ) : null}
              {monthly ? (
                <PlanCard
                  name="Monthly"
                  priceLine={`${monthly.localizedPrice} per month`}
                  selected={selectedProduct?.sku === monthly.sku}
                  onPress={() => setSelectedSku(monthly.sku)}
                />
              ) : null}
            </LoadTransition>
          </>
        )}
      </ScreenContainer>

      {!isPro ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <Button
            label={ctaLabel}
            size="lg"
            fullWidth
            loading={loading && hasProducts}
            disabled={!selectedProduct}
            onPress={() => {
              if (selectedProduct) purchase(selectedProduct.sku);
            }}
            accessibilityLabel={ctaLabel}
          />
          <Button
            label="Restore purchases"
            variant="ghost"
            size="sm"
            onPress={restore}
            disabled={loading}
            fullWidth
            accessibilityLabel="Restore purchases"
          />
          <AppText variant="caption" color="muted" style={styles.legal}>
            Billed to your Apple ID. Renews automatically unless cancelled 24 hours
            before the period ends.{" "}
            <AppText
              variant="caption"
              color="muted"
              style={styles.legalLink}
              onPress={() => Linking.openURL(TERMS_URL)}
              accessibilityRole="link"
            >
              Terms
            </AppText>
            {" · "}
            <AppText
              variant="caption"
              color="muted"
              style={styles.legalLink}
              onPress={() => Linking.openURL(PRIVACY_URL)}
              accessibilityRole="link"
            >
              Privacy
            </AppText>
          </AppText>
        </View>
      ) : null}
    </View>
  );
};

export default SubscriptionScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg.base,
  },
  content: {
    gap: space.md,
  },
  cardInner: {
    gap: space.xs,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  benefitsList: {
    gap: space.xs + 2,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  benefitText: {
    flex: 1,
  },
  plans: {
    gap: space.sm - 2,
  },
  plan: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
    padding: space.md,
  },
  planElevated: {
    backgroundColor: theme.bg.elevated,
  },
  planSelected: {
    borderColor: theme.accent.base,
  },
  planText: {
    flex: 1,
    gap: 2,
  },
  planNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  tag: {
    backgroundColor: theme.accent.base,
    borderRadius: radius.sm / 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontFamily: typeface.display,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.text.onAccent,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: theme.border.base,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: theme.accent.base,
    backgroundColor: theme.accent.base,
  },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.xxs,
  },
  legal: {
    textAlign: "center",
    paddingTop: space.xxs,
  },
  legalLink: {
    textDecorationLine: "underline",
  },
});
