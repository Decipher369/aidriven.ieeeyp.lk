"use client";
/* eslint-disable @next/next/no-img-element -- Private signed receipt URLs and in-memory previews must bypass the image optimization proxy and its cache. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import imageCompression from "browser-image-compression";
import ReactMarkdown from "react-markdown";
import { Upload, RefreshCw, CheckCircle2 } from "lucide-react";
import { date, errorMessage, money, supabase } from "@/lib/registration/client";
import {
  itemName,
  uploadReceipt,
  type orderDetail,
} from "@/lib/registration/data";
import type { QueueOrder, Receipt } from "@/lib/registration/database";
import { useAuth } from "./Provider";
import { Empty, Notice, QueryState, Status } from "./ui";
type Detail = Awaited<ReturnType<typeof orderDetail>>;
export function OrdersTable({
  orders,
  admin = false,
}: {
  orders: QueueOrder[];
  admin?: boolean;
}) {
  if (!orders.length) return <Empty>No orders to show yet.</Empty>;
  return (
    <div className="reg-table-wrap">
      <table className="reg-table">
        <thead>
          <tr>
            <th>{admin ? "Delegate" : "Order"}</th>
            <th>Items</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Date</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <Link
                  href={`${admin ? "/admin" : "/portal"}/orders/${order.id}`}
                >
                  {admin ? order.full_name : `Order ${order.id.slice(0, 8)}`}
                  <small>
                    {admin
                      ? `${order.delegate_display_id} · ${order.email}`
                      : order.id.slice(0, 8).toUpperCase()}
                  </small>
                </Link>
              </td>
              <td>
                {[
                  order.has_ticket ? "Ticket" : "",
                  order.has_merch ? "Merch" : "",
                ]
                  .filter(Boolean)
                  .join(" + ")}
                <small>
                  {order.pending_receipts
                    ? `${order.pending_receipts} receipt${order.pending_receipts > 1 ? "s" : ""} to review`
                    : order.status === "pending"
                      ? "Awaiting receipt"
                      : ""}
                </small>
              </td>
              <td>{money(order.total)}</td>
              <td>
                <Status value={order.status} />
              </td>
              <td>{new Date(order.created_at).toLocaleDateString()}</td>
              <td>
                <Link
                  href={`${admin ? "/admin" : "/portal"}/orders/${order.id}`}
                >
                  View ↗
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function OrderSummary({ detail }: { detail: Detail }) {
  return (
    <section className="reg-card">
      <h2>Order summary</h2>
      {detail.items.map((item) => (
        <div key={item.id} className="reg-line">
          <div>
            <strong>{itemName(item, detail.catalog)}</strong>
            <small>
              Quantity {item.quantity} · {money(item.unit_price)} each
            </small>
          </div>
          <span>{money(item.quantity * item.unit_price)}</span>
        </div>
      ))}
      <div className="reg-line reg-total">
        <strong>Total</strong>
        <strong>{money(detail.order.total)}</strong>
      </div>
      <p className="reg-order-id">{detail.order.id}</p>
    </section>
  );
}
export function ReceiptImage({ receipt }: { receipt: Receipt }) {
  const image = useQuery({
    queryKey: ["receipt-url", receipt.id],
    queryFn: async () => {
      const result = await supabase()
        .storage.from("receipts")
        .createSignedUrl(receipt.receipt_path, 60);
      if (result.error) throw result.error;
      return result.data.signedUrl;
    },
    staleTime: 40000,
    refetchInterval: 45000,
  });
  return (
    <div className="reg-receipt">
      <QueryState pending={image.isPending} error={image.error}>
        {image.data && (
          <a href={image.data} target="_blank" rel="noreferrer">
            <img
              src={image.data}
              alt={`Payment receipt submitted ${date(receipt.submitted_at)}`}
              onError={() => {
                void image.refetch();
              }}
            />
          </a>
        )}
      </QueryState>
      <Status value={receipt.decision} />
      <p className="reg-muted" style={{ fontSize: 11, marginTop: 10 }}>
        {date(receipt.submitted_at)}
      </p>
      {receipt.rejection_reason && (
        <Notice error>{receipt.rejection_reason}</Notice>
      )}
    </div>
  );
}
export function ReviewHistory({ detail }: { detail: Detail }) {
  return (
    <section className="reg-card">
      <h2>Receipt & review history</h2>
      {!detail.reviews.length ? (
        <Empty>No receipts submitted yet.</Empty>
      ) : (
        detail.reviews.map((review) => (
          <div key={review.id} style={{ marginBottom: 24 }}>
            <div className="reg-line">
              <strong>Review attempt {review.attempt_number}</strong>
              <Status value={review.decision} />
            </div>
            {review.membership_number && (
              <p>
                IEEE membership number:{" "}
                <strong style={{ color: "#fff" }}>
                  {review.membership_number}
                </strong>
                {review.membership_verified && " · Verified"}
              </p>
            )}
            {review.rejection_reason && (
              <Notice error>{review.rejection_reason}</Notice>
            )}
            <p style={{ fontSize: 12 }}>
              {review.reviewed_at
                ? `Reviewed ${date(review.reviewed_at)}`
                : "All receipts in this package will be reviewed together."}
            </p>
            <div className="reg-receipts">
              {detail.receipts
                .filter((receipt) => receipt.review_attempt_id === review.id)
                .map((receipt) => (
                  <ReceiptImage key={receipt.id} receipt={receipt} />
                ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
interface UploadEntry {
  id: string;
  file: File;
  compressed: File | null;
  preview: string;
  uploaded: boolean;
  submitted: boolean;
}
export function ReceiptUpload({ detail }: { detail: Detail }) {
  const auth = useAuth();
  const cache = useQueryClient();
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const current = useRef(entries);
  current.current = entries;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [membership, setMembership] = useState(
    detail.order.membership_number ?? "",
  );
  useEffect(
    () => () => {
      current.current.forEach((entry) => URL.revokeObjectURL(entry.preview));
    },
    [],
  );
  if (!["pending", "rejected"].includes(detail.order.status)) return null;
  const submit = async () => {
    setBusy(true);
    setError("");
    setDone(false);
    try {
      for (const entry of entries) {
        if (entry.submitted) continue;
        let file = entry.compressed;
        if (!file) {
          setStage(`Compressing ${entry.file.name}`);
          file = await imageCompression(entry.file, {
            maxSizeMB: 0.29,
            maxWidthOrHeight: 1600,
            fileType: "image/jpeg",
            useWebWorker: false,
            onProgress: setProgress,
          });
          if (file.size > 1048576)
            throw new Error(
              "This receipt is still too large. Choose a smaller image.",
            );
          entry.compressed = file;
        }
        const path = `${auth.session!.user.id}/${detail.order.id}/${entry.id}.jpg`;
        if (!entry.uploaded) {
          setStage(`Uploading ${entry.file.name}`);
          setProgress(0);
          try {
            await uploadReceipt(path, file, setProgress);
            entry.uploaded = true;
          } catch (e) {
            const existing = await supabase()
              .storage.from("receipts")
              .createSignedUrl(path, 30);
            if (existing.error) throw e;
            entry.uploaded = true;
          }
        }
        setStage("Submitting receipt for review…");
        const result = await supabase().rpc("submit_receipt", {
          p_order_id: detail.order.id,
          p_path: path,
          p_membership_number:
            detail.order.status === "rejected" &&
            membership !== detail.order.membership_number
              ? membership
              : null,
        });
        if (result.error) throw result.error;
        entry.submitted = true;
        setEntries([...entries]);
      }
      setDone(true);
      await cache.invalidateQueries({ queryKey: ["order", detail.order.id] });
      await cache.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setError(errorMessage(e));
      setEntries([...entries]);
    } finally {
      setBusy(false);
      setStage("");
    }
  };
  return (
    <section className="reg-card">
      <h2>
        {detail.order.status === "rejected"
          ? "Fix & resubmit receipts"
          : "Upload payment receipts"}
      </h2>
      <p>
        You can include multiple receipts. Your membership number and all
        pending receipts will be reviewed together.
      </p>
      {detail.order.status === "rejected" && detail.order.membership_number && (
        <label style={{ margin: "18px 0" }}>
          Correct IEEE membership number
          <input
            value={membership}
            onChange={(event) => setMembership(event.target.value)}
            disabled={busy}
          />
        </label>
      )}
      <div className="reg-upload">
        <label>
          <Upload size={22} />
          Choose receipt images
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(event) => {
              setError("");
              setDone(false);
              const files = Array.from(event.target.files ?? []);
              if (
                files.some(
                  (file) =>
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      file.type,
                    ),
                )
              ) {
                setError("Choose JPEG, PNG or WebP images.");
                return;
              }
              entries.forEach((entry) => URL.revokeObjectURL(entry.preview));
              setEntries(
                files.map((file) => ({
                  id: crypto.randomUUID(),
                  file,
                  compressed: null,
                  preview: URL.createObjectURL(file),
                  uploaded: false,
                  submitted: false,
                })),
              );
            }}
          />
          <small>
            Images are compressed before upload. Keep the amount and reference
            clearly visible.
          </small>
        </label>
        {entries.map((entry) => (
          <div key={entry.id}>
            <img src={entry.preview} alt={`Preview of ${entry.file.name}`} />
            <small>
              {entry.file.name}
              {entry.submitted ? " · Submitted" : ""}
            </small>
          </div>
        ))}
        {busy && (
          <>
            <p role="status">{stage}</p>
            <div
              className="reg-progress"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          </>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      {done && (
        <Notice>
          <CheckCircle2 size={16} style={{ display: "inline" }} /> Receipts
          submitted. We’ll email you after review.
        </Notice>
      )}
      <button
        className="reg-button"
        style={{ marginTop: 18 }}
        onClick={() => void submit()}
        disabled={
          busy || !entries.length || entries.every((entry) => entry.submitted)
        }
      >
        {busy ? (
          "Please wait…"
        ) : error ? (
          <>
            <RefreshCw size={16} />
            Retry submission
          </>
        ) : (
          "Submit receipts for review"
        )}
      </button>
    </section>
  );
}
export function PaymentInstructions({ detail }: { detail: Detail }) {
  return (
    <section className="reg-card">
      <h2>Bank transfer instructions</h2>
      {detail.instructions?.published ? (
        <div className="reg-markdown">
          <ReactMarkdown>{detail.instructions.body}</ReactMarkdown>
        </div>
      ) : (
        <Empty>
          Payment instructions will be announced soon. Please wait for the
          official bank details before transferring funds.
        </Empty>
      )}
    </section>
  );
}
export function OrderTimeline({ detail }: { detail: Detail }) {
  return (
    <section className="reg-card">
      <h2>Order timeline</h2>
      <ol className="reg-timeline">
        <li>
          <strong>Order created</strong>
          <small>{date(detail.order.created_at)}</small>
        </li>
        {[...detail.reviews].reverse().map((review) => (
          <li key={review.id}>
            <strong>
              Receipt package {review.attempt_number} · {review.decision}
            </strong>
            <small>{date(review.reviewed_at ?? review.created_at)}</small>
            {review.rejection_reason && <p>{review.rejection_reason}</p>}
          </li>
        ))}
        {detail.order.confirmed_at && (
          <li>
            <strong>Order confirmed</strong>
            <small>{date(detail.order.confirmed_at)}</small>
          </li>
        )}
        {detail.order.cancelled_at && (
          <li>
            <strong>Order cancelled</strong>
            <small>{date(detail.order.cancelled_at)}</small>
            <p>{detail.order.cancel_reason}</p>
          </li>
        )}
      </ol>
      <Link className="reg-button reg-button-secondary" href="/portal/orders">
        All orders
      </Link>
    </section>
  );
}
