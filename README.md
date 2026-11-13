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

- **טיימליין רב־שכבתי** – רצועות וידאו/אודיו ללא הגבלה, גרירה, חיתוך קצוות (trim), פיצול, שכפול, הצמדה מגנטית, זום, נעילה/הסתרה/השתקה של רצועות.
- **קומפוזיציה** – מיקום, גודל, סיבוב, שקיפות, היפוך ו‑10 מצבי מיזוג; עריכה ישירה על המסך עם ידיות.
- **קיפריימים** (בסגנון After Effects) לכל מאפייני הטרנספורם, עם עקומות easing.
- **אנימציות כניסה/יציאה** – fade, slide, zoom, spin, wipe, blur.
- **פילטרים ואפקטים** – בהירות, ניגודיות, רוויה, גוון, טשטוש, וינייטה, 10 פריסטים, ו**מסך ירוק (Chroma Key)**.
- **טקסט וכותרות** – עברית מלאה, גופנים, מתאר, רקע, צל, אפקט מכונת כתיבה; צורות.
- **אודיו** – עוצמה, פייד אין/אאוט, מהירות 0.1×–8×, תצוגת waveform.
- **ייצוא MP4 (H.264 + AAC/Opus)** מדויק לפריים דרך WebCodecs, עד 4K ו‑60fps.
- **Undo/Redo**, שמירה אוטומטית במכשיר (IndexedDB), ריבוי פרויקטים, עברית/אנגלית.
- **ענן Supabase** – התחברות, גיבוי פרויקטים ומדיה וסנכרון בין מכשירים.
- **CutVid AI** – עוזר שבונה אנימציות, פתיחים וסרטונים שלמים בטיימליין לפי תיאור, עם ספק ומודל לבחירתכם.

קיצורי מקלדת: `Space` ניגון · `S` פיצול · `Delete` מחיקה · `Ctrl+Z / Ctrl+Shift+Z` · `Ctrl+D` שכפול · `←/→` פריים (עם `Shift` – 10) · `Ctrl+גלגלת` זום.

## פיתוח

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # בנייה ל-dist/
```

## יצירת קבצי האפליקציה

### הדרך הקלה – GitHub Actions

כל push מריץ את `.github/workflows/build.yml` ובונה את כל הפלטפורמות.
ב‑GitHub: **Actions → Build apps → הריצה האחרונה → Artifacts** ומורידים את הקבצים.

דחיפת תג גרסה מפרסמת אותם גם כ‑Release:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

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

1. פותחים פרויקט ב‑[supabase.com](https://supabase.com) (התוכנית החינמית מספיקה).
2. **SQL Editor → New query** – מדביקים את התוכן של [`supabase/schema.sql`](supabase/schema.sql) ומריצים.
   זה יוצר טבלת `projects` עם RLS ובאקט פרטי `media`, כך שכל משתמש רואה רק את הקבצים שלו.
3. **Project Settings → API** – מעתיקים את ה‑`Project URL` ואת מפתח ה‑`anon` / `publishable`.
4. מחברים את האפליקציה באחת משתי דרכים:
   - **בתוך האפליקציה** – כפתור "ענן", מדביקים URL ומפתח. נשמר במכשיר, לא דורש בנייה מחדש.
   - **בזמן הבנייה** – מעתיקים `.env.example` ל‑`.env` וממלאים `VITE_SUPABASE_URL` ו‑`VITE_SUPABASE_ANON_KEY`.
     ב‑GitHub Actions מוסיפים את אותם שני שמות תחת *Settings → Secrets and variables → Actions*.
5. בכפתור "ענן": הרשמה/כניסה עם אימייל וסיסמה → "שמור פרויקט לענן". במכשיר אחר נכנסים לאותו חשבון ולוחצים "פתח".

הערות:

- מפתח ה‑`anon` מיועד לצד הלקוח ובטוח לשיבוץ באפליקציה – ההגנה היא ב‑RLS. **לעולם לא** לשים את מפתח ה‑`service_role` באפליקציה.
- כברירת מחדל Supabase שולח אימייל אימות בהרשמה. לבדיקות אפשר לכבות: *Authentication → Sign In / Providers → Email → Confirm email*.
- בתוכנית החינמית קובץ בודד ב‑Storage מוגבל ל‑50MB (ניתן לשינוי ב‑*Storage → Settings*).

## CutVid AI

לשונית **AI** בספרייה: כותבים מה ליצור ("פתיח של 5 שניות עם הכותרת…", "סדר את הקליפים ברצף עם fade") וה‑AI מוסיף ומעדכן קליפים, קיפריימים, אנימציות ופילטרים. כל תשובה היא צעד Undo אחד.

ה‑AI בונה מטקסט, צורות והמדיה שכבר בפרויקט. הוא **לא** מייצר צילומי וידאו, תמונות או קול חדשים.

### ספק משלכם

1. פותחים את "הגדרות ספק" ובוחרים ספק: Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, Cerebras, Ollama / LM Studio (מקומי), או כל שרת תואם‑OpenAI בכתובת משלכם.
2. מדביקים את ה‑API key ולוחצים **"טען מודלים זמינים"** – הרשימה נמשכת מהספק לפי המפתח.
3. בוחרים מודל ומתחילים לכתוב.

המפתח נשמר במכשיר בלבד (`localStorage`) ונשלח רק לספק שנבחר. באפליקציות (Windows/Mac/iOS/Android) הבקשות יוצאות מחוץ ל‑WebView ולכן כל הספקים עובדים; בגרסת הדפדפן ספק שלא מאפשר קריאות cross‑origin ייחסם על ידי הדפדפן.

### CutVid AI מובנה (בלי מפתח למשתמשים)

הספק "CutVid AI" רץ דרך Supabase Edge Function ([`supabase/functions/cutvid-ai`](supabase/functions/cutvid-ai/index.ts)), כך שהמפתח נשאר בשרת ורק משתמשים מחוברים יכולים לקרוא לו:

```bash
npm i -g supabase && supabase login
supabase link --project-ref <PROJECT_REF>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy cutvid-ai
```

ברירת המחדל היא `claude-opus-5-5`; אפשר להחליף עם `supabase secrets set CUTVID_AI_MODEL=...`. שימו לב שהשימוש מחויב בחשבון ה‑Anthropic שלכם על כל משתמש מחובר – כדאי להוסיף מגבלת שימוש לפני פתיחה לקהל רחב.

## מגבלות ידועות

- הייצוא דורש WebCodecs: Chrome/Edge/Electron/Android WebView, ו‑Safari/iOS 16.4 ומעלה. ב‑iOS ישן מ‑26 אין מקודד אודיו ולכן הקובץ ייצא ללא קול.
- פילטרי צבע נשענים על `CanvasRenderingContext2D.filter`; בגרסאות Safari/iOS שלא תומכות בו הם מדולגים.
- שינוי מהירות משנה גם את גובה הצליל בקובץ המיוצא.
- ה‑AI נבדק מול שרת ספק מדומה (תואם‑OpenAI); החיבור לספקים אמיתיים ופונקציית ה‑Edge לא הורצו מול מפתח אמיתי.
- הייצוא נבדק ב‑Chromium בלבד; העטיפות ל‑iOS/Android/Windows/macOS נבנות ב‑CI ולא נבדקו על מכשירים אמיתיים.

## מבנה

```
src/engine/   render.ts (קומפוזיטור) · player.ts · export.ts · media.ts · keyframes.ts
src/components/  Timeline · Preview · Inspector · Library · דיאלוגים
src/ai/       providers.ts (ספקים ומודלים) · assistant.ts (פרומפט והחלת פעולות) · http.ts
src/lib/      supabase.ts · db.ts (IndexedDB) · save.ts · i18n.ts
electron/     מעטפת דסקטופ        capacitor.config.ts  מעטפת מובייל
supabase/     schema.sql · functions/cutvid-ai
```
