import Link from "next/link";
import { UploadForm } from "./upload-form";

export default function HomePage() {
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
        <UploadForm />
      </section>
    </main>
  );
}
