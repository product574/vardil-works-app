import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The phone app packaged for the App Store and Google Play (21 Nov). `webDir` is the phone-only
 * build (`npm run build:phone`); `npm run app:sync` builds it and copies it into the two native
 * projects in ios/ and android/.
 *
 * appId is the app's permanent name in both stores (the iOS bundle identifier and the Android
 * application id). It cannot be changed once the app has been uploaded, so it is confirmed with
 * Oisin before the first upload.
 */
const config: CapacitorConfig = {
  appId: "com.vardil.site",
  appName: "Vardil Site",
  webDir: "dist-phone",
  backgroundColor: "#35678F",
  ios: { contentInset: "never" },
  android: { allowMixedContent: false },
};

export default config;
