# PrintDesk

PrintDesk הוא MVP של פורטל Web-to-Print למרחבי עבודה משותפים.

במקום שמשתמשים יתקינו מדפסת על הלפטופ או ישלחו קבצים למנהל המרחב, הם מעלים PDF באתר. מחשב Windows מקומי, שנמצא במרחב העבודה ומחובר למדפסת, מושך עבודות הדפסה מהענן ומדפיס אותן.

הכלל החשוב: הענן לא מתחבר אל המחשב המקומי. הסוכן המקומי יוזם את כל התקשורת החוצה אל Supabase. לא פותחים פורטים בראוטר, לא משתמשים ב-Remote Desktop, ולא חושפים מדפסת לאינטרנט.

## סטטוס נוכחי

בוצע Phase 0 ו-Phase 1:

- מבנה monorepo חדש:
  - `apps/web` - אפליקציית Next.js/TypeScript.
  - `apps/agent` - סוכן הדפסה מקומי Node.js/TypeScript ל-Windows.
  - `supabase/migrations` - סכמת Supabase.
- מיגרציית DB עם:
  - `print_jobs`
  - `print_agents`
  - `app_settings`
  - bucket פרטי בשם `print-files`
  - RLS בסיסי
  - RPC לסטטוס ציבורי לפי token
  - RPC ל-claim אטומי של עבודה
- מנגנון ה-email-to-print הקיים נשאר בשורש הריפו כ-Legacy side feature.

טופס העלאה, דשבורד אדמין וסוכן הדפסה מלא ייבנו בשלבים הבאים.

## מבנה הפרויקט

```txt
.
├── apps
│   ├── web
│   │   ├── src/app
│   │   ├── .env.example
│   │   └── package.json
│   └── agent
│       ├── src
│       ├── .env.example
│       └── package.json
├── supabase
│   └── migrations
│       └── 0001_printdesk_schema.sql
├── app.js / server.js / index.html / style.css
│   └── Legacy AutoPrint email-to-print feature
└── package.json
```

## התקנה מקומית

```bash
npm install
```

אם `package-lock.json` עדיין משקף את הפרויקט הישן, הרצת `npm install` תעדכן אותו למבנה ה-workspaces החדש.

## הרצת אפליקציית ה-Web

```bash
cp apps/web/.env.example apps/web/.env.local
npm run dev:web
```

כתובת מקומית:

```txt
http://localhost:3000
```

בשלב הנוכחי הדף מציג מסך פתיחה בלבד. טופס העלאה בעברית, תצוגת סטטוס, דשבורד אדמין ותצוגה מקדימה להדפסה ייבנו ב-Phase 2/3.

## הרצת הסוכן המקומי

```bash
cp apps/agent/.env.example apps/agent/.env
npm run dev:agent
```

בשלב הנוכחי הסוכן רק טוען ומוודא קונפיג בסיסי. הלולאה שמושכת עבודות ומדפיסה דרך SumatraPDF תיבנה ב-Phase 4.

## משתני סביבה - Web

בקובץ `apps/web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAILS=
MAX_FILE_SIZE_MB=20
MAX_PAGE_COUNT=50
PRINT_UPLOAD_CODE=
```

הערות:

- `SUPABASE_SERVICE_ROLE_KEY` חייב להישאר בצד שרת בלבד.
- `ADMIN_EMAILS` יהיה רשימת מיילים מופרדת בפסיקים, למשל:
  `admin@example.com,ops@example.com`
- `PRINT_UPLOAD_CODE` הוא מנגנון MVP אופציונלי להגבלת העלאות ציבוריות.

## משתני סביבה - Agent

בקובץ `apps/agent/.env`:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PRINTER_NAME=
POLL_INTERVAL_SECONDS=10
AGENT_ID=workspace-main-printer
DOWNLOAD_DIR=./downloads
SUMATRA_PATH=C:\Program Files\SumatraPDF\SumatraPDF.exe
MAX_CONCURRENT_JOBS=1
AGENT_DRY_RUN=true
```

הערות:

- הסוכן משתמש ב-service role key כי הוא תהליך פנימי אמין שרץ על מחשב ההדפסה.
- `AGENT_DRY_RUN=true` ישמש לבדיקות בלי לבזבז נייר.
- ב-MVP צבע/דו-צדדי יישמרו כהעדפות, אבל לא יאכפו במדפסת עד שנוסיף תמיכה אמינה ביכולות מדפסת.

## הקמת Supabase

1. צור פרויקט Supabase.
2. העתק את ה-URL ואת המפתחות ל-env.
3. הרץ את המיגרציה:

```sql
-- Supabase SQL editor
-- הדבק והריץ את תוכן הקובץ:
-- supabase/migrations/0001_printdesk_schema.sql
```

המיגרציה יוצרת:

- טבלת `print_jobs`
- טבלת `print_agents`
- טבלת `app_settings`
- bucket פרטי `print-files`
- RPC:
  - `get_public_job_status(job_id, token)`
  - `claim_next_print_job(agent_id)`
  - `update_job_status(job_id, agent_id, new_status, error_message, agent_log)`

## מודל סטטוסים

```txt
pending      ממתין לאישור אדמין
approved     מוכן לסוכן הדפסה
claimed      הסוכן תפס את העבודה
downloading  הסוכן מוריד את ה-PDF
printing     נשלח להדפסה
printed      הודפס
failed       נכשל
cancelled    בוטל
rejected     נדחה
```

## זרימת MVP מתוכננת

1. משתמש מעלה PDF באתר.
2. השרת בודק שהקובץ הוא PDF, עומד בגודל המותר, ושהמשתמש אישר שהקובץ מוכן להדפסה.
3. השרת יוצר `print_jobs` עם `status_token`.
4. הקובץ נשמר ב-bucket הפרטי `print-files` תחת:

```txt
print-jobs/{job_id}/{sanitized_original_filename}.pdf
```

5. אם `manual_approval_required=true`, העבודה תהיה `pending`.
6. אם `manual_approval_required=false`, העבודה תהיה `approved`.
7. המשתמש מועבר ל:

```txt
/status/{jobId}?token=...
```

8. הסוכן המקומי מושך רק עבודות `approved`.
9. הסוכן מעדכן סטטוס בכל שלב.

## בדיקת Phase 0/1

בדיקות אפשריות עכשיו:

```bash
npm install
npm run dev:web
npm run dev:agent
```

וב-Supabase:

- להריץ את המיגרציה.
- לוודא שהטבלאות נוצרו.
- לוודא ש-`app_settings` כולל הגדרות ראשוניות.
- לוודא שה-bucket `print-files` פרטי.

## מגבלות ידועות בשלב הנוכחי

- עדיין אין טופס העלאה פעיל.
- עדיין אין דשבורד אדמין.
- עדיין אין הורדה/הדפסה בסוכן.
- אין עדיין תצוגה מקדימה של PDF בדפדפן.
- RLS לא משמש כתחליף לבדיקות שרת. פעולות אדמין ב-MVP ייבדקו גם ב-API לפי `ADMIN_EMAILS`.
- הסוכן העתידי יוכל לדעת שפקודת ההדפסה נשלחה בהצלחה, אבל לא תמיד יוכל לדעת אם המדפסת הפיזית נתקעה אחרי שה-spooler קיבל את העבודה.

## Legacy email-to-print

הקבצים הקיימים בשורש נשמרו כיכולת צדדית:

- `server.js`
- `app.js`
- `index.html`
- `style.css`
- `config.json`
- `jobs.json`

הרצה:

```bash
npm run legacy:email-printer
```

או:

```bash
npm start
```

היכולת הזאת לא נמחקה, אבל המוצר הראשי מעכשיו הוא PrintDesk.

## שלבים הבאים

Phase 2:

- ממשק עברי מלא להעלאת PDF.
- תצוגה מקדימה של PDF לפני שליחה אם הדפדפן מאפשר.
- עמוד סטטוס ציבורי עם token.
- דשבורד אדמין, עמוד עבודה, הגדרות וניטור סוכנים.

Phase 3:

- API routes מאובטחים ליצירת עבודות, סטטוס ופעולות אדמין.

Phase 4:

- סוכן Windows מלא עם polling, claim, הורדה, dry-run והדפסה דרך SumatraPDF.
