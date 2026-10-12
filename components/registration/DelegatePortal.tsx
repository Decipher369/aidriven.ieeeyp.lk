"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MerchItem, MerchVariant } from "@/lib/registration/database";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import ReactMarkdown from "react-markdown";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Ticket as TicketIcon, ShoppingBag } from "lucide-react";
import { supabase, money, errorMessage } from "@/lib/registration/client";
import { catalog, orderDetail } from "@/lib/registration/data";
import { useAuth } from "./Provider";
import {
  ButtonLink,
  Empty,
  Guard,
  Heading,
  Notice,
  PortalShell,
  QueryState,
  Status,
} from "./ui";
import {
  OrdersTable,
  OrderSummary,
  OrderTimeline,
  PaymentInstructions,
  ReceiptUpload,
  ReviewHistory,
} from "./OrderComponents";
function useOrders() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["orders", auth.session?.user.id],
    queryFn: async () => {
      const result = await supabase()
        .from("order_queue")
        .select("*")
        .order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return result.data;
    },
  });
}
function Overview() {
  const auth = useAuth();
  const orders = useOrders();
  const ticket = useQuery({
    queryKey: ["my-ticket", auth.session?.user.id],
    queryFn: async () => {
      const result = await supabase()
        .from("tickets")
        .select("*")
        .neq("status", "void")
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
  });
  return (
    <>
      <Heading
        title={`Welcome, ${auth.profile?.full_name.split(" ")[0] ?? "delegate"}.`}
      >
        Your summit registration, receipts and ticket, all in one place.
      </Heading>
      <div className="reg-stats">
        <div className="reg-stat">
          <span>Delegate ID</span>
          <strong style={{ fontSize: 26 }}>{auth.profile?.delegate_id}</strong>
          <small>Your registration identity</small>
        </div>
        <div className="reg-stat">
          <span>Ticket status</span>
          <strong style={{ fontSize: 22 }}>
            {ticket.isPending
              ? "Loading…"
              : (ticket.data?.status ?? "No ticket")}
          </strong>
          <small>One pass, one delegate</small>
        </div>
        <div className="reg-stat">
          <span>Event date</span>
          <strong style={{ fontSize: 20 }}>To be announced</strong>
          <small>AIDSL 2026 Summit</small>
        </div>
        <div className="reg-stat">
          <span>Venue</span>
          <strong style={{ fontSize: 20 }}>To be announced</strong>
          <small>Details coming soon</small>
        </div>
      </div>
      {ticket.error && <Notice error>{errorMessage(ticket.error)}</Notice>}
      {orders.data
        ?.filter((order) => order.status === "rejected")
        .map((order) => (
          <Notice key={order.id} error>
            <strong>Your order needs attention.</strong>
            <p>{order.latest_reason}</p>
            <Link
              className="reg-button reg-button-secondary"
              href={`/portal/checkout/${order.id}`}
            >
              Fix & re-upload receipts
            </Link>
          </Notice>
        ))}
      <div className="reg-grid" style={{ marginBottom: 30 }}>
        <section className="reg-card">
          <TicketIcon size={24} color="#ff7442" />
          <h2 style={{ marginTop: 14 }}>Secure your seat</h2>
          <p>
            Choose your pass. IEEE membership is verified with your payment
            receipts after purchase.
          </p>
          <ButtonLink
            href={ticket.data ? "/portal/ticket" : "/portal/register-ticket"}
          >
            {ticket.data ? "View my ticket" : "Choose a pass"}
          </ButtonLink>
        </section>
        <section className="reg-card">
          <ShoppingBag size={24} color="#ff7442" />
          <h2 style={{ marginTop: 14 }}>Make it yours</h2>
          <p>
            Order summit merchandise with your ticket or place a separate order
            anytime.
          </p>
          <ButtonLink href="/portal/merch" secondary>
            Browse merchandise
          </ButtonLink>
        </section>
      </div>
      <h2 style={{ fontSize: 20, marginBottom: 18 }}>Recent orders</h2>
      <QueryState pending={orders.isPending} error={orders.error}>
        <OrdersTable orders={orders.data?.slice(0, 5) ?? []} />
      </QueryState>
    </>
  );
}
function MerchChoice({
  item,
  variants,
  quantities,
  busy,
  onQuantity,
}: {
  item: MerchItem;
  variants: MerchVariant[];
  quantities: Record<string, number>;
  busy: boolean;
  onQuantity: (variant: string, quantity: number) => void;
}) {
  const [variant, setVariant] = useState(variants[0]?.id ?? "");
  return (
    <section className="reg-card">
      <h3>{item.name}</h3>
      <p>{money(item.price)} each</p>
      {!variants.length ? (
        <p>Currently unavailable.</p>
      ) : (
        <div className="reg-form" style={{ marginTop: 16 }}>
          {item.has_sizes && (
            <label>
              Size
              <select
                aria-label={`${item.name} size`}
                value={variant}
                disabled={busy}
                onChange={(e) => setVariant(e.target.value)}
              >
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.size}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Quantity
            <select
              aria-label={`${item.name} ${variants.find((v) => v.id === variant)?.size ?? ""} quantity`}
              value={quantities[variant] ?? 0}
              disabled={busy}
              onChange={(e) => onQuantity(variant, Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4, 5].map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </label>
          {variants
            .filter((v) => (quantities[v.id] ?? 0) > 0)
            .map((v) => (
              <small key={v.id}>
                {v.size ? `Size ${v.size}` : item.name} × {quantities[v.id]}
              </small>
            ))}
        </div>
      )}
    </section>
  );
}
function CatalogPage({ merchOnly = false }: { merchOnly?: boolean }) {
  const router = useRouter();
  const auth = useAuth();
  const cache = useQueryClient();
  const c = useQuery({ queryKey: ["catalog"], queryFn: catalog });
  const tickets = useQuery({
    queryKey: ["my-ticket", auth.session?.user.id],
    queryFn: async () => {
      const result = await supabase()
        .from("tickets")
        .select("*")
        .neq("status", "void")
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
  });
  const [selected, setSelected] = useState("");
  const [number, setNumber] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const type = c.data?.tickets.find((t) => t.id === selected);
  const activeTickets = c.data?.tickets.filter((t) => t.active) ?? [];
  const activeMerch = c.data?.merch.filter((m) => m.active) ?? [];
  const total =
    (type?.price ?? 0) +
    Object.entries(quantities).reduce(
      (sum, [variant, quantity]) =>
        sum +
        quantity *
          (c.data?.merch.find(
            (item) =>
              item.id ===
              c.data?.variants.find((v) => v.id === variant)?.merch_item_id,
          )?.price ?? 0),
      0,
    );
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await supabase().rpc("create_order", {
        p_ticket_type_id: merchOnly ? null : selected || null,
        p_membership_number: type?.requires_membership ? number : null,
        p_merch: Object.entries(quantities)
          .filter(([, qty]) => qty > 0)
          .map(([variant_id, quantity]) => ({ variant_id, quantity })),
      });
      if (result.error) throw result.error;
      await cache.invalidateQueries({ queryKey: ["orders"] });
      await cache.invalidateQueries({ queryKey: ["my-ticket"] });
      router.push(`/portal/checkout/${result.data}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading title={merchOnly ? "Summit merchandise" : "Choose your pass"}>
        {merchOnly
          ? "Place a merchandise order whenever you like."
          : "Your ticket is reserved when you place an order. Pay by bank transfer and submit your receipts."}
      </Heading>
      <QueryState
        pending={c.isPending || tickets.isPending}
        error={c.error || tickets.error}
      >
        {!merchOnly && tickets.data ? (
          <Notice>
            You already have an active ticket.{" "}
            <Link href="/portal/ticket">View your ticket</Link>. You can still
            order merchandise below.
          </Notice>
        ) : (
          !merchOnly && (
            <>
              {!activeTickets.length ? (
                <div className="reg-grid">
                  <section className="reg-card">
                    <span className="reg-chip">IEEE MEMBERS</span>
                    <h2>IEEE Member Pass</h2>
                    <p className="reg-catalog-price">To be announced</p>
                    <p>
                      Price and capacity will be announced soon. Your membership
                      number will be verified with your receipt.
                    </p>
                  </section>
                  <section className="reg-card">
                    <span className="reg-chip">GENERAL ADMISSION</span>
                    <h2>Standard Delegate Pass</h2>
                    <p className="reg-catalog-price">To be announced</p>
                    <p>Price and capacity will be announced soon.</p>
                  </section>
                </div>
              ) : (
                <div className="reg-grid">
                  {activeTickets.map((ticket) => (
                    <label className="reg-card" key={ticket.id}>
                      <span className="reg-chip">
                        {ticket.requires_membership
                          ? "IEEE MEMBERS"
                          : "GENERAL ADMISSION"}
                      </span>
                      <h2>{ticket.name}</h2>
                      <div className="reg-catalog-price">
                        {money(ticket.price)}
                      </div>
                      <span className="reg-checkbox">
                        <input
                          type="radio"
                          name="ticket"
                          checked={selected === ticket.id}
                          onChange={() => setSelected(ticket.id)}
                          disabled={busy}
                        />
                        Select this pass
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {type?.requires_membership && (
                <section className="reg-card" style={{ marginTop: 20 }}>
                  <label>
                    IEEE membership number
                    <input
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="Enter your IEEE membership number"
                      disabled={busy}
                    />
                    <small>
                      We review this with your payment receipts after you place
                      the order.
                    </small>
                  </label>
                </section>
              )}
            </>
          )
        )}
        <h2 style={{ fontSize: 22, margin: "30px 0 18px" }}>
          Merchandise {merchOnly ? "" : "· optional"}
        </h2>
        {!activeMerch.length ? (
          <Empty>Summit merchandise and pricing will be announced soon.</Empty>
        ) : (
          <div className="reg-grid">
            {activeMerch.map((item) => (
              <MerchChoice
                key={item.id}
                item={item}
                variants={c.data!.variants.filter(
                  (v) => v.merch_item_id === item.id && v.active,
                )}
                quantities={quantities}
                busy={busy}
                onQuantity={(variant, quantity) =>
                  setQuantities({ ...quantities, [variant]: quantity })
                }
              />
            ))}
          </div>
        )}
        {error && <Notice error>{error}</Notice>}
        <section className="reg-card" style={{ marginTop: 24 }}>
          <div className="reg-line">
            <div>
              <strong>Estimated total</strong>
              <small>
                Final prices and total are calculated by the server.
              </small>
            </div>
            <strong className="reg-total">{money(total)}</strong>
          </div>
          <button
            className="reg-button"
            onClick={() => void create()}
            disabled={
              busy ||
              (!selected && !Object.values(quantities).some((q) => q > 0)) ||
              (!!type?.requires_membership && !number.trim())
            }
          >
            {busy ? "Placing order…" : "Place order & continue"}
          </button>
        </section>
      </QueryState>
    </>
  );
}
function OrdersPage() {
  const orders = useOrders();
  return (
    <>
      <Heading title="My orders">
        Track every order, receipt submission, and review decision.
      </Heading>
      <QueryState pending={orders.isPending} error={orders.error}>
        <OrdersTable orders={orders.data ?? []} />
      </QueryState>
    </>
  );
}
function OrderPage({
  id,
  checkout = false,
}: {
  id: string;
  checkout?: boolean;
}) {
  const query = useQuery({
    queryKey: ["order", id],
    queryFn: () => orderDetail(id),
  });
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Link href="/portal/orders" className="reg-back">
        <ArrowLeft size={14} />
        All orders
      </Link>
      <Heading
        title={checkout ? "Complete your registration" : "Order details"}
      >
        View your order and every receipt review.
      </Heading>
      <QueryState pending={query.isPending} error={query.error}>
        {query.data && (
          <>
            {query.data.order.status === "rejected" && (
              <Notice error>
                <strong>Your receipts need attention.</strong>
                <p>{query.data.order.latest_reason}</p>
              </Notice>
            )}
            <div className="reg-actions" style={{ margin: "0 0 20px" }}>
              <Status value={query.data.order.status} />
              <span className="reg-order-id">{id}</span>
            </div>
            <div className="reg-grid reg-grid-wide">
              <div className="reg-form">
                <OrderSummary detail={query.data} />
                <ReviewHistory detail={query.data} />
              </div>
              <div className="reg-form">
                <PaymentInstructions detail={query.data} />
                <ReceiptUpload detail={query.data} />
                <OrderTimeline detail={query.data} />
                {query.data.receipts.length === 0 &&
                  ["pending", "rejected"].includes(query.data.order.status) && (
                    <section className="reg-card">
                      <h3>Cancel this order</h3>
                      <p>You can cancel before submitting any receipts.</p>
                      <button
                        className="reg-button reg-button-secondary"
                        disabled={busy}
                        onClick={async () => {
                          const reason = window.prompt(
                            "Why would you like to cancel this order?",
                          );
                          if (!reason?.trim()) return;
                          if (
                            !window.confirm(
                              "Cancel this order? Any reserved seat will be released.",
                            )
                          )
                            return;
                          setBusy(true);
                          try {
                            const result = await supabase().rpc(
                              "cancel_order",
                              { p_order_id: id, p_reason: reason },
                            );
                            if (result.error) throw result.error;
                            await cache.invalidateQueries();
                          } catch (e) {
                            setError(errorMessage(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Cancel order
                      </button>
                      {error && <Notice error>{error}</Notice>}
                    </section>
                  )}
              </div>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(7).max(30),
  institution: z.string().trim().min(2).max(200),
});
function ProfilePage() {
  const auth = useAuth();
  const cache = useQueryClient();
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: auth.profile?.full_name,
      phone: auth.profile?.phone,
      institution: auth.profile?.institution,
    },
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <>
      <Heading title="My profile">
        Keep your delegate details up to date.
      </Heading>
      <section className="reg-card" style={{ maxWidth: 620 }}>
        <div className="reg-line">
          <strong>{auth.profile?.delegate_id}</strong>
          <span>{auth.profile?.email}</span>
        </div>
        <form
          className="reg-form"
          style={{ marginTop: 20 }}
          onSubmit={form.handleSubmit(async (values) => {
            setError("");
            setSaved(false);
            try {
              const result = await supabase()
                .from("profiles")
                .update(values)
                .eq("id", auth.session!.user.id)
                .select("id")
                .single();
              if (result.error) throw result.error;
              setSaved(true);
              await cache.invalidateQueries({ queryKey: ["identity"] });
            } catch (e) {
              setError(errorMessage(e));
            }
          })}
        >
          {(["full_name", "phone", "institution"] as const).map((key) => (
            <label key={key}>
              {key === "full_name"
                ? "Full name"
                : key === "phone"
                  ? "Phone number"
                  : "Institution / organization"}
              <input
                type={key === "phone" ? "tel" : "text"}
                {...form.register(key)}
              />
              <span className="reg-field-error">
                {form.formState.errors[key]?.message}
              </span>
            </label>
          ))}
          {error && <Notice error>{error}</Notice>}
          {saved && <Notice>Profile saved.</Notice>}
          <button className="reg-button" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>
    </>
  );
}
function EventPage() {
  const info = useQuery({
    queryKey: ["event-info"],
    queryFn: async () => {
      const result = await supabase()
        .from("event_info")
        .select("*")
        .eq("published", true)
        .order("slug");
      if (result.error) throw result.error;
      return result.data;
    },
  });
  return (
    <>
      <Heading title="Event information">
        Updates and information from the organizers.
      </Heading>
      <QueryState pending={info.isPending} error={info.error}>
        {!info.data?.length ? (
          <Empty>Event information will be published soon.</Empty>
        ) : (
          <div className="reg-form">
            {info.data.map((page) => (
              <section key={page.id} className="reg-card">
                <h2>{page.title}</h2>
                <div className="reg-markdown">
                  <ReactMarkdown>{page.body}</ReactMarkdown>
                </div>
              </section>
            ))}
          </div>
        )}
      </QueryState>
    </>
  );
}
const cachedTicketSchema = z.object({
  ticket: z.object({
    id: z.string(),
    status: z.enum(["issued", "used"]),
    qr_token: z.string().regex(/^[0-9a-f]{48}$/),
  }),
  name: z.string(),
  delegateId: z.string(),
  pass: z.string(),
});
type CachedTicket = z.infer<typeof cachedTicketSchema>;
function TicketPage() {
  const auth = useAuth();
  const [cached, setCached] = useState<CachedTicket | null>(null);
  const key = `aidsl-ticket:${auth.session!.user.id}`;
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    void navigator.serviceWorker
      .register("/ticket-offline.js")
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        const worker = registration.active ?? registration.waiting;
        worker?.postMessage({
          type: "CACHE_TICKET_SHELL",
          resources: performance
            .getEntriesByType("resource")
            .map((entry) => entry.name),
        });
      })
      .catch(() => {
        /* Screenshots still provide an offline fallback when SW is unavailable. */
      });
  }, []);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = cachedTicketSchema.safeParse(JSON.parse(stored));
        if (parsed.success) setCached(parsed.data);
      }
    } catch {
      /* A corrupted cache never becomes authoritative ticket data. */
    }
  }, [key]);
  const query = useQuery({
    queryKey: ["my-issued-ticket", auth.session?.user.id],
    queryFn: async () => {
      const ticket = await supabase()
        .from("tickets")
        .select("*")
        .neq("status", "void")
        .maybeSingle();
      if (ticket.error) throw ticket.error;
      if (!ticket.data) return null;
      const item = await supabase()
        .from("order_items")
        .select("*")
        .eq("id", ticket.data.order_item_id)
        .single();
      if (item.error) throw item.error;
      return { ticket: ticket.data, item: item.data };
    },
  });
  useEffect(() => {
    if (query.isSuccess && auth.profile) {
      const t = query.data?.ticket;
      if (t?.qr_token && (t.status === "issued" || t.status === "used")) {
        const next = {
          ticket: { id: t.id, status: t.status, qr_token: t.qr_token },
          name: auth.profile.full_name,
          delegateId: auth.profile.delegate_id,
          pass: query.data!.item.display_name,
        };
        setCached(next);
        localStorage.setItem(key, JSON.stringify(next));
      } else {
        setCached(null);
        localStorage.removeItem(key);
      }
    }
  }, [query.isSuccess, query.data, key, auth.profile]);
  const display =
    query.data?.ticket.qr_token &&
    (query.data.ticket.status === "issued" ||
      query.data.ticket.status === "used")
      ? {
          ticket: query.data.ticket,
          name: auth.profile?.full_name ?? cached?.name ?? "Delegate",
          delegateId: auth.profile?.delegate_id ?? cached?.delegateId ?? "",
          pass: query.data.item.display_name,
        }
      : query.error
        ? cached
        : query.fetchStatus === "paused"
          ? cached
          : null;
  return (
    <>
      <Heading title="My summit ticket">
        Have this QR ready at the entrance. Save a screenshot as a backup.
      </Heading>
      {(query.error || query.fetchStatus === "paused") && cached && (
        <Notice>
          You’re viewing a previously saved ticket. Check-in validity is
          verified by the organizer.
        </Notice>
      )}
      {display ? (
        <div className="reg-ticket">
          <div className="reg-ticket-head">
            AIDSL 2026 SUMMIT · DELEGATE PASS
          </div>
          <div className="reg-ticket-body">
            <h2>{display.name}</h2>
            <p>{display.delegateId}</p>
            <div className="reg-ticket-qr">
              <QRCodeSVG
                value={display.ticket.qr_token!}
                size={260}
                level="M"
                marginSize={2}
              />
            </div>
            <strong>{display.pass}</strong>
            <p style={{ fontSize: 12, marginTop: 12 }}>
              DATE & VENUE · TO BE ANNOUNCED
            </p>
          </div>
          <div className="reg-ticket-foot">
            {display.ticket.status === "used"
              ? "Already checked in"
              : "Present at entry · One delegate only"}
          </div>
        </div>
      ) : (
        <QueryState pending={query.isPending} error={query.error}>
          {query.data?.ticket.status === "reserved" ? (
            <Notice>
              Your ticket is reserved. Your QR will appear here after membership
              and payment review.
            </Notice>
          ) : (
            <Empty>
              No issued ticket yet.{" "}
              <Link href="/portal/register-ticket">Choose a pass</Link> to get
              started.
            </Empty>
          )}
        </QueryState>
      )}
    </>
  );
}
export default function DelegatePortal({ segments }: { segments: string[] }) {
  let screen: React.ReactNode;
  const route = segments[0] ?? "";
  if (!route) screen = <Overview />;
  else if (route === "register-ticket") screen = <CatalogPage />;
  else if (route === "merch") screen = <CatalogPage merchOnly />;
  else if (route === "orders")
    screen = segments[1] ? <OrderPage id={segments[1]} /> : <OrdersPage />;
  else if (route === "checkout" && segments[1])
    screen = <OrderPage id={segments[1]} checkout />;
  else if (route === "ticket") screen = <TicketPage />;
  else if (route === "profile") screen = <ProfilePage />;
  else if (route === "event") screen = <EventPage />;
  else screen = <Empty>Page not found.</Empty>;
  return (
    <PortalShell
      pathname={`/portal${segments.length ? "/" + segments.join("/") : ""}`}
    >
      <Guard offlineTicket={route === "ticket"}>{screen}</Guard>
    </PortalShell>
  );
}
