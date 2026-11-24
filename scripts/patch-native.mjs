// Registers the com.cutvid.app:// URL scheme in the generated native projects so that
// Google sign-in and password-reset links can return to the app. Safe to run repeatedly.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ICON_STYLES } from '../src/lib/appIconStyles.mjs';

// Alternate app icons the user can pick in Settings (rendered by scripts/render-app-icons.mjs).
const ALT_ICONS = ICON_STYLES.filter((s) => s.id !== 'Default').map((s) => s.id);

// CUTVID_PAD=1 patches the CutVid Pad (iPad-only) project instead.
const PAD = process.env.CUTVID_PAD === '1';
const SCHEME = PAD ? 'com.cutvid.pad' : 'com.cutvid.app';

const manifest = 'android/app/src/main/AndroidManifest.xml';
if (existsSync(manifest)) {
  let xml = readFileSync(manifest, 'utf8');
  if (!xml.includes(`android:scheme="${SCHEME}"`)) {
    const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${SCHEME}" />
            </intent-filter>
        </activity>`;
    if (!xml.includes('</activity>')) throw new Error('AndroidManifest.xml: no <activity> found');
    xml = xml.replace('</activity>', filter.trimStart());
    writeFileSync(manifest, xml);
    console.log('android: URL scheme registered');
  }
  // Notifications (Android 13+) and saving exports to the gallery.
  const perms = [
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
    '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
  ].filter((p) => !xml.includes(p.match(/android\.permission\.[A-Z_]+/)[0]));
  if (perms.length) {
    xml = xml.replace('</manifest>', `    ${perms.join('\n    ')}\n</manifest>`);
    writeFileSync(manifest, xml);
    console.log(`android: ${perms.length} permission(s) added`);
  }
  // The background update check ships a native library that Gradle must be told about.
  const gradle = 'android/app/build.gradle';
  if (existsSync(gradle)) {
    let g = readFileSync(gradle, 'utf8');
    const anchor = "dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'";
    const extra = "dirs '../../node_modules/@capacitor/background-runner/android/src/main/libs', 'libs'";
    if (!g.includes(extra)) {
      if (!g.includes(anchor)) throw new Error('android/app/build.gradle: flatDir block not found');
      g = g.replace(anchor, `${anchor}\n        ${extra}`);
      writeFileSync(gradle, g);
      console.log('android: background runner library path added');
    }
  }
}

const plist = 'ios/App/App/Info.plist';
if (existsSync(plist)) {
  let xml = readFileSync(plist, 'utf8');
  if (!xml.includes('CFBundleURLSchemes')) {
    const entry = `\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>${SCHEME}</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>${SCHEME}</string>
\t\t\t</array>
\t\t</dict>
\t</array>
`;
    const end = xml.lastIndexOf('</dict>');
    if (end < 0) throw new Error('Info.plist: no closing </dict>');
    xml = xml.slice(0, end) + entry + xml.slice(end);
    writeFileSync(plist, xml);
    console.log('ios: URL scheme registered');
  }
  // iOS refuses to save to Photos without these explanations.
  const usage = {
    NSPhotoLibraryAddUsageDescription: 'CutVid saves your exported videos to your photo library.',
    NSPhotoLibraryUsageDescription: 'CutVid saves your exported videos to your photo library.',
  };
  let added = 0;
  for (const [key, text] of Object.entries(usage)) {
    if (xml.includes(`<key>${key}</key>`)) continue;
    const end = xml.lastIndexOf('</dict>');
    xml = xml.slice(0, end) + `\t<key>${key}</key>\n\t<string>${text}</string>\n` + xml.slice(end);
    added++;
  }
  if (added) {
    writeFileSync(plist, xml);
    console.log(`ios: ${added} usage description(s) added`);
  }
  // Background update check: allowed task id + background modes.
  if (!xml.includes('BGTaskSchedulerPermittedIdentifiers')) {
    const entry = `\t<key>BGTaskSchedulerPermittedIdentifiers</key>\n\t<array>\n\t\t<string>${SCHEME}.update</string>\n\t</array>\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>fetch</string>\n\t\t<string>processing</string>\n\t</array>\n`;
    const end = xml.lastIndexOf('</dict>');
    xml = xml.slice(0, end) + entry + xml.slice(end);
    writeFileSync(plist, xml);
    console.log('ios: background task registered in Info.plist');
  }
}

const delegate = 'ios/App/App/AppDelegate.swift';
if (existsSync(delegate)) {
  let swift = readFileSync(delegate, 'utf8');
  if (!swift.includes('CapacitorBackgroundRunner')) {
    const launch = /(didFinishLaunchingWithOptions[^{]*\{\n)/;
    if (!swift.includes('import Capacitor\n') || !launch.test(swift)) throw new Error('AppDelegate.swift: unexpected layout');
    swift = swift.replace('import Capacitor\n', 'import Capacitor\nimport CapacitorBackgroundRunner\n');
    swift = swift.replace(launch, '$1        BackgroundRunnerPlugin.registerBackgroundTask()\n        BackgroundRunnerPlugin.handleApplicationDidFinishLaunching(launchOptions: launchOptions)\n');
    writeFileSync(delegate, swift);
    console.log('ios: background runner wired into AppDelegate');
  }
}

// ---- alternate app icons -------------------------------------------------------------------

// Android: one <activity-alias> per icon. The launcher entry moves from MainActivity to the
// enabled default alias; @capawesome/capacitor-app-icon toggles which alias is enabled.
if (existsSync(manifest)) {
  for (const dir of readdirSync('assets/app-icons/android')) {
    const dest = `android/app/src/main/res/${dir}`;
    mkdirSync(dest, { recursive: true });
    for (const f of readdirSync(`assets/app-icons/android/${dir}`)) copyFileSync(`assets/app-icons/android/${dir}/${f}`, `${dest}/${f}`);
  }
  // Android 8+ masks launcher icons into the device's shape only when they are adaptive icons.
  mkdirSync('android/app/src/main/res/mipmap-anydpi-v26', { recursive: true });
  for (const id of ALT_ICONS) {
    const name = id.toLowerCase();
    writeFileSync(
      `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_${name}.xml`,
      `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_${name}_bg" />\n    <foreground android:drawable="@android:color/transparent" />\n</adaptive-icon>\n`,
    );
  }
  let xml = readFileSync(manifest, 'utf8');
  if (!xml.includes('.AppIconDefault')) {
    const launcher = /\s*<intent-filter>\s*<action android:name="android\.intent\.action\.MAIN" \/>\s*<category android:name="android\.intent\.category\.LAUNCHER" \/>\s*<\/intent-filter>/;
    if (!launcher.test(xml)) throw new Error('AndroidManifest.xml: launcher intent-filter not found');
    xml = xml.replace(launcher, '');
    const alias = (name, enabled, icon, round) => `
        <activity-alias
            android:name=".${name}"
            android:enabled="${enabled}"
            android:exported="true"
            android:icon="${icon}"
            android:roundIcon="${round}"
            android:targetActivity=".MainActivity">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity-alias>`;
    const aliases =
      alias('AppIconDefault', true, '@mipmap/ic_launcher', '@mipmap/ic_launcher_round') +
      ALT_ICONS.map((id) => alias(id, false, `@mipmap/ic_launcher_${id.toLowerCase()}`, `@mipmap/ic_launcher_${id.toLowerCase()}`)).join('');
    const end = xml.indexOf('</activity>');
    if (end < 0) throw new Error('AndroidManifest.xml: </activity> not found');
    xml = xml.slice(0, end + '</activity>'.length) + aliases + xml.slice(end + '</activity>'.length);
    writeFileSync(manifest, xml);
    console.log(`android: ${ALT_ICONS.length} alternate icons declared`);
  }
}

// iOS: one app icon set per icon, registered as alternate icons in the build settings.
const catalog = 'ios/App/App/Assets.xcassets';
const pbx = 'ios/App/App.xcodeproj/project.pbxproj';
if (existsSync(catalog) && existsSync(pbx)) {
  for (const id of ALT_ICONS) {
    const dir = `${catalog}/${id}.appiconset`;
    mkdirSync(dir, { recursive: true });
    copyFileSync(`assets/app-icons/ios/${id}.png`, `${dir}/icon.png`);
    writeFileSync(
      `${dir}/Contents.json`,
      JSON.stringify({ images: [{ filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2),
    );
  }
  let proj = readFileSync(pbx, 'utf8');
  if (!proj.includes('ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES')) {
    const anchor = /(\t+)ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;\n/g;
    if (!anchor.test(proj)) throw new Error('project.pbxproj: ASSETCATALOG_COMPILER_APPICON_NAME not found');
    proj = proj.replace(anchor, (line, tabs) => `${line}${tabs}ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "${ALT_ICONS.join(' ')}";\n${tabs}ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = YES;\n`);
    writeFileSync(pbx, proj);
    console.log(`ios: ${ALT_ICONS.length} alternate icons declared`);
  }
}

// CutVid Pad runs on iPad only (TARGETED_DEVICE_FAMILY 2), in every orientation so iPad multitasking works.
if (PAD && existsSync(pbx)) {
  let proj = readFileSync(pbx, 'utf8');
  const before = proj;
  proj = proj.replace(/TARGETED_DEVICE_FAMILY = "?[0-9,]+"?;/g, 'TARGETED_DEVICE_FAMILY = 2;');
  if (proj !== before) {
    writeFileSync(pbx, proj);
    console.log('ios: CutVid Pad targets iPad only');
  }
}
if (PAD && existsSync(plist)) {
  let xml = readFileSync(plist, 'utf8');
  if (!xml.includes('UISupportedInterfaceOrientations~ipad')) {
    const entry = `\t<key>UISupportedInterfaceOrientations~ipad</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t\t<string>UIInterfaceOrientationPortraitUpsideDown</string>\n\t\t<string>UIInterfaceOrientationLandscapeLeft</string>\n\t\t<string>UIInterfaceOrientationLandscapeRight</string>\n\t</array>\n`;
    const end = xml.lastIndexOf('</dict>');
    writeFileSync(plist, xml.slice(0, end) + entry + xml.slice(end));
    console.log('ios: iPad orientations added');
  }
}

// iOS: declare every language CutVid speaks. Without this the app counts as English-only: the web view
// reports English whatever the device language is, and the app has no language option in iOS Settings.
if (existsSync(plist)) {
  let xml = readFileSync(plist, 'utf8');
  if (!xml.includes('CFBundleLocalizations')) {
    const langs = ['en', 'he', 'ar', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'tr', 'hi', 'ja', 'ko', 'zh-Hans'];
    const entry = `\t<key>CFBundleLocalizations</key>\n\t<array>\n${langs.map((l) => `\t\t<string>${l}</string>`).join('\n')}\n\t</array>\n`;
    const end = xml.lastIndexOf('</dict>');
    writeFileSync(plist, xml.slice(0, end) + entry + xml.slice(end));
    console.log(`ios: ${langs.length} languages declared`);
  }
}
