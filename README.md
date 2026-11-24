# CutVid

A video editor for **iPhone, iPad, Android, Windows and macOS**, built from one codebase.
Website and downloads: **https://cutvid.vercel.app**

| App | Platform | Shell | File |
| --- | --- | --- | --- |
| CutVid | iPhone (and iPad) | Capacitor | `CutVid-ios-unsigned.ipa` |
| CutVid | Android | Capacitor | `CutVid-android.apk` |
| CutVid | Windows | Electron | `CutVid-setup.exe`, `CutVid-portable.exe` |
| CutVid | macOS | Electron | `CutVid-mac-arm64.dmg` (Apple Silicon), `CutVid-mac-x64.dmg` (Intel) |
| CutVid Pad | iPad | Capacitor, `CUTVID_PAD=1` | `CutVid-Pad-unsigned.ipa` |
| CutVid Pad | Android tablets | Capacitor, `CUTVID_PAD=1` | `CutVid-Pad-android.apk` |

**CutVid Pad** is the same app with the computer layout on tablets, under its own app ID (`com.cutvid.pad`) so it can be installed next to CutVid. It is not available on iPhone.

## Features

- **Home screen** – tabs for Create (pick an aspect ratio: 16:9, 9:16, 1:1, 4:5, 4:3, 3:4, 21:9), Projects (needs sign-in) and Settings, plus a small feedback button.
- **Multi-track timeline** – video and audio tracks, drag, trim, split, duplicate, magnetic snapping, zoom, lock / hide / mute, and a keyframe diamond in the toolbar.
- **Library tabs** – Media, Text, Elements, Overlays, Effects, Transitions, Filters, Keyframes, AI and Edit (a scrolling bar at the bottom on phones).
- **Import** – on phones and tablets, *Gallery* opens the photo library and *Files* opens the Files app; on computers a single *Import files* button.
- **Text** – 16 ready-made styles, 21 built-in fonts, outline, background, shadow, coloured glow, typewriter.
- **Elements** – 12 shapes, gradient backgrounds, stickers.
- **Overlays** – your own photo or video from the gallery or files as a top layer, plus light leaks, colour washes, vignette, letterbox, scanlines, film grain, frame, spotlight and more, with opacity and blend modes.
- **Effects** – motion blur, shake, pulse, wobble, float, zoom punch, strobe, flash, RGB split, glitch, pixelate, mirror, grain, scanlines, hue cycle, green screen.
- **Transitions** – 19 in/out animations (fade, slide, zoom, spin, wipes, iris, flip, bounce, drop, swing, blur).
- **Filters** – 14 presets and nine sliders.
- **Keyframes and graphs** – position, scale, rotation and opacity; 25 ready-made easing graphs and a custom cubic-bezier editor.
- **Presets in your account** – your graphs, filters and effects are saved to your CutVid account.
- **MP4 export** – resolution (480p–4K), frame rate and quality chosen at export; the apps save straight to the gallery.
- **CutVid AI** – a chat that edits the timeline from a description (editing only; it does not generate images or video).
- **App icon** – 12 icon styles to choose from in Settings.
- **Settings** – account, 14 languages, notifications (AI finished, export finished, new versions), export defaults, app icon.
- **Automatic sync** – when signed in, projects sync between devices by themselves.
- **Undo / redo**, autosave on the device.

**Languages:** English, Hebrew, Arabic, Spanish, French, German, Portuguese, Italian, Russian, Turkish, Hindi, Japanese, Korean and Chinese. The app follows the device language on first run.

**Keyboard shortcuts:** `Space` play · `S` split · `Delete` delete · `Ctrl+Z` / `Ctrl+Shift+Z` · `Ctrl+D` duplicate · `←` / `→` one frame (`Shift`: 10) · `Ctrl+wheel` zoom.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build in dist/
```

## Building the apps

### GitHub Actions

Every push to `main` runs [`.github/workflows/build.yml`](.github/workflows/build.yml), which builds all platforms and attaches the files to a release on the **Releases** page. A release becomes *latest* (the one the website downloads) only after every platform succeeded. Changes to docs, `site/`, `supabase/` or `vercel.json` alone do not trigger app builds.

- A commit whose message contains **`[release]`** publishes an official release named after the `version` in `package.json` (for example *CutVid v1.0.0*). Other pushes publish numbered builds (*CutVid build N*).
- When shipping a new version, bump `APP_VERSION` in `src/version.ts` and `public/version.json` together: installed apps compare them to show "new version available".

### Local builds

```bash
npm run dist:win      # Windows → release/*.exe   (run on Windows)
npm run dist:mac      # macOS   → release/*.dmg   (run on a Mac)
npm run cap:android   # creates android/ → open in Android Studio, or: cd android && ./gradlew assembleDebug
npm run cap:ios       # creates ios/     → npx cap open ios (needs a Mac with Xcode)
```

For CutVid Pad, set `CUTVID_PAD=1` for the web build, `cap add` and `node scripts/patch-native.mjs`.

### Signing

- **Android** – the APK is a debug build and installs directly. Google Play needs a keystore and `./gradlew bundleRelease`.
- **iOS / iPadOS** – the CI IPA is **unsigned**. Install it with AltStore or Sideloadly, or set a signed install link on the website (see below). The App Store needs an Apple Developer account.
- **Windows / macOS** – unsigned, so SmartScreen / Gatekeeper warn on first launch (Mac: right-click → Open).

## Website (cutvid.vercel.app)

The website is a landing page only: what CutVid is, download buttons, install steps, feedback, and the developer program. Its source is [`site/`](site); Vercel deploys it from `main` (see [`vercel.json`](vercel.json)).

- Download buttons point to `releases/latest/download/<file>` on GitHub.
- **Signed iPhone / iPad install links** – in Vercel → *Settings → Environment Variables* set `CUTVID_IOS_INSTALL_URL` (CutVid) and/or `CUTVID_PAD_INSTALL_URL` (CutVid Pad), then redeploy. With a link, the button installs directly; without one it downloads the IPA with a note to use AltStore or Sideloadly. Only `https://` and `itms-services://` links are accepted.
- `/callback` ([`public/auth.html`](public/auth.html)) hands sign-in results (Google, email links) back to the right app: `com.cutvid.app://`, `com.cutvid.pad://` or the desktop app.

## Supabase

Project: `btrwboxwbinqewgvlcal`. Its URL and publishable key are built into the apps ([`src/lib/supabase.ts`](src/lib/supabase.ts)); the publishable key is meant to be public, and data is protected by row-level security. Never put a `service_role` / secret key in the apps.

### Database

[`supabase/migrations/`](supabase/migrations) creates:

- `projects` and the private `media` bucket – each user sees only their own projects and files;
- `presets` – saved graphs, filters and effects;
- `feedback` – anyone can send, nobody can read through the API (view it in *Table Editor*);
- `developer_apps` – "Sign in with CutVid" applications (server-side access only).

### Authentication

- **Sign-up** sends a confirmation link. **Email sign-in** checks the password and then emails a **sign-in link** that must be opened on the same device. **Forgot password** sends a reset link.
- **Google** – in Google Cloud create an OAuth *Web application* client with the redirect URI `https://btrwboxwbinqewgvlcal.supabase.co/auth/v1/callback`, then enable Google in Supabase → *Authentication → Sign In / Providers* with its Client ID and Secret.
- **Redirect URLs** (*Authentication → URL Configuration*): Site URL `https://cutvid.vercel.app`, plus `https://cutvid.vercel.app/**`, `com.cutvid.app://auth`, `com.cutvid.pad://auth` and `http://127.0.0.1:47823/callback`.
- **Email templates** – branded templates are in [`supabase/templates/`](supabase/templates); paste them in *Authentication → Emails → Templates* (Source view). All of them use links.
- **SMTP** – Supabase's built-in mail server is heavily rate-limited, so connect your own in *Authentication → Emails → SMTP Settings* (for Gmail: `smtp.gmail.com`, port 465, your address and an app password).

### CutVid AI

The built-in assistant runs in the [`cutvid-ai`](supabase/functions/cutvid-ai/index.ts) Edge Function, so the provider key stays on the server and only signed-in users can call it. Add one of these in *Edge Functions → Secrets*:

| Provider | Secrets |
| --- | --- |
| Google Gemini (default) | `AI_API_KEY` – a Google AI Studio key |
| Any OpenAI-compatible provider | `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` (optional `CUTVID_AI_MODEL`) |

If the configured model is not available, the function tries other available models of the same provider. Users can also pick their own provider and API key in the app (Anthropic, OpenAI, Gemini, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, Cerebras, Ollama, LM Studio or any OpenAI-compatible server); that key stays on their device.

### Sign in with CutVid (developer program)

Other apps can let people sign in with a CutVid account (OAuth 2.1 / OpenID Connect):

1. A developer applies at **cutvid.vercel.app/developers**. The owner gets an email with *Approve* / *Reject*; the developer gets a confirmation.
2. Approval sends the developer a welcome email; rejection sends a "maybe next time" email.
3. Approved developers sign in at **/developers/console** with the same email and create their Client ID and Secret.
4. End users approve access on the consent screen at **/oauth/consent**.

Setup in Supabase:

- *Edge Functions → Secrets*: `SMTP_USER`, `SMTP_PASS` (Gmail address and app password) and `ADMIN_EMAIL` (where applications go). Code: [`supabase/functions/developer-apps`](supabase/functions/developer-apps/index.ts).
- *Authentication → OAuth Server*: enable it and set the authorization path to `/oauth/consent`.
- Recommended: switch *JWT Signing Keys* to an asymmetric key (RS256 / ES256) so clients can request the `openid` scope.

## Known limitations

- Export needs WebCodecs (Chrome, Edge, Electron, Android WebView, Safari / iOS 16.4+). Devices without an audio encoder export without sound.
- Colour filters rely on `CanvasRenderingContext2D.filter`; where Safari lacks it they are skipped.
- New-version notifications while the app is closed use a background task ([`public/runners/background.js`](public/runners/background.js)); the operating system decides when it runs (on iOS this can take hours). It is not real push.
- Speed changes also change pitch in the exported file.
- Not yet verified on real devices: saving to the gallery, the native Gallery / Files pickers, notifications, app-icon switching, sign-in returning to the app, and the iOS / Android / Windows / macOS shells in general.

## Project layout

```
src/engine/      render.ts (compositor) · player.ts · export.ts · media.ts · keyframes.ts
src/components/  Home · Timeline · Preview · Inspector · Library · Panels · dialogs
src/ai/          providers.ts · assistant.ts · http.ts
src/lib/         supabase.ts · sync.ts · db.ts (IndexedDB) · i18n.ts · lang.ts · app.ts · settings.ts
src/locales/     translations (English and Hebrew live in src/lib/i18n.ts)
electron/        desktop shell          capacitor.config.ts   mobile shell
site/            website and developer pages
supabase/        migrations · functions (cutvid-ai, developer-apps) · templates
scripts/         patch-native.mjs · render-app-icons.mjs · site-links.mjs
```
