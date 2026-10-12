"use client";
import Link from "next/link";
import Script from "next/script";
import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowUpRight, ShieldCheck, LoaderCircle } from "lucide-react";
import {
  isConfigured,
  supabase,
  errorMessage,
} from "@/lib/registration/client";
import { Heading, Notice, Loading } from "./ui";
import { useAuth } from "./Provider";
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          theme: string;
        },
      ) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}
const registrationSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(150),
  email: z.email("Enter a valid email").max(254),
  phone: z.string().trim().min(7, "Enter your phone number").max(30),
  institution: z
    .string()
    .trim()
    .min(2, "Enter your institution or organization")
    .max(200),
});
const loginSchema = z.object({
  username: z.string().trim().min(3, "Enter your email or admin login"),
  password: z.string().min(1, "Enter your password"),
});
const passwordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });
const emailSchema = z.object({ email: z.email("Enter a valid email") });
function AuthFrame({
  admin = false,
  children,
}: {
  admin?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="reg-auth">
      <section className="reg-auth-art">
        <Link href="/" className="reg-brand">
          AI<span>DRIVEN</span>
          <small>SRI LANKA · 2026</small>
        </Link>
        <div>
          <p className="reg-eyebrow">
            {admin ? "ORGANIZER WORKSPACE" : "AIDSL 2026 SUMMIT"}
          </p>
          <h2>
            {admin ? (
              <>
                Behind every
                <br />
                great <span>gathering.</span>
              </>
            ) : (
              <>
                The AI future
                <br />
                starts <span>with you.</span>
              </>
            )}
          </h2>
          <p>
            {admin
              ? "Review registrations, welcome delegates, and keep every detail in one place."
              : "Your place to register, manage your order, and get ready for the summit."}
          </p>
        </div>
        <p style={{ fontSize: 12 }}>DATE & VENUE · TO BE ANNOUNCED</p>
      </section>
      <main className="reg-auth-panel">
        <div className="reg-auth-content">
          {children}
          <div className="reg-auth-links">
            <Link href="/">← Back to summit</Link>
            {!admin && (
              <Link href="/admin/login">
                Organizer sign in{" "}
                <ArrowUpRight size={12} style={{ display: "inline" }} />
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
function ConfigurationNotice() {
  return !isConfigured() ? (
    <Notice>Registration is being configured. Please check back soon.</Notice>
  ) : null;
}
export function RegisterPage() {
  const form = useForm<z.infer<typeof registrationSchema>>({
    resolver: zodResolver(registrationSchema),
  });
  const [captcha, setCaptcha] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const node = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const renderCaptcha = () => {
    if (node.current && window.turnstile && siteKey && !widget.current)
      widget.current = window.turnstile.render(node.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: setCaptcha,
        "expired-callback": () => setCaptcha(""),
        "error-callback": () => {
          setCaptcha("");
          setError(
            "Could not load verification. Please refresh and try again.",
          );
        },
      });
  };
  useEffect(
    () => () => {
      if (widget.current) window.turnstile?.remove(widget.current);
    },
    [],
  );
  return (
    <AuthFrame>
      <Heading title="Join the summit">
        Create your delegate account. We’ll email you a secure link to set your
        password.
      </Heading>
      <ConfigurationNotice />
      {success ? (
        <Notice>
          If registration is available for this email, you’ll receive a setup
          link shortly. Check your inbox and spam folder.
        </Notice>
      ) : (
        <form
          className="reg-form"
          onSubmit={form.handleSubmit(async (values) => {
            setError("");
            try {
              const result = await supabase().functions.invoke(
                "register-delegate",
                { body: { ...values, captcha_token: captcha } },
              );
              if (result.error) throw result.error;
              setSuccess(true);
            } catch (e) {
              setError(errorMessage(e));
              window.turnstile?.reset(widget.current ?? undefined);
              setCaptcha("");
            }
          })}
        >
          <label>
            Full name
            <input autoComplete="name" {...form.register("full_name")} />
            {form.formState.errors.full_name && (
              <span className="reg-field-error">
                {form.formState.errors.full_name.message}
              </span>
            )}
          </label>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <span className="reg-field-error">
                {form.formState.errors.email.message}
              </span>
            )}
          </label>
          <label>
            Phone number
            <input type="tel" autoComplete="tel" {...form.register("phone")} />
            {form.formState.errors.phone && (
              <span className="reg-field-error">
                {form.formState.errors.phone.message}
              </span>
            )}
          </label>
          <label>
            Institution / organization
            <input
              autoComplete="organization"
              {...form.register("institution")}
            />
            {form.formState.errors.institution && (
              <span className="reg-field-error">
                {form.formState.errors.institution.message}
              </span>
            )}
          </label>
          {siteKey ? (
            <>
              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                onReady={renderCaptcha}
                onError={() =>
                  setError(
                    "Verification is unavailable. Please refresh and try again.",
                  )
                }
              />
              <div ref={node} />
            </>
          ) : (
            isConfigured() && (
              <Notice>
                Registration verification is being configured. Please try again
                soon.
              </Notice>
            )
          )}
          {error && <Notice error>{error}</Notice>}
          <button
            className="reg-button"
            disabled={
              !isConfigured() || !captcha || form.formState.isSubmitting
            }
          >
            {form.formState.isSubmitting ? (
              <>
                <LoaderCircle size={16} className="animate-spin" /> Sending
                setup link…
              </>
            ) : (
              <>
                Create delegate account <ArrowUpRight size={16} />
              </>
            )}
          </button>
          <p className="reg-muted" style={{ fontSize: 12 }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "#ffac8d" }}>
              Sign in
            </Link>
          </p>
        </form>
      )}
    </AuthFrame>
  );
}
function AuthCaptcha({
  onToken,
  onError,
}: {
  onToken: (token: string) => void;
  onError: (message: string) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const render = () => {
    if (node.current && window.turnstile && siteKey && !widget.current)
      widget.current = window.turnstile.render(node.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => {
          onToken("");
          onError("Verification failed. Please refresh and try again.");
        },
      });
  };
  useEffect(
    () => () => {
      if (widget.current) window.turnstile?.remove(widget.current);
    },
    [],
  );
  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={render}
        onError={() =>
          onError("Verification is unavailable. Please refresh and try again.")
        }
      />
      <div ref={node} />
    </>
  );
}
export function LoginPage({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const needsCaptcha = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  return (
    <AuthFrame admin={admin}>
      <Heading
        eyebrow={admin ? "RESTRICTED ACCESS" : undefined}
        title={admin ? "Admin sign in" : "Welcome back"}
      >
        {admin
          ? "Sign in with your organizer account."
          : "Sign in to manage your registration and view your ticket."}
      </Heading>
      {admin && (
        <p className="reg-chip">
          <ShieldCheck
            size={12}
            style={{ display: "inline", marginRight: 5 }}
          />{" "}
          Organizer accounts only
        </p>
      )}
      <ConfigurationNotice />
      <form
        className="reg-form"
        onSubmit={form.handleSubmit(async (values) => {
          setError("");
          try {
            let email = values.username;
            if (admin && email.toLowerCase() === "admin@aidriven") {
              email = process.env.NEXT_PUBLIC_ADMIN_ACCOUNT_EMAIL ?? "";
              if (!email)
                throw new Error(
                  "The organizer account is being configured. Please try again soon.",
                );
            }
            if (!z.email().safeParse(email).success)
              throw new Error("Enter a valid email address.");
            const result = await supabase().auth.signInWithPassword({
              email,
              password: values.password,
              options: { captchaToken: captcha || undefined },
            });
            if (result.error) throw result.error;
            const role = await supabase().rpc("is_admin");
            if (role.error) throw role.error;
            if (admin && !role.data) {
              await supabase().auth.signOut();
              throw new Error("This account does not have organizer access.");
            }
            router.replace(role.data ? "/admin/dashboard" : "/portal");
          } catch (e) {
            setError(errorMessage(e));
            setCaptcha("");
            setCaptchaReset((value) => value + 1);
          }
        })}
      >
        <label>
          {admin ? "Admin login or email" : "Email address"}
          <input
            type={admin ? "text" : "email"}
            autoComplete="username"
            placeholder={admin ? "admin@aidriven" : "you@example.com"}
            {...form.register("username")}
          />
          <span className="reg-field-error">
            {form.formState.errors.username?.message}
          </span>
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
          <span className="reg-field-error">
            {form.formState.errors.password?.message}
          </span>
        </label>
        <AuthCaptcha
          key={captchaReset}
          onToken={setCaptcha}
          onError={setError}
        />
        {error && <Notice error>{error}</Notice>}
        <button
          className="reg-button"
          disabled={
            !isConfigured() ||
            (needsCaptcha && !captcha) ||
            form.formState.isSubmitting
          }
        >
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          <ArrowUpRight size={16} />
        </button>
      </form>
      <div className="reg-auth-links">
        <Link href="/forgot-password">Forgot password?</Link>
        {!admin && <Link href="/register">Create an account</Link>}
      </div>
    </AuthFrame>
  );
}
export function ForgotPasswordPage() {
  const form = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const needsCaptcha = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  return (
    <AuthFrame>
      <Heading title="Reset your password">
        We’ll send a secure reset link to your email.
      </Heading>
      <ConfigurationNotice />
      {success ? (
        <Notice>
          If an account exists for this email, a reset link will arrive shortly.
        </Notice>
      ) : (
        <form
          className="reg-form"
          onSubmit={form.handleSubmit(async (value) => {
            setError("");
            try {
              const result = await supabase().auth.resetPasswordForEmail(
                value.email,
                {
                  redirectTo: window.location.origin + "/reset-password",
                  captchaToken: captcha || undefined,
                },
              );
              if (result.error) throw result.error;
              setSuccess(true);
            } catch (e) {
              setError(errorMessage(e));
              setCaptcha("");
              setCaptchaReset((value) => value + 1);
            }
          })}
        >
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              {...form.register("email")}
            />
            <span className="reg-field-error">
              {form.formState.errors.email?.message}
            </span>
          </label>
          <AuthCaptcha
            key={captchaReset}
            onToken={setCaptcha}
            onError={setError}
          />
          {error && <Notice error>{error}</Notice>}
          <button
            className="reg-button"
            disabled={
              !isConfigured() ||
              (needsCaptcha && !captcha) ||
              form.formState.isSubmitting
            }
          >
            {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <div className="reg-auth-links">
        <Link href="/login">Back to sign in</Link>
      </div>
    </AuthFrame>
  );
}
export function SetPasswordPage({ reset = false }: { reset?: boolean }) {
  const auth = useAuth();
  const router = useRouter();
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
  });
  const [error, setError] = useState("");
  return (
    <AuthFrame>
      <Heading title={reset ? "Choose a new password" : "Set your password"}>
        Use at least 8 characters to secure your account.
      </Heading>
      <ConfigurationNotice />
      {auth.loading ? (
        <Loading label="Checking your link…" />
      ) : !auth.session && isConfigured() ? (
        <Notice error>
          This link is invalid or has expired.{" "}
          <Link href="/forgot-password">Request a new password link</Link>.
        </Notice>
      ) : (
        <form
          className="reg-form"
          onSubmit={form.handleSubmit(async (value) => {
            setError("");
            try {
              const result = await supabase().auth.updateUser({
                password: value.password,
              });
              if (result.error) throw result.error;
              router.replace(auth.admin ? "/admin/dashboard" : "/portal");
            } catch (e) {
              setError(errorMessage(e));
            }
          })}
        >
          <label>
            {reset ? "New password" : "Password"}
            <input
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
            <span className="reg-field-error">
              {form.formState.errors.password?.message}
            </span>
          </label>
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              {...form.register("confirm")}
            />
            <span className="reg-field-error">
              {form.formState.errors.confirm?.message}
            </span>
          </label>
          {error && <Notice error>{error}</Notice>}
          <button
            className="reg-button"
            disabled={!auth.session || form.formState.isSubmitting}
          >
            {form.formState.isSubmitting
              ? "Saving…"
              : "Save password & continue"}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
