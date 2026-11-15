# CutVid

עורך וידאו מקצועי בקוד אחד לכל הפלטפורמות: **iPhone, Android, Windows, macOS** וגם דפדפן (PWA).

| פלטפורמה | עטיפה | קובץ שנוצר |
| --- | --- | --- |
| Windows | Electron | `CutVid-…-setup.exe`, `CutVid-…-portable.exe` |
| macOS | Electron | `CutVid-…-mac-arm64.dmg`, `CutVid-…-mac-x64.dmg` |
| Android | Capacitor | `CutVid-android.apk` |
| iPhone / iPad | Capacitor | `CutVid-ios-unsigned.ipa` |
| Web | PWA | תיקיית `dist/` |

## מה יש בעורך

- **מסך בית** – רשת פרויקטים עם תמונה ממוזערת, יצירת פרויקט לפי יחס מסך (16:9, 9:16, 1:1, 4:5, 4:3, 3:4, 21:9), ובקשה להפעלת התראות.
- **טיימליין רב־שכבתי** – רצועות וידאו/אודיו, גרירה, חיתוך קצוות, פיצול, שכפול, הצמדה מגנטית, זום, נעילה/הסתרה/השתקה.
- **טאבים** – מדיה, טקסט, אלמנטים, אוברליי, אפקטים, מעברים, פילטרים, קיפריימים, AI ועריכה (בטלפון: סרגל נגלל בתחתית).
- **ייבוא** – מהגלריה (תמונות וסרטונים) או מקבצים (כולל אודיו).
- **טקסט** – 16 סגנונות מוכנים, 21 גופנים מובנים (8 תומכים בעברית), מתאר, רקע, צל, **זוהר** בצבע לבחירה, מכונת כתיבה.
- **אלמנטים** – 12 צורות, רקעי גרדיאנט, סטיקרים.
- **אוברליי** – דליפת אור, גווני צבע, וינייטה, פסים קולנועיים, קווי סריקה, גרעין פילם, מסגרת, זרקור ועוד; עם שקיפות ומצב מיזוג.
- **אפקטים** – shake, pulse, wobble, float, zoomPunch, strobe, flash, rgbSplit, glitch, pixelate, mirror, grain, scanlines, hueCycle, ומסך ירוק.
- **מעברים** – 19 אנימציות כניסה/יציאה (fade, slide, zoom, spin, wipe לארבעה כיוונים, iris, flip, bounce, drop, swing, blur).
- **פילטרים** – 14 פריסטים ותשעה מחוונים.
- **קיפריימים וגרפים** – קיפריימים למיקום, גודל, סיבוב ושקיפות; 25 גרפים מוכנים (ease, back, elastic, bounce…) ועורך cubic‑bezier מותאם אישית, לכל הקיפריימים או למקטע הנוכחי.
- **פריסטים בחשבון** – גרפים, פילטרים ואפקטים מותאמים אישית נשמרים לחשבון Supabase (דורש התחברות) וניתנים לניהול ומחיקה.
- **ייצוא MP4** – הרזולוציה (480p–4K), הפריימים והאיכות נבחרים בייצוא; באפליקציות הקובץ נשמר ישירות לגלריה.
- **CutVid AI** – צ'אט שעורך את הטיימליין לפי תיאור ויכול ליצור תמונות חדשות (עם מודל תמונות) ולהניע אותן.
- **סנכרון אוטומטי** – כשמחוברים לחשבון, הפרויקטים מסתנכרנים לבד בין המכשיר לענן: עריכות עולות כמה שניות אחרי שמפסיקים, פרויקטים ממכשירים אחרים מופיעים במסך הבית, ומחיקה מתפשטת לכל המכשירים.
- **פידבק** – טופס באפליקציה ובאתר שנשמר ב‑Supabase.
- **Undo/Redo**, שמירה אוטומטית במכשיר, ענן Supabase, עברית/אנגלית.

קיצורי מקלדת: `Space` ניגון · `S` פיצול · `Delete` מחיקה · `Ctrl+Z / Ctrl+Shift+Z` · `Ctrl+D` שכפול · `←/→` פריים (עם `Shift` – 10) · `Ctrl+גלגלת` זום.

## פיתוח

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # בנייה ל-dist/
```

## יצירת קבצי האפליקציה

### הדרך הקלה – GitHub Actions

כל push מריץ את `.github/workflows/build.yml`, בונה את כל הפלטפורמות ומפרסם דף הורדה.
ב‑GitHub: **Releases → הגרסה העליונה → Assets** ולוחצים על הקובץ הרצוי – הורדה ישירה, בלי ZIP.
(הקבצים זמינים גם תחת Actions → הריצה → Artifacts.) המאגר פרטי, ולכן צריך להיות מחוברים ל‑GitHub כדי להוריד.

### בנייה מקומית

```bash
npm run dist:win      # Windows  → release/*.exe   (להריץ על Windows)
npm run dist:mac      # macOS    → release/*.dmg   (להריץ על Mac)
npm run cap:android   # יוצר android/ → לפתוח ב-Android Studio או: cd android && ./gradlew assembleDebug
npm run cap:ios       # יוצר ios/     → npx cap open ios  (דורש Mac + Xcode)
```

### חתימה והפצה

- **Android** – ה‑APK הוא debug וניתן להתקנה ישירה. ל‑Google Play צריך keystore ו‑`./gradlew bundleRelease`.
- **iOS** – Apple מחייבת חתימה. ה‑IPA מה‑CI **לא חתום**: אפשר להתקין אותו עם AltStore/Sideloadly, או לפתוח את הפרויקט ב‑Xcode עם Apple ID ולהריץ על המכשיר. ל‑App Store/TestFlight דרוש חשבון Apple Developer (99$ לשנה).
- **macOS / Windows** – הקבצים לא חתומים, ולכן תופיע אזהרת Gatekeeper / SmartScreen בפתיחה הראשונה (ב‑Mac: קליק ימני → Open).
- **בלי התקנה בכלל** – מעלים את `dist/` לכל אחסון סטטי (Vercel, Netlify, Supabase Storage…) וב‑iPhone/Android בוחרים "הוסף למסך הבית".

## חיבור Supabase

### 1. מסד הנתונים

- **עם תוסף ה‑GitHub של Supabase** (Project Settings → Integrations → GitHub): התיקייה `supabase/` במאגר מכילה את `config.toml` ואת [`migrations/`](supabase/migrations). אחרי מיזוג לענף הראשי התוסף מריץ את המיגרציות ופורס את פונקציית ה‑AI אוטומטית. ודאו שב‑"Supabase directory" כתוב `supabase` וש‑"Deploy to production" פעיל.
- **ידנית**: SQL Editor → New query → מדביקים את [`supabase/migrations/20261114000000_init.sql`](supabase/migrations/20261114000000_init.sql) ומריצים.

המיגרציה יוצרת טבלת `projects` עם RLS ובאקט פרטי `media`, כך שכל משתמש רואה רק את הקבצים שלו.

### 2. חיבור האפליקציה

**Project Settings → API** – מעתיקים את ה‑`Project URL` ואת מפתח ה‑`anon` / `publishable`, ואז:

- **בתוך האפליקציה** – כפתור Cloud, מדביקים URL ומפתח. נשמר במכשיר.
- **מובנה בבנייה** – ב‑GitHub: *Settings → Secrets and variables → Actions* מוסיפים `VITE_SUPABASE_URL` ו‑`VITE_SUPABASE_ANON_KEY` (מקומית: `.env` לפי `.env.example`).

מפתח ה‑`anon` בטוח לצד הלקוח – ההגנה היא ב‑RLS. **לעולם לא** לשים את `service_role` באפליקציה.

### 3. כתובות חזרה (חובה ל‑Google ולאיפוס סיסמה)

**Authentication → URL Configuration → Redirect URLs** – מוסיפים:

| כתובת | בשביל |
| --- | --- |
| `com.cutvid.app://auth` | iPhone / Android |
| `http://127.0.0.1:47823/callback` | Windows / macOS |
| כתובת האתר שלכם (למשל `https://cutvid.example.com/`) | גרסת הדפדפן |

### האתר (cutvid.vercel.app)

האתר הוא דף נחיתה בלבד – מידע על האפליקציה, קישורי הורדה, הוראות התקנה וטופס פידבק – ולא כולל את העורך. המקור בתיקייה [`site/`](site); Vercel מעתיק אותה יחד עם `public/auth.html` ו‑`public/version.json` (ראו `vercel.json`).

כפתורי ההורדה מפנים ל‑`releases/latest/download/<קובץ>` ב‑GitHub, כך שהם תמיד מורידים את הבנייה האחרונה. **כל עוד המאגר פרטי, ההורדה עובדת רק למי שמחובר ל‑GitHub עם גישה למאגר.** כדי שכל אחד יוכל להוריד צריך להפוך את המאגר לציבורי (או לארח את הקבצים במקום ציבורי אחר).

### דף חזרה לאפליקציה

כשגרסת הדפדפן מתארחת בכתובת ציבורית, הדף [`/auth.html`](public/auth.html) משמש גשר: אחרי התחברות עם Google או לחיצה על קישור במייל, הדפדפן מגיע לדף ממותג "Returning to CutVid" שמחזיר את התוצאה לאפליקציה (`?to=app` למובייל, `?to=desktop` למחשב) ומציג כפתור **Open CutVid** אם המעבר האוטומטי נחסם.

1. מארחים את `dist/` (למשל ב‑Vercel) ומקבלים כתובת, נניח `https://cutvid.example.com`.
2. ב‑GitHub: *Settings → Secrets and variables → Actions → Variables* מוסיפים `VITE_SITE_URL` עם הכתובת, ובונים מחדש.
3. ב‑Supabase: מוסיפים ל‑Redirect URLs את `https://cutvid.example.com/**`, ומגדירים אותה גם כ‑**Site URL**.

בלי `VITE_SITE_URL` האפליקציות חוזרות ישירות דרך `com.cutvid.app://auth` / הכתובת המקומית, כמו קודם.

### 4. התחברות עם Google

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **OAuth consent screen** – ממלאים שם אפליקציה ואימייל.
2. **Credentials → Create credentials → OAuth client ID** מסוג **Web application**.
3. תחת *Authorized redirect URIs* מוסיפים: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
4. ב‑Supabase: **Authentication → Sign In / Providers → Google** – מפעילים ומדביקים את ה‑Client ID וה‑Client Secret.

באפליקציה: Cloud → **Continue with Google**. במובייל ובדסקטופ ההתחברות נפתחת בדפדפן המערכת וחוזרת לאפליקציה.

### 5. SMTP (אימיילים של אימות ואיפוס סיסמה)

שרת המייל המובנה של Supabase מוגבל לכמה הודעות בשעה ורק לכתובות של חברי הצוות, ולכן לשימוש אמיתי מחברים SMTP משלכם:

1. פותחים חשבון אצל ספק מיילים (Resend, Brevo, SendGrid, Mailgun, Amazon SES…) ומאמתים דומיין שולח.
2. ב‑Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP** וממלאים Host, Port, Username, Password, כתובת שולח ושם שולח לפי הספק (ב‑Resend למשל: `smtp.resend.com`, פורט `465`, משתמש `resend`, והסיסמה היא ה‑API key).
3. שומרים, ואז ב‑**Authentication → Rate Limits** מעלים את מגבלת המיילים לשעה לפי הצורך.

### 6. קישור בהרשמה וקוד בהתחברות

האפליקציה שולחת **קישור אימות בהרשמה** ו**קוד חד‑פעמי בהתחברות** (אחרי סיסמה נכונה). כדי שזה יעבוד:

1. **Authentication → Sign In / Providers → Email** – מפעילים **Confirm email**.
2. **Authentication → Emails → Templates** – מדביקים את התבניות המוכנות מהתיקייה [`supabase/templates/`](supabase/templates) (בתצוגת *Source*), עם הנושאים שבטבלה שם. החשובה ביותר היא **Magic Link** ← `magic_link.html`: היא מציגה את הקוד (`{{ .Token }}`); בלעדיה Supabase ישלח קישור במקום קוד.
3. באותו מסך של Email אפשר לקבוע את אורך הקוד (6–10 ספרות) ואת תוקפו.

הקוד בהתחברות נאכף באפליקציה ולא בשרת – זו שכבת אימות נוספת, לא MFA מלא. התחברות עם Google לא דורשת קוד.

אחרי זה הרשמה באימייל שולחת מייל אימות, ו‑**Forgot password?** שולח קישור איפוס שחוזר לאפליקציה ומבקש סיסמה חדשה (בדסקטופ צריך לפתוח את הקישור באותו מחשב בתוך 15 דקות).

בתוכנית החינמית קובץ בודד ב‑Storage מוגבל ל‑50MB (ניתן לשינוי ב‑*Storage → Settings*).

## CutVid AI

לשונית **AI** בספרייה: כותבים מה ליצור ("פתיח של 5 שניות עם הכותרת…", "סדר את הקליפים ברצף עם fade") וה‑AI מוסיף ומעדכן קליפים, קיפריימים, אנימציות ופילטרים. כל תשובה היא צעד Undo אחד.

ה‑AI בונה מטקסט, צורות והמדיה שכבר בפרויקט. הוא **לא** מייצר צילומי וידאו, תמונות או קול חדשים.

### ספק משלכם

1. פותחים את "הגדרות ספק" ובוחרים ספק: Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, Cerebras, Ollama / LM Studio (מקומי), או כל שרת תואם‑OpenAI בכתובת משלכם.
2. מדביקים את ה‑API key ולוחצים **"טען מודלים זמינים"** – הרשימה נמשכת מהספק לפי המפתח.
3. בוחרים מודל ומתחילים לכתוב.

המפתח נשמר במכשיר בלבד (`localStorage`) ונשלח רק לספק שנבחר. באפליקציות (Windows/Mac/iOS/Android) הבקשות יוצאות מחוץ ל‑WebView ולכן כל הספקים עובדים; בגרסת הדפדפן ספק שלא מאפשר קריאות cross‑origin ייחסם על ידי הדפדפן.

### CutVid AI מובנה (בלי מפתח למשתמשים)

הספק "CutVid AI" (ברירת המחדל) רץ דרך Supabase Edge Function ([`supabase/functions/cutvid-ai`](supabase/functions/cutvid-ai/index.ts)), כך שהמפתח נשאר בשרת ורק משתמשים מחוברים יכולים לקרוא לו. הפונקציה פרוסה; כדי שתענה צריך להוסיף מפתח של ספק AI ב‑Supabase → **Edge Functions → Secrets**, באחת משתי דרכים:

| אפשרות | Secrets |
| --- | --- |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` (ואופציונלית `CUTVID_AI_MODEL`, ברירת מחדל `claude-opus-5-5`) |
| כל ספק תואם‑OpenAI (כולל כאלה עם שכבה חינמית) | `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` |

**תמונות (לא חובה):** מוסיפים גם `AI_IMAGE_MODEL` (מזהה של מודל תמונות אצל ספק תואם‑OpenAI), ואם ספק התמונות שונה מספק הצ'אט גם `AI_IMAGE_API_KEY` ו‑`AI_IMAGE_BASE_URL`. יצירת וידאו גנרטיבי אינה נתמכת.

השימוש מחויב בחשבון הספק שלכם על כל משתמש מחובר – כדאי להגביל שימוש לפני פתיחה לקהל רחב.

### פידבק

טופס הפידבק שומר לטבלת `feedback`. כולם יכולים לשלוח, אף אחד לא יכול לקרוא דרך ה‑API; צופים בו ב‑Supabase → **Table Editor → feedback**.

## מגבלות ידועות

- הייצוא דורש WebCodecs: Chrome/Edge/Electron/Android WebView, ו‑Safari/iOS 16.4 ומעלה. ב‑iOS ישן מ‑26 אין מקודד אודיו ולכן הקובץ ייצא ללא קול.
- פילטרי צבע נשענים על `CanvasRenderingContext2D.filter`; בגרסאות Safari/iOS שלא תומכות בו הם מדולגים.
- התראות: האפליקציה מבקשת הרשאה ושולחת התראה מקומית בסיום ייצוא וכשיש גרסה חדשה (בדיקה בפתיחת האפליקציה). התראות Push אמיתיות כשהאפליקציה סגורה דורשות חשבון מפתח של Apple/Firebase ואינן כלולות.
- שמירה לגלריה, ייבוא ב‑iOS והתראות לא נבדקו על מכשיר אמיתי.
- שינוי מהירות משנה גם את גובה הצליל בקובץ המיוצא.
- התחברות עם Google ואיפוס סיסמה נבדקו רק עד שלב ההפניה ל‑Supabase; הזרימה המלאה (כולל החזרה לאפליקציה במובייל ובדסקטופ) לא הורצה מול פרויקט אמיתי.
- הסנכרון האוטומטי ויצירת התמונות נבדקו מול שרתים מדומים בלבד.
- ה‑AI נבדק מול שרת ספק מדומה (תואם‑OpenAI); החיבור לספקים אמיתיים ופונקציית ה‑Edge לא הורצו מול מפתח אמיתי.
- הייצוא נבדק ב‑Chromium בלבד; העטיפות ל‑iOS/Android/Windows/macOS נבנות ב‑CI ולא נבדקו על מכשירים אמיתיים.

## מבנה

```
src/engine/   render.ts (קומפוזיטור) · player.ts · export.ts · media.ts · keyframes.ts
src/components/  Timeline · Preview · Inspector · Library · דיאלוגים
src/ai/       providers.ts (ספקים ומודלים) · assistant.ts (פרומפט והחלת פעולות) · http.ts
src/lib/      supabase.ts · db.ts (IndexedDB) · save.ts · i18n.ts
electron/     מעטפת דסקטופ        capacitor.config.ts  מעטפת מובייל
supabase/     config.toml · migrations/ · functions/cutvid-ai
scripts/      patch-native.mjs (רישום com.cutvid.app:// באנדרואיד וב‑iOS)
```
