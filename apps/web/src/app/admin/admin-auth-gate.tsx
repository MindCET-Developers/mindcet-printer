"use client";

import { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";

const localDevToken = "printdesk-local-dev-admin";
const localDevEmail = "local-dev@printdesk.local";

type AdminAuthGateProps = {
  children: (token: string, email: string) => ReactNode;
};

export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLocalDevAdmin, setIsLocalDevAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const supabase = createBrowserClient();
  const canUseLocalDevLogin = process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (canUseLocalDevLogin && window.sessionStorage.getItem("printdesk-local-dev-admin") === "true") {
      setIsLocalDevAdmin(true);
    }

    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, [canUseLocalDevLogin, supabase]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase client לא מוגדר. יש למלא NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + "/admin"
      }
    });

    setMessage(error ? error.message : "שלחנו קישור התחברות למייל. אם הוא לא מגיע, השתמש בכניסה מקומית לפיתוח.");
  }

  function signInLocalDev() {
    window.sessionStorage.setItem("printdesk-local-dev-admin", "true");
    setIsLocalDevAdmin(true);
    setMessage("");
  }

  async function signOut() {
    window.sessionStorage.removeItem("printdesk-local-dev-admin");
    setIsLocalDevAdmin(false);
    await supabase?.auth.signOut();
    setSession(null);
  }

  if (isLocalDevAdmin && canUseLocalDevLogin) {
    return (
      <AdminShell email={localDevEmail} onSignOut={signOut}>
        {children(localDevToken, localDevEmail)}
      </AdminShell>
    );
  }

  if (session?.access_token && session.user.email) {
    return (
      <AdminShell email={session.user.email} onSignOut={signOut}>
        {children(session.access_token, session.user.email)}
      </AdminShell>
    );
  }

  return (
    <main className="admin-login-shell">
      <form className="admin-login-card" onSubmit={signIn}>
        <p className="eyebrow">PrintDesk Admin</p>
        <div className="mindcet-lockup login-lockup">
          <img src="https://www.mindcet.org/wp-content/uploads/2022/04/Logo.svg" alt="MindCET" />
          <div>
            <strong>מתחם MindCET - מרחב עבודה</strong>
            <span>ניהול הדפסות</span>
          </div>
        </div>
        <h1>כניסת מנהל</h1>
        <p className="lead">
          כניסה אמיתית מתבצעת דרך Supabase Auth. בפיתוח מקומי אפשר להשתמש בכניסה מקומית כדי לא להיתקע על Magic Link.
        </p>
        <label>
          <span>אימייל מנהל</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>
        <button className="primary-action" type="submit">
          שליחת קישור כניסה
        </button>
        {canUseLocalDevLogin ? (
          <button className="secondary-action full-width-action" type="button" onClick={signInLocalDev}>
            כניסה מקומית לפיתוח
          </button>
        ) : null}
        {message ? <div className="alert">{message}</div> : null}
      </form>
    </main>
  );
}

function AdminShell({ children, email, onSignOut }: { children: ReactNode; email: string; onSignOut: () => void }) {
  return (
    <div className="admin-frame">
      <aside className="admin-sidebar">
        <div>
          <img className="sidebar-logo" src="https://www.mindcet.org/wp-content/uploads/2022/04/Logo.svg" alt="MindCET" />
          <p className="eyebrow">PrintDesk</p>
          <h2>מתחם MindCET - מרחב עבודה</h2>
        </div>
        <nav>
          <Link href="/admin">תור עבודות</Link>
          <Link href="/admin/agents">סוכנים</Link>
          <Link href="/admin/settings">הגדרות</Link>
          <Link href="/">מסך משתמש</Link>
        </nav>
        <div className="admin-user">
          <span>{email}</span>
          <button type="button" onClick={onSignOut}>
            יציאה
          </button>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
