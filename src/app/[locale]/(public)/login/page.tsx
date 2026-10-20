"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createBrowserClient } from "@supabase/ssr";

type LoginStep = "email" | "code" | "password";
type PendingAction = "sending" | "verifying" | "password" | "redirecting" | null;

const inputClassName = "block w-full rounded-lg border border-border bg-background px-3 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 sm:text-sm";
const secondaryButtonClassName = "rounded px-2 py-1 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50";

export default function LoginPage() {
  const t = useTranslations("LoginPage");
  const locale = useLocale();
  const router = useRouter();
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const isCoolingDown = cooldown > 0;
  const isPending = pending !== null;

  useEffect(() => {
    if (!isCoolingDown) return;
    const timer = window.setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isCoolingDown]);

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  function changeStep(nextStep: LoginStep) {
    if (isPending) return;
    setError(null);
    setNotice(null);
    setCode("");
    setPassword("");
    setStep(nextStep);
  }

  function finishLogin() {
    setPending("redirecting");
    setNotice(t("signedIn"));
    router.replace(`/${locale}/admin`);
    router.refresh();
  }

  async function requestCode(targetEmail: string) {
    if (isPending || isCoolingDown) return;
    const normalizedEmail = targetEmail.trim().toLowerCase();
    setPending("sending");
    setError(null);
    setNotice(null);
    setCooldown(60);

    try {
      const { error: requestError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
          // Select the email language without changing the staff account metadata.
          emailRedirectTo: `${window.location.origin}/${locale}/admin`,
        },
      });
      if (requestError) throw requestError;

      setEmail(normalizedEmail);
      setOtpEmail(normalizedEmail);
      setCode("");
      setStep("code");
      setNotice(t("codeRequested"));
    } catch {
      setError(t("sendError"));
    } finally {
      setPending(null);
    }
  }

  async function verifyCode() {
    if (isPending) return;
    if (!/^[0-9]{6,10}$/.test(code)) {
      setError(t("codeFormatError"));
      return;
    }
    setPending("verifying");
    setError(null);
    setNotice(null);

    try {
      const { data, error: verificationError } = await supabase.auth.verifyOtp({
        email: otpEmail,
        token: code,
        type: "email",
      });
      if (verificationError || !data.session) {
        setError(t("verifyError"));
        setPending(null);
        return;
      }
      finishLogin();
    } catch {
      setError(t("verifyError"));
      setPending(null);
    }
  }

  async function loginWithPassword() {
    if (isPending) return;
    setPending("password");
    setError(null);
    setNotice(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError || !data.session) {
        setError(t("passwordError"));
        setPending(null);
        return;
      }
      finishLogin();
    } catch {
      setError(t("passwordError"));
      setPending(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "code") await verifyCode();
    else if (step === "password") await loginWithPassword();
    else await requestCode(email);
  }

  const submitLabel = pending === "sending"
    ? t("sending")
    : pending === "verifying" || pending === "password" || pending === "redirecting"
      ? t("signingIn")
      : step === "code"
        ? t("verifyCode")
        : step === "password"
          ? t("signInWithPassword")
          : isCoolingDown
            ? t("waitToSend", { seconds: cooldown })
            : t("sendCode");

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-10">
        <div className="space-y-2 text-center">
          <h1 className="font-heading text-3xl font-extrabold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("restrictedAccess")}</p>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {step === "code"
            ? t("codeDescription", { email: otpEmail })
            : step === "password"
              ? t("passwordDescription")
              : t("emailDescription")}
        </p>

        <form className="space-y-5" onSubmit={handleSubmit} aria-busy={isPending}>
          {step === "code" ? (
            <div className="space-y-2">
              <label htmlFor="login-code" className="block text-sm font-medium text-foreground">{t("codeLabel")}</label>
              <input
                ref={codeInputRef}
                id="login-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={10}
                pattern="[0-9]{6,10}"
                disabled={isPending}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-code-help login-error" : "login-code-help"}
                className={`${inputClassName} text-center font-mono tracking-widest`}
                placeholder={t("codePlaceholder")}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              />
              <p id="login-code-help" className="text-xs text-muted-foreground">{t("codeHelp")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="login-email" className="block text-sm font-medium text-foreground">{t("emailLabel")}</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={isPending}
                className={inputClassName}
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          )}

          {step === "password" && (
            <div className="space-y-2">
              <label htmlFor="login-password" className="block text-sm font-medium text-foreground">{t("passwordLabel")}</label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={isPending}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
                className={inputClassName}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          )}

          <div aria-live="polite" aria-atomic="true">
            {notice && <p role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">{notice}</p>}
          </div>
          {error && <p id="login-error" role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={isPending || (step === "email" && isCoolingDown)}
            className="flex w-full justify-center rounded-lg border border-transparent bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>

          {step === "code" && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" disabled={isPending || isCoolingDown} className={secondaryButtonClassName} onClick={() => requestCode(otpEmail)}>
                {pending === "sending" ? t("sending") : isCoolingDown ? t("resendCountdown", { seconds: cooldown }) : t("resendCode")}
              </button>
              <button type="button" disabled={isPending} className={secondaryButtonClassName} onClick={() => changeStep("email")}>
                {t("changeEmail")}
              </button>
            </div>
          )}
        </form>

        <div className="border-t border-border pt-4 text-center">
          <button type="button" disabled={isPending} className={secondaryButtonClassName} onClick={() => changeStep(step === "password" ? "email" : "password")}>
            {step === "password" ? t("useCode") : t("usePassword")}
          </button>
        </div>
      </div>
    </div>
  );
}
