"use client";

import { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { debugLog } from "@/lib/debug-log";

const localDevToken = "printdesk-local-dev-admin";
const localDevEmail = "local-dev@printdesk.local";

type AdminAuthGateProps = {
  children: (token: string, email: string) => ReactNode;
};

export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLocalDevAdmin, setIsLocalDevAdmin] = useState(false);
  const [adminCheck, setAdminCheck] = useState<"idle" | "checking" | "allowed" | "denied">("idle");
  const [adminError, setAdminError] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const supabase = createBrowserClient();
  const canUseLocalDevLogin = process.env.NODE_ENV !== "production";

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    if (authError) {
      setMessage("ההתחברות מהמייל נכשלה. ודאו שכתובת האתר מוגדרת ב-Supabase תחת Redirect URLs.");
    }

    if (canUseLocalDevLogin && window.sessionStorage.getItem("printdesk-local-dev-admin") === "true") {
      setIsLocalDevAdmin(true);
      setAdminCheck("allowed");
    }

    if (!supabase) return;
    const client = supabase;

    async function hydrateSessionFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (!code) return;

      debugLog("admin-auth-gate.tsx:hydrateSessionFromUrl", "found auth code on admin url", { hasCode: true }, "B,E");
      const { error } = await client.auth.exchangeCodeForSession(code);
      debugLog("admin-auth-gate.tsx:hydrateSessionFromUrl", "exchange on admin result", {
        ok: !error,
        errorMessage: error?.message || null
      }, "B,D,E");

      params.delete("code");
      params.delete("type");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    hydrateSessionFromUrl()
      .catch(() => undefined)
      .finally(() => {
        client.auth.getSession().then(({ data }) => setSession(data.session));
      });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setAdminCheck("idle");
        setAdminError("");
      }
    });

    return () => data.subscription.unsubscribe();
  }, [canUseLocalDevLogin, supabase]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;

    let cancelled = false;
    setAdminCheck("checking");
    setAdminError("");

    fetch("/api/admin/me", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (response) => {
        const payload = await response.json();
        if (cancelled) return;

        debugLog("admin-auth-gate.tsx:admin/me", "admin me response", {
          ok: response.ok,
          status: response.status,
          error: payload.error || null
        }, "C,D");

        if (!response.ok) {
          setAdminCheck("denied");
          setAdminError(payload.error || "אין הרשאת מנהל.");
          return;
        }

        setAdminCheck("allowed");
      })
      .catch(() => {
        if (!cancelled) {
          setAdminCheck("denied");
          setAdminError("לא ניתן לאמת הרשאות מנהל.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase client לא מוגדר. יש למלא NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=/admin`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo
      }
    });

    debugLog("admin-auth-gate.tsx:signInWithOtp", "otp request result", {
      ok: !error,
      errorMessage: error?.message || null,
      redirectHost: new URL(redirectTo).host
    }, "B");

    setMessage(
      error
        ? error.message
        : "שלחנו קישור התחברות למייל. אחרי הלחיצה תועברו חזרה לאזור המנהל. אם הקישור לא עובד, ודאו שכתובת האתר מוגדרת ב-Supabase."
    );
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
    if (adminCheck === "checking" || adminCheck === "idle") {
      return (
        <main className="admin-login-shell">
          <div className="admin-login-card">
            <p className="eyebrow">PrintDesk Admin</p>
            <h1>בודקים הרשאות...</h1>
          </div>
        </main>
      );
    }

    if (adminCheck === "denied") {
      return (
        <main className="admin-login-shell">
          <div className="admin-login-card">
            <p className="eyebrow">PrintDesk Admin</p>
            <h1>אין הרשאת מנהל</h1>
            <p className="lead">
              התחברתם כ-{session.user.email}, אבל המייל לא מוגדר ב-ADMIN_EMAILS בשרת (Netlify).
            </p>
            <div className="alert">{adminError}</div>
            <button className="primary-action" type="button" onClick={signOut}>
              יציאה וניסיון מחדש
            </button>
          </div>
        </main>
      );
    }

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
