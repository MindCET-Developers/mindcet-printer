"use client";

import { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { debugLog } from "@/lib/debug-log";

const localDevToken = "printdesk-local-dev-admin";
const localDevEmail = "local-dev@printdesk.local";

function parseSupabaseOtpCooldownSeconds(errorMessage: string | undefined) {
  if (!errorMessage) return null;
  const lower = errorMessage.toLowerCase();
  if (!lower.includes("security purposes") || !lower.includes("second")) {
    return null;
  }
  const match = errorMessage.match(/after (\d+)\s*seconds?/i);
  return match ? Number(match[1]) : 10;
}

type AdminAuthGateProps = {
  children: (token: string, email: string) => ReactNode;
};

export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLocalDevAdmin, setIsLocalDevAdmin] = useState(false);
  const [adminCheck, setAdminCheck] = useState<"idle" | "checking" | "allowed" | "denied">("idle");
  const [adminError, setAdminError] = useState("");
  const [email, setEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [message, setMessage] = useState("");
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [cooldownTick, setCooldownTick] = useState(0);
  const supabase = createBrowserClient();
  const canUseLocalDevLogin = process.env.NODE_ENV !== "production";
  const otpCooldownSeconds = Math.max(0, Math.ceil((otpCooldownUntil - Date.now()) / 1000));

  useEffect(() => {
    if (otpCooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      setCooldownTick((value) => value + 1);
      if (Date.now() >= otpCooldownUntil) {
        setOtpCooldownUntil(0);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCooldownUntil]);

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

    if (otpCooldownSeconds > 0) {
      setMessage(`המתינו ${otpCooldownSeconds} שניות לפני שליחה חוזרת.`);
      return;
    }

    if (otpSending) return;

    setOtpSending(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=/admin`;

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo
        }
      });

      const shortCooldownSeconds = parseSupabaseOtpCooldownSeconds(error?.message);
      const rateLimited = Boolean(
        error?.message?.toLowerCase().includes("rate limit") ||
          error?.status === 429 ||
          shortCooldownSeconds !== null
      );

      debugLog("admin-auth-gate.tsx:signInWithOtp", "otp request result", {
        ok: !error,
        errorMessage: error?.message || null,
        errorStatus: error?.status || null,
        rateLimited,
        shortCooldownSeconds,
        redirectHost: new URL(redirectTo).host
      }, "R");

      if (!error) {
        setOtpCooldownUntil(Date.now() + 10_000);
        setMessage("שלחנו קישור התחברות למייל. אחרי הלחיצה תועברו חזרה לאזור המנהל.");
        return;
      }

      if (shortCooldownSeconds) {
        setOtpCooldownUntil(Date.now() + shortCooldownSeconds * 1000);
        setMessage(
          `יש להמתין ${shortCooldownSeconds} שניות בין שליחות (מגבלת אבטחה של Supabase). אפשר גם להתחבר עם קוד גישה למטה.`
        );
        return;
      }

      setMessage(
        rateLimited
          ? "הגעתם למגבלת שליחת מיילים של Supabase. המתינו כ-60 דקות, או התחברו עם קוד גישה למטה (ללא מייל)."
          : error.message
      );
    } finally {
      setOtpSending(false);
    }
  }

  async function signInWithAccessCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase client לא מוגדר.");
      return;
    }

    const response = await fetch("/api/admin/login-with-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), code: accessCode.trim() })
    });
    const payload = await response.json();

    debugLog("admin-auth-gate.tsx:signInWithAccessCode", "access code login result", {
      ok: response.ok,
      status: response.status,
      error: payload.error || null
    }, "R");

    if (!response.ok) {
      if (response.status === 404) {
        setMessage("כניסה עם קוד לא זמינה בשרת עדיין — יש לפרוס את הגרסה העדכנית ל-Netlify.");
        return;
      }
      if (response.status === 503) {
        setMessage("קוד גישה לא מוגדר בשרת. הוסיפו ADMIN_ACCESS_CODE ב-Netlify → Environment variables.");
        return;
      }
      setMessage(payload.error || "כניסה עם קוד גישה נכשלה.");
      return;
    }

    const { error } = await supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("");
    setAccessCode("");
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

  const preferAccessCodeLogin = process.env.NODE_ENV === "production";

  const loginHeader = (
    <>
      <p className="eyebrow">PrintDesk Admin</p>
      <div className="mindcet-lockup login-lockup">
        <img src="https://www.mindcet.org/wp-content/uploads/2022/04/Logo.svg" alt="MindCET" />
        <div>
          <strong>מתחם MindCET - מרחב עבודה</strong>
          <span>ניהול הדפסות</span>
        </div>
      </div>
      <h1>כניסת מנהל</h1>
    </>
  );

  const accessCodeForm = (
    <form
      className={`admin-login-card${preferAccessCodeLogin ? "" : " admin-login-card-spaced"}`}
      onSubmit={signInWithAccessCode}
    >
      {preferAccessCodeLogin ? loginHeader : null}
      <h2>{preferAccessCodeLogin ? "כניסה עם קוד גישה (מומלץ)" : "כניסה עם קוד גישה (ללא מייל)"}</h2>
      <p className="lead">
        ללא שליחת מייל — לא נתקעים במגבלות Supabase. הגדירו <code>ADMIN_ACCESS_CODE</code> ב-Netlify.
      </p>
      <label>
        <span>אימייל מנהל</span>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
      </label>
      <label>
        <span>קוד גישה</span>
        <input
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          type="password"
          autoComplete="current-password"
        />
      </label>
      <button className={preferAccessCodeLogin ? "primary-action" : "secondary-action full-width-action"} type="submit">
        כניסה עם קוד
      </button>
    </form>
  );

  const magicLinkForm = (
    <form
      className={`admin-login-card${preferAccessCodeLogin ? " admin-login-card-spaced" : ""}`}
      onSubmit={signIn}
    >
      {!preferAccessCodeLogin ? loginHeader : null}
      {!preferAccessCodeLogin ? (
        <p className="lead">
          כניסה אמיתית מתבצעת דרך Supabase Auth. בפיתוח מקומי אפשר להשתמש בכניסה מקומית.
        </p>
      ) : (
        <h2>או: קישור במייל (מוגבל)</h2>
      )}
      {preferAccessCodeLogin ? (
        <p className="lead">Supabase מגביל שליחות — מומלץ להשתמש בקוד גישה למעלה.</p>
      ) : null}
      <label>
        <span>אימייל מנהל</span>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
      </label>
      <button
        className={preferAccessCodeLogin ? "secondary-action full-width-action" : "primary-action"}
        type="submit"
        disabled={otpCooldownSeconds > 0 || otpSending}
      >
        {otpSending
          ? "שולחים..."
          : otpCooldownSeconds > 0
            ? `שליחה חוזרת בעוד ${otpCooldownSeconds}s`
            : "שליחת קישור כניסה"}
      </button>
      {canUseLocalDevLogin ? (
        <button className="secondary-action full-width-action" type="button" onClick={signInLocalDev}>
          כניסה מקומית לפיתוח
        </button>
      ) : null}
    </form>
  );

  return (
    <main className="admin-login-shell">
      {preferAccessCodeLogin ? (
        <>
          {accessCodeForm}
          {magicLinkForm}
        </>
      ) : (
        <>
          {magicLinkForm}
          {accessCodeForm}
        </>
      )}
      {message ? <div className="alert admin-login-alert">{message}</div> : null}
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
