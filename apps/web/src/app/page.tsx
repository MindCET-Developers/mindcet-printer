import Link from "next/link";
import { UploadForm } from "./upload-form";
import { isSupabaseConfigured } from "@/lib/env";
import { readAppSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = isSupabaseConfigured() ? await readAppSettings(createServiceClient()) : null;
  const uploadPasscodeEnabled = Boolean(settings?.upload_passcode_enabled);

  return (
    <main className="public-shell sunny-shell">
      <header className="public-hero sunny-hero">
        <div>
          <div className="mindcet-lockup">
            <img src="https://www.mindcet.org/wp-content/uploads/2022/04/Logo.svg" alt="MindCET" />
            <div>
              <p className="eyebrow">PrintDesk</p>
              <strong>מתחם MindCET - מרחב עבודה</strong>
            </div>
          </div>
          <h1>הדפסת PDF במרחב העבודה</h1>
          <p className="lead">
            העלו קובץ PDF, בחרו העדפות בסיסיות, ועקבו אחרי הסטטוס. מחשב ההדפסה המקומי יאסוף את העבודה מהענן וידפיס אותה.
          </p>
        </div>
        <Link className="admin-link" href="/admin">
          כניסת מנהל
        </Link>
      </header>

      <section className="simple-panel sunny-panel">
        <div className="upload-brand-header">
          <img src="https://www.mindcet.org/wp-content/uploads/2022/04/Logo.svg" alt="MindCET" />
          <div>
            <p className="eyebrow">PrintDesk</p>
            <h2>מתחם MindCET - מרחב עבודה</h2>
            <p>העלאת קובץ PDF להדפסה במדפסת המתחם</p>
          </div>
        </div>
        <UploadForm uploadPasscodeEnabled={uploadPasscodeEnabled} />
      </section>
    </main>
  );
}
