"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Download, Camera, ShieldCheck } from "lucide-react";
import {
  supabase,
  date,
  downloadCsv,
  errorMessage,
} from "@/lib/registration/client";
import { catalog, orderDetail, exportRows } from "@/lib/registration/data";
import type { AuditEntry } from "@/lib/registration/database";
import { LoginPage } from "./AuthPages";
import {
  Empty,
  Guard,
  Heading,
  Notice,
  PortalShell,
  QueryState,
  Status,
} from "./ui";
import { OrdersTable, OrderSummary, ReviewHistory } from "./OrderComponents";
const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((module) => module.Scanner),
  { ssr: false },
);
const PAGE_SIZE = 20;
function searchTerm(value: string) {
  return `"%${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "\\%").replaceAll("_", "\\_")}%"`;
}
function Pager({
  page,
  setPage,
  count,
}: {
  page: number;
  setPage: (page: number) => void;
  count: number;
}) {
  return (
    <div className="reg-pagination">
      <span>
        {count
          ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, count)} of ${count}`
          : "0 results"}
      </span>
      <div className="reg-actions" style={{ margin: 0 }}>
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          ← Previous
        </button>
        <button
          disabled={(page + 1) * PAGE_SIZE >= count}
          onClick={() => setPage(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
function ExportButton({
  table,
  label,
  confirmed = false,
}: {
  table: Parameters<typeof exportRows>[0];
  label?: string;
  confirmed?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="reg-button reg-button-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const rows = await exportRows(table, confirmed);
            if (!rows.length)
              throw new Error("No records are available to export.");
            downloadCsv(
              `aidsl-${table}-${new Date().toISOString().slice(0, 10)}`,
              rows,
            );
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={16} />
        {busy ? "Exporting…" : (label ?? "Export CSV")}
      </button>
      {error && <Notice error>{error}</Notice>}
    </>
  );
}
function Dashboard() {
  const q = useQuery({
    queryKey: ["admin-dashboard"],
    refetchInterval: 30000,
    queryFn: async () => {
      const [queue, tickets, c] = await Promise.all([
        supabase()
          .from("order_queue")
          .select("*", { count: "exact" })
          .eq("status", "pending")
          .gt("pending_receipts", 0)
          .order("created_at")
          .limit(5),
        exportRows("tickets"),
        catalog(),
      ]);
      if (queue.error) throw queue.error;
      const activeTypes = c.tickets.filter((t) => t.active);
      const allocated = tickets.filter(
        (t) =>
          t.status !== "void" &&
          activeTypes.some((type) => type.id === t.ticket_type_id),
      ).length;
      return {
        queue: queue.data,
        reviewCount: queue.count ?? 0,
        confirmed: tickets.filter(
          (t) => t.status === "issued" || t.status === "used",
        ).length,
        used: tickets.filter((t) => t.status === "used").length,
        capacity:
          activeTypes.reduce((sum, t) => sum + t.capacity, 0) - allocated,
        types: activeTypes,
      };
    },
  });
  return (
    <>
      <Heading eyebrow="ORGANIZER WORKSPACE" title="Registration overview">
        A clear view of your delegates, payments and available seats.
      </Heading>
      <QueryState pending={q.isPending} error={q.error}>
        {q.data && (
          <>
            <div className="reg-stats">
              {[
                [
                  "Pending review",
                  q.data.reviewCount,
                  "Receipt packages awaiting a decision",
                ],
                [
                  "Confirmed tickets",
                  q.data.confirmed,
                  "Issued & checked-in delegates",
                ],
                [
                  "Remaining capacity",
                  q.data.types.length ? q.data.capacity : "TBA",
                  "Reserved tickets count toward capacity",
                ],
                ["Checked in", q.data.used, "Delegates welcomed at the door"],
              ].map(([label, value, description]) => (
                <div className="reg-stat" key={String(label)}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{description}</small>
                </div>
              ))}
            </div>
            <div className="reg-line" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 21 }}>Latest pending receipts</h2>
              <Link href="/admin/orders">View all orders ↗</Link>
            </div>
            <OrdersTable orders={q.data.queue} admin />
            <div className="reg-grid" style={{ marginTop: 24 }}>
              <section className="reg-card">
                <h2>Event details</h2>
                <p>Date: To be announced</p>
                <p>Venue: To be announced</p>
                <Link
                  href="/admin/event-info"
                  className="reg-button reg-button-secondary"
                  style={{ marginTop: 16 }}
                >
                  Manage event information
                </Link>
              </section>
              <section className="reg-card">
                <h2>Event-day check-in</h2>
                <p>
                  Scan QR tickets or enter a token manually. Export confirmed
                  tickets before the event for an offline fallback.
                </p>
                <div className="reg-actions">
                  <Link className="reg-button" href="/admin/check-in">
                    Open check-in
                  </Link>
                  <ExportButton
                    table="tickets"
                    confirmed
                    label="Ticket backup"
                  />
                </div>
              </section>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
function OrdersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [item, setItem] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [search, status, item, from, to]);
  const q = useQuery({
    queryKey: ["admin-orders", search, status, item, from, to, page],
    queryFn: async () => {
      let query = supabase()
        .from("order_queue")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (status)
        query = query.eq(
          "status",
          status as "pending" | "confirmed" | "rejected" | "cancelled",
        );
      if (item === "ticket") query = query.eq("has_ticket", true);
      if (item === "merch") query = query.eq("has_merch", true);
      if (from) query = query.gte("created_at", new Date(from).toISOString());
      if (to)
        query = query.lt(
          "created_at",
          new Date(new Date(to).getTime() + 86400000).toISOString(),
        );
      if (search.trim()) {
        const term = searchTerm(search.trim());
        query = query.or(
          `full_name.ilike.${term},email.ilike.${term},delegate_display_id.ilike.${term}`,
        );
      }
      const result = await query;
      if (result.error) throw result.error;
      return { rows: result.data, count: result.count ?? 0 };
    },
  });
  return (
    <>
      <Heading title="Review orders">
        Verify membership and the complete receipt package before confirming.
      </Heading>
      <div className="reg-filter-bar">
        <label>
          Search
          <input
            placeholder="Delegate ID, name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["pending", "confirmed", "rejected", "cancelled"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Contains
          <select value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">All items</option>
            <option value="ticket">Ticket</option>
            <option value="merch">Merchandise</option>
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <QueryState pending={q.isPending} error={q.error}>
        <OrdersTable orders={q.data?.rows ?? []} admin />
        <Pager page={page} setPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}
function AuditTimeline({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["order-audit", id],
    queryFn: async () => {
      const result = await supabase()
        .from("audit_entries")
        .select("*")
        .eq("order_id", id)
        .order("created_at");
      if (result.error) throw result.error;
      return result.data;
    },
  });
  return (
    <section className="reg-card">
      <h2>Audit timeline</h2>
      <QueryState pending={q.isPending} error={q.error}>
        {!q.data?.length ? (
          <Empty>No audit entries yet.</Empty>
        ) : (
          <ol className="reg-timeline">
            {q.data.map((row) => (
              <li key={row.id}>
                <strong>{row.action.replaceAll("_", " ")}</strong>
                <small>
                  {row.actor_name} · {date(row.created_at)}
                </small>
                <details>
                  <summary style={{ fontSize: 11, color: "#acafb8" }}>
                    Details
                  </summary>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      fontSize: 11,
                    }}
                  >
                    {JSON.stringify(row.details, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        )}
      </QueryState>
    </section>
  );
}
function OrderPage({ id }: { id: string }) {
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ["order", id],
    queryFn: () => orderDetail(id),
  });
  const [action, setAction] = useState<"confirm" | "reject" | "cancel" | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (action) dialog.current?.showModal();
    else dialog.current?.close();
  }, [action]);
  const member =
    q.data?.items.some(
      (item) =>
        q.data?.catalog.tickets.find((type) => type.id === item.ticket_type_id)
          ?.requires_membership,
    ) || Boolean(q.data?.order.membership_number);
  const perform = async () => {
    setBusy(true);
    setError("");
    try {
      const fresh = await q.refetch();
      if (fresh.error) throw fresh.error;
      if (!fresh.data) throw new Error("Order unavailable.");
      const viewed = q.data?.receipts
        .filter((r) => r.decision === "pending")
        .map((r) => r.id)
        .sort()
        .join(",");
      const latest = fresh.data.receipts
        .filter((r) => r.decision === "pending")
        .map((r) => r.id)
        .sort()
        .join(",");
      if (action !== "cancel" && viewed !== latest) {
        setAction(null);
        setNotice(
          "New receipts arrived. Review the updated package before deciding.",
        );
        return;
      }
      if (action === "confirm") {
        for (const receipt of fresh.data.receipts.filter(
          (r) => r.decision === "pending",
        )) {
          const signed = await supabase()
            .storage.from("receipts")
            .createSignedUrl(receipt.receipt_path, 60);
          if (signed.error) throw signed.error;
        }
        await cache.invalidateQueries({ queryKey: ["receipt-url"] });
      }
      const result =
        action === "confirm"
          ? await supabase().rpc("confirm_order", {
              p_order_id: id,
              p_membership_verified: verified,
              p_expected_receipt_ids: fresh.data.receipts
                .filter((r) => r.decision === "pending")
                .map((r) => r.id),
            })
          : action === "reject"
            ? await supabase().rpc("reject_order", {
                p_order_id: id,
                p_reason: reason,
              })
            : await supabase().rpc("cancel_order", {
                p_order_id: id,
                p_reason: reason,
              });
      if (result.error) throw result.error;
      const outcome = z
        .object({ result: z.string(), message: z.string().optional() })
        .parse(result.data);
      setNotice(
        outcome.result === "already_handled"
          ? (outcome.message ??
              "This order has already been handled or has no pending receipts. The latest state is shown below.")
          : `Order ${outcome.result}.`,
      );
      setAction(null);
      await cache.invalidateQueries();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link href="/admin/orders" className="reg-back">
        <ArrowLeft size={14} />
        Review queue
      </Link>
      <Heading title="Registration review">
        Check the expected total, every receipt, and membership before
        approving.
      </Heading>
      {notice && <Notice>{notice}</Notice>}
      <QueryState pending={q.isPending} error={q.error}>
        {q.data && (
          <>
            <div className="reg-actions" style={{ margin: "0 0 22px" }}>
              <Status value={q.data.order.status} />
              <span className="reg-order-id">{id}</span>
            </div>
            <div className="reg-grid reg-grid-wide">
              <div className="reg-form">
                <OrderSummary detail={q.data} />
                <ReviewHistory detail={q.data} />
              </div>
              <div className="reg-form">
                <section className="reg-card">
                  <h2>Delegate details</h2>
                  <strong>{q.data.order.full_name}</strong>
                  <p>{q.data.order.delegate_display_id}</p>
                  <p>{q.data.order.email}</p>
                  <p>{q.data.order.phone}</p>
                  <p>{q.data.order.institution}</p>
                  <Link
                    className="reg-button reg-button-secondary"
                    href={`/admin/delegates/${q.data.order.delegate_id}`}
                    style={{ marginTop: 16 }}
                  >
                    View full history
                  </Link>
                </section>
                {member && (
                  <section className="reg-card">
                    <ShieldCheck color="#ff7442" size={22} />
                    <h2 style={{ marginTop: 12 }}>IEEE membership</h2>
                    <p>Membership number</p>
                    <strong style={{ fontSize: 22 }}>
                      {q.data.order.membership_number}
                    </strong>
                    <p>
                      Verify this number with your membership records. Approve
                      membership and payment together.
                    </p>
                  </section>
                )}
                <section className="reg-card">
                  <h2>Review actions</h2>
                  <p>
                    All pending receipts in this order are one review package.
                  </p>
                  <div className="reg-actions">
                    <button
                      className="reg-button"
                      disabled={
                        q.data.order.status !== "pending" ||
                        !q.data.order.pending_receipts
                      }
                      onClick={() => {
                        setAction("confirm");
                        setVerified(false);
                        setError("");
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      className="reg-button reg-button-secondary"
                      disabled={
                        q.data.order.status !== "pending" ||
                        !q.data.order.pending_receipts
                      }
                      onClick={() => {
                        setAction("reject");
                        setReason("");
                        setError("");
                      }}
                    >
                      Reject
                    </button>
                    <button
                      className="reg-button reg-button-danger"
                      disabled={
                        !["pending", "rejected"].includes(q.data.order.status)
                      }
                      onClick={() => {
                        setAction("cancel");
                        setReason("");
                        setError("");
                      }}
                    >
                      Cancel order
                    </button>
                  </div>
                  {["confirmed", "cancelled"].includes(q.data.order.status) && (
                    <p>
                      This order is final. Refunds are handled outside the
                      portal.
                    </p>
                  )}
                </section>
                <AuditTimeline id={id} />
              </div>
            </div>
          </>
        )}
      </QueryState>
      <dialog
        ref={dialog}
        className="reg-modal"
        style={{ color: "#fff", position: "fixed", inset: 0, margin: "auto" }}
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setAction(null);
        }}
      >
        <h2>
          {action === "confirm"
            ? "Confirm this order?"
            : action === "reject"
              ? "Reject this receipt package?"
              : "Cancel this order?"}
        </h2>
        <p>
          {action === "confirm"
            ? "Confirm only after checking every receipt against the expected total."
            : "Provide a clear reason. It will be emailed to the delegate and saved in the history."}
        </p>
        {action === "confirm" && member && (
          <label className="reg-checkbox">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              disabled={busy}
            />
            I verified the IEEE membership number and payment receipts.
          </label>
        )}
        {action !== "confirm" && (
          <label>
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              placeholder="Explain what needs to be corrected…"
            />
          </label>
        )}
        {error && <Notice error>{error}</Notice>}
        <div className="reg-actions">
          <button
            className="reg-button"
            onClick={() => void perform()}
            disabled={
              busy ||
              (action === "confirm" && member && !verified) ||
              (action !== "confirm" && reason.trim().length < 5)
            }
          >
            {busy ? "Saving decision…" : "Confirm decision"}
          </button>
          <button
            className="reg-button reg-button-secondary"
            onClick={() => setAction(null)}
            disabled={busy}
          >
            Go back
          </button>
        </div>
      </dialog>
    </>
  );
}
function DelegatesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [search]);
  const q = useQuery({
    queryKey: ["delegates", search, page],
    queryFn: async () => {
      let query = supabase()
        .from("profiles")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (search) {
        const term = searchTerm(search);
        query = query.or(
          `full_name.ilike.${term},email.ilike.${term},delegate_id.ilike.${term}`,
        );
      }
      const result = await query;
      if (result.error) throw result.error;
      return { rows: result.data, count: result.count ?? 0 };
    },
  });
  return (
    <>
      <Heading title="Delegates">
        Search delegate accounts and review their registration history.
      </Heading>
      <div className="reg-filter-bar">
        <label>
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Delegate ID, name or email"
          />
        </label>
        <ExportButton table="profiles" label="Export delegates" />
      </div>
      <QueryState pending={q.isPending} error={q.error}>
        {!q.data?.rows.length ? (
          <Empty>No delegates match your search.</Empty>
        ) : (
          <div className="reg-table-wrap">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Delegate</th>
                  <th>Email</th>
                  <th>Institution</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.full_name}
                      <small>{p.delegate_id}</small>
                    </td>
                    <td>{p.email}</td>
                    <td>{p.institution}</td>
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td>
                      <Link href={`/admin/delegates/${p.id}`}>
                        View history ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} setPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}
function DelegatePage({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["delegate", id],
    queryFn: async () => {
      const [profile, orders, tickets] = await Promise.all([
        supabase().from("profiles").select("*").eq("id", id).single(),
        supabase()
          .from("order_queue")
          .select("*")
          .eq("delegate_id", id)
          .order("created_at", { ascending: false }),
        supabase()
          .from("tickets")
          .select("*")
          .eq("delegate_id", id)
          .order("created_at", { ascending: false }),
      ]);
      for (const r of [profile, orders, tickets]) if (r.error) throw r.error;
      return {
        profile: profile.data!,
        orders: orders.data!,
        tickets: tickets.data!,
      };
    },
  });
  return (
    <>
      <Link href="/admin/delegates" className="reg-back">
        <ArrowLeft size={14} />
        All delegates
      </Link>
      <Heading title="Delegate history" />
      <QueryState pending={q.isPending} error={q.error}>
        {q.data && (
          <>
            <section className="reg-card" style={{ marginBottom: 24 }}>
              <h2>{q.data.profile.full_name}</h2>
              <p>
                {q.data.profile.delegate_id} · {q.data.profile.email}
              </p>
              <p>
                {q.data.profile.phone} · {q.data.profile.institution}
              </p>
              <p>Joined {date(q.data.profile.created_at)}</p>
            </section>
            <h2 style={{ fontSize: 20, marginBottom: 18 }}>
              Orders & receipts
            </h2>
            <OrdersTable orders={q.data.orders} admin />
            <section className="reg-card" style={{ marginTop: 24 }}>
              <h2>Ticket history</h2>
              {!q.data.tickets.length ? (
                <Empty>No tickets purchased.</Empty>
              ) : (
                q.data.tickets.map((ticket) => (
                  <div className="reg-line" key={ticket.id}>
                    <div>
                      <strong>Ticket {ticket.id.slice(0, 8)}</strong>
                      <small>
                        {ticket.checked_in_at
                          ? `Checked in ${date(ticket.checked_in_at)}`
                          : `Created ${date(ticket.created_at)}`}
                      </small>
                      {ticket.void_reason && (
                        <small>{ticket.void_reason}</small>
                      )}
                    </div>
                    <Status value={ticket.status} />
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </QueryState>
    </>
  );
}
function MerchPage() {
  const q = useQuery({
    queryKey: ["merch-totals"],
    queryFn: async () => {
      const result = await supabase()
        .from("merch_totals")
        .select("*")
        .order("name");
      if (result.error) throw result.error;
      return result.data;
    },
  });
  return (
    <>
      <Heading title="Merchandise totals">
        Production quantities from confirmed orders only, grouped by item and
        size.
      </Heading>
      <div className="reg-actions" style={{ margin: "0 0 20px" }}>
        <ExportButton table="merch_totals" />
      </div>
      <QueryState pending={q.isPending} error={q.error}>
        {!q.data?.length ? (
          <Empty>No confirmed merchandise orders yet.</Empty>
        ) : (
          <div className="reg-table-wrap">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Size</th>
                  <th>Confirmed quantity</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((row) => (
                  <tr key={`${row.merch_item_id}-${row.size}`}>
                    <td>{row.name}</td>
                    <td>{row.size ?? "No size"}</td>
                    <td>{row.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </>
  );
}
const scanSchema = z.object({
  result: z.enum(["valid", "already_used", "invalid"]),
  full_name: z.string().optional(),
  delegate_id: z.string().optional(),
  ticket_type: z.string().optional(),
  checked_in_at: z.string().optional(),
  checked_in_by: z.string().optional(),
});
function CheckInPage() {
  const [camera, setCamera] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [result, setResult] = useState<z.infer<typeof scanSchema> | null>(null);
  const [error, setError] = useState("");
  const scan = async (value: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setCamera(false);
    setError("");
    setResult(null);
    try {
      const data = await supabase().rpc("check_in_ticket", {
        p_token: value.trim(),
      });
      if (data.error) throw data.error;
      setResult(scanSchema.parse(data.data));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      locked.current = false;
    }
  };
  return (
    <>
      <Heading title="Delegate check-in">
        Scan the QR or enter its token. Each ticket can be checked in once.
      </Heading>
      <div className="reg-grid">
        <section className="reg-card">
          <h2>Scan a ticket</h2>
          {camera ? (
            <div className="reg-camera">
              <Scanner
                onScan={(codes) => {
                  if (codes[0]?.rawValue) void scan(codes[0].rawValue);
                }}
                onError={(e) => {
                  setError(errorMessage(e));
                  setCamera(false);
                }}
                constraints={{ facingMode: "environment" }}
              />
            </div>
          ) : (
            <button
              className="reg-button"
              onClick={() => {
                setCamera(true);
                setResult(null);
                setError("");
              }}
              disabled={busy}
            >
              <Camera size={18} />
              Start camera
            </button>
          )}
          <form
            className="reg-form"
            style={{ marginTop: 24 }}
            onSubmit={(e) => {
              e.preventDefault();
              void scan(token);
            }}
          >
            <label>
              Manual QR token
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the ticket token"
                autoComplete="off"
              />
            </label>
            <button
              className="reg-button reg-button-secondary"
              disabled={!token.trim() || busy}
            >
              {busy ? "Checking ticket…" : "Check in manually"}
            </button>
          </form>
          {error && <Notice error>{error}</Notice>}
        </section>
        <section className="reg-card">
          <h2>Result</h2>
          {result ? (
            <div className={`reg-check-result ${result.result}`} role="status">
              <Status value={result.result} />
              <h2 style={{ margin: "18px 0" }}>
                {result.result === "valid"
                  ? result.full_name
                  : result.result === "already_used"
                    ? "Already checked in"
                    : "Invalid ticket"}
              </h2>
              {result.result === "valid" ? (
                <>
                  <p style={{ color: "#c4ebd5" }}>{result.delegate_id}</p>
                  <p style={{ color: "#c4ebd5" }}>{result.ticket_type}</p>
                </>
              ) : result.result === "already_used" ? (
                <>
                  <p>{date(result.checked_in_at ?? null)}</p>
                  <p>Checked in by {result.checked_in_by}</p>
                </>
              ) : (
                <p>This token is invalid, voided, or not yet issued.</p>
              )}
            </div>
          ) : (
            <Empty>Scan or enter a ticket token to see the result.</Empty>
          )}
          <div style={{ marginTop: 24 }}>
            <h3>Offline fallback</h3>
            <p>
              Export confirmed tickets before the event. If Wi-Fi fails, mark
              arrivals on one shared paper list and reconcile online later.
            </p>
            <ExportButton
              table="tickets"
              confirmed
              label="Export confirmed tickets"
            />
          </div>
        </section>
      </div>
    </>
  );
}
function AuditPage() {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  useEffect(() => setPage(0), [action, actor, from, to, search]);
  const query = (offset: number, limit: number) => {
    let q = supabase()
      .from("audit_entries")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + limit - 1);
    if (action) q = q.eq("action", action);
    if (actor) q = q.eq("actor_role", actor as "admin" | "delegate" | "system");
    if (from) q = q.gte("created_at", new Date(from).toISOString());
    if (to)
      q = q.lt(
        "created_at",
        new Date(new Date(to).getTime() + 86400000).toISOString(),
      );
    if (search.trim()) {
      if (z.uuid().safeParse(search.trim()).success)
        q = q.eq("order_id", search.trim());
      else {
        const term = searchTerm(search);
        q = q.or(
          `delegate_display_id.ilike.${term},delegate_name.ilike.${term},delegate_email.ilike.${term},actor_name.ilike.${term}`,
        );
      }
    }
    return q;
  };
  const q = useQuery({
    queryKey: ["audit", action, actor, from, to, search, page],
    queryFn: async () => {
      const result = await query(page * PAGE_SIZE, PAGE_SIZE);
      if (result.error) throw result.error;
      return { rows: result.data, count: result.count ?? 0 };
    },
  });
  return (
    <>
      <Heading title="Audit log">
        A permanent, read-only history of every registration action.
      </Heading>
      <div className="reg-filter-bar">
        <label>
          Order or delegate search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order UUID, delegate, or actor name"
          />
        </label>
        <label>
          Action
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {[
              "order_created",
              "receipt_submitted",
              "order_confirmed",
              "order_rejected",
              "order_cancelled",
              "ticket_issued",
              "ticket_voided",
              "ticket_checked_in",
              "event_info_updated",
            ].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Actor role
          <select value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">All roles</option>
            {["admin", "delegate", "system"].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="reg-button reg-button-secondary"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            setExportError("");
            try {
              const rows: AuditEntry[] = [];
              for (let offset = 0; ; offset += 1000) {
                const result = await query(offset, 1000);
                if (result.error) throw result.error;
                rows.push(...result.data);
                if (result.data.length < 1000) break;
              }
              if (!rows.length)
                throw new Error("No matching audit entries to export.");
              downloadCsv(
                "aidsl-audit",
                rows.map((row) => ({ ...row })),
              );
            } catch (e) {
              setExportError(errorMessage(e));
            } finally {
              setExporting(false);
            }
          }}
        >
          <Download size={15} />
          {exporting ? "Exporting…" : "Export filtered CSV"}
        </button>
      </div>
      {exportError && <Notice error>{exportError}</Notice>}
      <QueryState pending={q.isPending} error={q.error}>
        {!q.data?.rows.length ? (
          <Empty>No matching audit entries.</Empty>
        ) : (
          <div className="reg-table-wrap">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Delegate / order</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{date(row.created_at)}</td>
                    <td>
                      {row.actor_name}
                      <small>{row.actor_role}</small>
                    </td>
                    <td>{row.action.replaceAll("_", " ")}</td>
                    <td>
                      {row.delegate_display_id ?? "—"}
                      {row.order_id && (
                        <small>
                          <Link href={`/admin/orders/${row.order_id}`}>
                            {row.order_id.slice(0, 8)} ↗
                          </Link>
                        </small>
                      )}
                    </td>
                    <td>
                      <details>
                        <summary>View</summary>
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            maxWidth: 300,
                            fontSize: 11,
                          }}
                        >
                          {JSON.stringify(row.details, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} setPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}
function EventInfoPage() {
  const cache = useQueryClient();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const q = useQuery({
    queryKey: ["admin-event-info"],
    queryFn: async () => {
      const result = await supabase()
        .from("event_info")
        .select("*")
        .order("slug");
      if (result.error) throw result.error;
      return result.data;
    },
  });
  return (
    <>
      <Heading title="Event information">
        Edit markdown pages, bank details and announcements.
      </Heading>
      <QueryState pending={q.isPending} error={q.error}>
        <div className="reg-grid reg-grid-wide">
          <section className="reg-card">
            <h2>{slug ? "Edit page" : "New page"}</h2>
            <form
              className="reg-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  const result = await supabase().rpc("upsert_event_info", {
                    p_slug: slug,
                    p_title: title,
                    p_body: body,
                    p_published: published,
                  });
                  if (result.error) throw result.error;
                  setNotice("Page saved.");
                  await cache.invalidateQueries({
                    queryKey: ["admin-event-info"],
                  });
                  await cache.invalidateQueries({ queryKey: ["event-info"] });
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Slug
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="payment-instructions"
                />
              </label>
              <label>
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </label>
              <label>
                Body · Markdown
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  required
                />
              </label>
              <label className="reg-checkbox">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                />
                Published to delegates
              </label>
              {error && <Notice error>{error}</Notice>}
              {notice && <Notice>{notice}</Notice>}
              <button className="reg-button" disabled={busy}>
                {busy ? "Saving…" : "Save page"}
              </button>
            </form>
          </section>
          <section className="reg-card">
            <h2>Existing pages</h2>
            {!q.data?.length ? (
              <Empty>No pages yet.</Empty>
            ) : (
              q.data.map((info) => (
                <button
                  key={info.id}
                  className="reg-line"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    color: "inherit",
                  }}
                  onClick={() => {
                    setSlug(info.slug);
                    setTitle(info.title);
                    setBody(info.body);
                    setPublished(info.published);
                    setError("");
                    setNotice("");
                  }}
                >
                  <div>
                    <strong>{info.title}</strong>
                    <small>{info.slug}</small>
                  </div>
                  <Status value={info.published ? "published" : "draft"} />
                </button>
              ))
            )}
            <button
              className="reg-button reg-button-secondary"
              style={{ marginTop: 20 }}
              onClick={() => {
                setSlug("");
                setTitle("");
                setBody("");
                setPublished(false);
              }}
            >
              New page
            </button>
          </section>
        </div>
      </QueryState>
    </>
  );
}
function ExportsPage() {
  return (
    <>
      <Heading title="Registration exports">
        Download regular backups and event-day fallback lists.
      </Heading>
      <Notice>
        Export regularly while using the Supabase Free plan. Keep these files
        somewhere private.
      </Notice>
      <div className="reg-grid">
        {(["profiles", "orders", "tickets"] as const).map((table) => (
          <section className="reg-card" key={table}>
            <h2>
              {table === "profiles"
                ? "Delegates"
                : table === "orders"
                  ? "Orders"
                  : "Tickets"}
            </h2>
            <p>
              {table === "profiles"
                ? "Delegate IDs and contact details."
                : table === "orders"
                  ? "All orders, statuses and review timestamps."
                  : "Ticket statuses, QR tokens and check-in details."}
            </p>
            <div className="reg-actions">
              <ExportButton table={table} />
            </div>
          </section>
        ))}
        <section className="reg-card">
          <h2>Confirmed ticket fallback</h2>
          <p>Issued and checked-in tickets for event-day use.</p>
          <div className="reg-actions">
            <ExportButton table="tickets" confirmed />
          </div>
        </section>
      </div>
    </>
  );
}
export default function AdminPortal({ segments }: { segments: string[] }) {
  const route = segments[0] ?? "dashboard";
  if (route === "login") return <LoginPage admin />;
  let screen: React.ReactNode;
  if (route === "dashboard") screen = <Dashboard />;
  else if (route === "orders")
    screen = segments[1] ? <OrderPage id={segments[1]} /> : <OrdersPage />;
  else if (route === "delegates")
    screen = segments[1] ? (
      <DelegatePage id={segments[1]} />
    ) : (
      <DelegatesPage />
    );
  else if (route === "merch") screen = <MerchPage />;
  else if (route === "check-in") screen = <CheckInPage />;
  else if (route === "audit") screen = <AuditPage />;
  else if (route === "event-info") screen = <EventInfoPage />;
  else if (route === "export") screen = <ExportsPage />;
  else screen = <Empty>Page not found.</Empty>;
  return (
    <PortalShell admin pathname={`/admin/${segments.join("/") || "dashboard"}`}>
      <Guard admin>{screen}</Guard>
    </PortalShell>
  );
}
