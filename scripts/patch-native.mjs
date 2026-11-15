// Registers the com.cutvid.app:// URL scheme in the generated native projects so that
// Google sign-in and password-reset links can return to the app. Safe to run repeatedly.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SCHEME = 'com.cutvid.app';

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
    const entry = `\t<key>BGTaskSchedulerPermittedIdentifiers</key>\n\t<array>\n\t\t<string>com.cutvid.app.update</string>\n\t</array>\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>fetch</string>\n\t\t<string>processing</string>\n\t</array>\n`;
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
