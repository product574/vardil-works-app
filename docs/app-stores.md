# The phone app on the App Store and Google Play

Written 21 Nov 2026. The phone app (operatives and site managers) is packaged for iPhone and
Android with Capacitor 8: the same screens as the Site phone in the demo, inside a native shell.

**Where it stands.** The projects are in `ios/` and `android/`, the build is `npm run build:phone`,
and a GitHub workflow makes the Android app and uploads the iPhone one to TestFlight. Neither app
has been built yet: an Android build needs Google's Android tools and an iPhone build needs a Mac
with Xcode 26, and neither can run where the code was written. The first run of the workflow is
the test.

**What it is today.** Sample data kept on the phone, and stand-ins for the text message code and
the fingerprint. That is right for test builds (TestFlight, Play internal testing). It is not
ready for a public listing: both stores review a public app, Apple turns away demos and apps that
are a repackaged website, and a real firm's people need the real server behind it first.

## The pieces in the repository

| What | Where |
|---|---|
| The phone app with nothing of the office around it | `src/phone/`, `StandalonePhone` in `src/modules/site/PhoneApp.tsx` |
| Its build | `npm run build:phone` (into `dist-phone/`, about 1.4 MB) |
| Build, then copy into both native projects | `npm run app:sync` |
| The app's name and permanent id | `capacitor.config.ts`: "Vardil Site", `com.vardil.site` |
| iPhone project (Swift Package Manager, iOS 15 and later) | `ios/App/App.xcodeproj` |
| Android project (Android 7 and later, target API 36) | `android/` |
| Icon and splash screen source (a stand-in, see below) | `assets/logo.svg`, `assets/logo.png` |
| The builds on GitHub | `.github/workflows/phone-app.yml` |

To change the icon: replace `assets/logo.png` with a 1024 by 1024 picture of the mark on a clear
background, then run

```
npx @capacitor/assets generate --iconBackgroundColor "#35678F" --splashBackgroundColor "#35678F" --ios --android
```

## Decide before the first upload

1. **The app's id, `com.vardil.site`.** It is permanent in both stores once a build is uploaded.
2. **The app's name, "Vardil Site".** It can change later, but the App Store name must be free.
3. **One app for every client, or one per client.** One app that every client's people sign in to
   is far less work (one listing, one review). Apple can also treat near-identical apps under one
   account as spam.
4. **Whose name is the seller.** The legal name of the company that enrols.

## What only Vardil can do, in order

1. **A D-U-N-S number for the company.** Free from Dun & Bradstreet. Look the company up first; it
   may have one already. Apple and Google both ask for it for a company account. Start this first:
   it is the slow step.
2. **Apple Developer Program, as an organisation.** 99 US dollars a year. Needs the D-U-N-S number,
   an Apple Account with two-factor sign-in, a work email on the company's domain, a public website
   on that domain, and someone with authority to sign for the company.
3. **Google Play Console, as an organisation.** 25 US dollars once. Needs the D-U-N-S number and a
   Google payments profile in the company's name. A company account skips the 12 testers for 14
   days that new personal accounts must run before going public.
4. **In App Store Connect:** register the bundle id `com.vardil.site`, create the app, and under
   Users and Access, Integrations, make an App Store Connect API key (role Admin, so it can make
   the signing certificate). Note the key id, the issuer id and the team id, and download the .p8
   file once.
5. **In Play Console:** create the app, and let Google manage the app signing key. Make an upload
   key on any computer with Java:

   ```
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Keep `upload.jks` and its passwords somewhere safe and never in the repository.
6. **In GitHub**, repository Settings, Secrets and variables, Actions:
   - Secrets for Android: `ANDROID_KEYSTORE_BASE64` (the file `upload.jks` as base64),
     `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (upload), `ANDROID_KEY_PASSWORD`.
   - Secrets for iPhone: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the whole .p8 file),
     `APPLE_TEAM_ID`.
   - Variable: `IOS_READY` set to `true`.
7. **Run the workflow:** GitHub, Actions, "Phone app", Run workflow. The workflow file has to be
   on `main` before the button shows.
8. **Testers.** TestFlight: up to 100 people on the team with no review; up to 10,000 outside
   testers by email or a link, after Apple reviews the first build. Play: an internal testing
   track of up to 100 people by email, available within minutes.

No Mac is needed for any of this: GitHub's `macos-26` machines carry Xcode 26. A Mac helps for
trying the app in the simulator and for taking screenshots.

## Before a public listing

- The real server: sign-in, the text message code, each firm's own data. Marked REAL BUILD in the
  code (`src/lib/phone-auth.ts`, `src/data/actions.ts`).
- Fingerprint and Face ID through the phone itself (a Capacitor plugin), in place of the stand-in.
- A privacy policy at a public address, and the stores' privacy answers (Apple's privacy details,
  Google's Data safety form) filled in from what the real app collects: name, mobile number,
  photos sent to the office, and whatever the server logs.
- A way for someone to have their account deleted, which both stores ask for where an app has
  accounts.
- A test account for the reviewers, with sign-in details that work without a text message.
- Screenshots from a real build: 6.9 inch iPhone for Apple; phone screenshots, a 512 pixel icon and
  a 1024 by 500 feature graphic for Google.
- A support address and a marketing page.

## Listing text, as a first draft

**Name:** Vardil Site

**Subtitle (30 characters):** Your week, hours and requests

**Short description (80 characters):** For site crews: your week, your hours, holidays, receipts and repairs.

**Description:**

Vardil Site is the phone app for the people on site at firms that run on Vardil Works.

Operatives see where they are this week and who runs the site, check the hours they are down
for, ask for holidays, send a receipt, report a repair on a van or a machine, and keep their
tickets up to date.

Site managers see their sites, mark who is in each day with any overtime, and answer what
waits for them: overtime claims, receipts and requests from the crew.

You need an invitation from your firm's office to sign in.

**Category:** Business. **Keywords:** construction, site, timesheet, crew, overtime, holidays,
receipts, repairs.

## Not done

- No build has been made or run on a phone or in a simulator.
- The workflow has not run: expect to fix something on its first go.
- The icon is a stand-in drawn from the demo's favicon, not Vardil's mark.
- The camera opens through the page's own file picker; it has not been tried inside the apps.
- No push notifications.
