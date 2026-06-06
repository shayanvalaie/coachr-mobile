# Coachr Mobile App

Run from this folder:

```bash
npm install
npm run start
```

Native targets:

```bash
npm run ios
npm run android
```

Backend switching is documented in `BACKEND_SWITCHING.md`.

## Before Production

### AdMob setup

Lineup generation interstitial ads require both AdMob app IDs and AdMob ad unit IDs.

App IDs are configured in `app.json` through the `react-native-google-mobile-ads` plugin:

- `androidAppId`
- `iosAppId`

These are not the same as the interstitial ad unit IDs used at runtime.

Before shipping a production build:

1. Create the iOS and Android apps in AdMob.
2. Create one `Interstitial` ad unit for iOS.
3. Create one `Interstitial` ad unit for Android.
4. Add the runtime ad unit IDs to `.env`:

```env
EXPO_PUBLIC_ENABLE_ADS=true
EXPO_PUBLIC_LINEUP_INTERSTITIAL_IOS=ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx
EXPO_PUBLIC_LINEUP_INTERSTITIAL_ANDROID=ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx
```

ID format reminder:

- App ID: `ca-app-pub-...~...`
- Ad unit ID: `ca-app-pub-.../...`

After changing `.env`, restart Expo and rebuild the native app.
