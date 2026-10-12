"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  LoaderCircle,
  AlertCircle,
  ArrowUpRight,
  ShieldCheck,
  Ticket,
  LogOut,
} from "lucide-react";
import { useAuth } from "./Provider";
import {
  isConfigured,
  supabase,
  errorMessage,
} from "@/lib/registration/client";
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`reg-notice ${error ? "reg-notice-error" : ""}`}
    >
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="reg-loading" role="status">
      <LoaderCircle className="animate-spin" size={24} />
      {label}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="reg-empty">{children}</div>;
}
export function QueryState({
  pending,
  error,
  children,
}: {
  pending: boolean;
  error: unknown;
  children: ReactNode;
}) {
  if (pending) return <Loading />;
  if (error) return <Notice error>{errorMessage(error)}</Notice>;
  return <>{children}</>;
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`reg-status reg-status-${value}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="reg-heading">
      <p className="reg-eyebrow">{eyebrow ?? "AIDSL 2026 SUMMIT"}</p>
      <h1>{title}</h1>
      {children && <p className="reg-subtitle">{children}</p>}
    </div>
  );
}
export function ButtonLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link
      className={`reg-button ${secondary ? "reg-button-secondary" : ""}`}
      href={href}
    >
      {children}
      <ArrowUpRight size={16} />
    </Link>
  );
}
export function Guard({
  admin = false,
  offlineTicket = false,
  children,
}: {
  admin?: boolean;
  offlineTicket?: boolean;
  children: ReactNode;
}) {
  const auth = useAuth();
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (isConfigured() && !auth.loading && !auth.session)
      router.replace(admin ? "/admin/login" : "/login");
  }, [admin, auth.loading, auth.session, router]);
  if (!isConfigured())
    return (
      <Notice>Registration is being configured. Please check back soon.</Notice>
    );
  // Only the previously cached QR display can bypass online identity lookup.
  // This never enables admin screens or database writes while offline.
  if (offlineTicket && offline && auth.session) return <>{children}</>;
  if (auth.loading) return <Loading label="Checking your account…" />;
  if (auth.error)
    return (
      <Notice error>
        {errorMessage(auth.error)}{" "}
        <button onClick={() => window.location.reload()}>Retry</button>
      </Notice>
    );
  if (!auth.session) return <Loading label="Opening sign in…" />;
  if (admin && !auth.admin)
    return (
      <Notice error>
        This account does not have admin access.{" "}
        <Link href="/portal">Go to the delegate portal</Link>.
      </Notice>
    );
  if (!admin && !auth.profile)
    return auth.admin ? (
      <ButtonLink href="/admin/dashboard">Open admin dashboard</ButtonLink>
    ) : (
      <Notice error>
        Your delegate profile is unavailable. Please contact the organizers.
      </Notice>
    );
  return <>{children}</>;
}
const delegateNav = [
  ["/portal", "Overview"],
  ["/portal/register-ticket", "Register ticket"],
  ["/portal/merch", "Merchandise"],
  ["/portal/orders", "My orders"],
  ["/portal/ticket", "My ticket"],
  ["/portal/event", "Event info"],
  ["/portal/profile", "My profile"],
];
const adminNav = [
  ["/admin/dashboard", "Dashboard"],
  ["/admin/orders", "Review orders"],
  ["/admin/delegates", "Delegates"],
  ["/admin/merch", "Merchandise"],
  ["/admin/check-in", "Check-in"],
  ["/admin/audit", "Audit log"],
  ["/admin/event-info", "Event info"],
  ["/admin/export", "Exports"],
];
export function PortalShell({
  admin = false,
  pathname,
  children,
}: {
  admin?: boolean;
  pathname: string;
  children: ReactNode;
}) {
  const auth = useAuth();
  return (
    <div className="reg-layout">
      <aside className="reg-sidebar">
        <Link href="/" className="reg-brand">
          AI<span>DRIVEN</span>
          <small>SRI LANKA · 2026</small>
        </Link>
        <div className="reg-space-label">
          {admin ? <ShieldCheck size={16} /> : <Ticket size={16} />}{" "}
          {admin ? "ORGANIZER WORKSPACE" : "DELEGATE PORTAL"}
        </div>
        <nav aria-label={admin ? "Admin navigation" : "Delegate navigation"}>
          {(admin ? adminNav : delegateNav).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={
                pathname === href ||
                (href.endsWith("orders") && pathname.startsWith(href + "/")) ||
                (href.endsWith("delegates") && pathname.startsWith(href + "/"))
                  ? "active"
                  : ""
              }
            >
              {label}
              <ArrowUpRight size={14} />
            </Link>
          ))}
        </nav>
        <div className="reg-sidebar-foot">
          <p>
            {auth.admin?.full_name ?? auth.profile?.full_name ?? "AIDSL 2026"}
          </p>
          <small>
            {auth.profile?.delegate_id ?? "Date & venue to be announced"}
          </small>
          {auth.session && (
            <button
              onClick={async () => {
                const { error } = await supabase().auth.signOut();
                if (error) window.alert(errorMessage(error));
              }}
            >
              <LogOut size={15} /> Sign out
            </button>
          )}
        </div>
      </aside>
      <main className="reg-main">
        <header className="reg-topbar">
          <span>{admin ? "Administration" : "Your summit experience"}</span>
          <Link href="/">
            Back to summit <ArrowUpRight size={14} />
          </Link>
          {auth.session && (
            <button
              className="reg-mobile-signout"
              onClick={async () => {
                const { error } = await supabase().auth.signOut();
                if (error) window.alert(errorMessage(error));
              }}
            >
              Sign out
            </button>
          )}
        </header>
        <div className="reg-page">{children}</div>
      </main>
    </div>
  );
}
