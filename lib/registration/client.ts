import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
let client: SupabaseClient<Database> | undefined;
export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export function supabase() {
  if (!isConfigured())
    throw new Error("Registration is being configured. Please try again soon.");
  client ??= createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
  return client;
}
export function errorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Something went wrong. Please try again.";
  if (/fetch|network|load failed/i.test(message))
    return "We could not connect. Check your connection and try again.";
  if (/sold out/i.test(message))
    return "This pass is sold out. Please choose another pass.";
  if (/already have a ticket/i.test(message))
    return "You already have an active ticket. View it in My ticket.";
  return message;
}
export function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
export function money(value: number) {
  const currency = process.env.NEXT_PUBLIC_CURRENCY;
  return currency
    ? new Intl.NumberFormat("en-LK", { style: "currency", currency }).format(
        value,
      )
    : `${Number(value).toFixed(2)} (currency to be announced)`;
}
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => {
    let text =
      value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [
    keys.map(cell).join(","),
    ...rows.map((row) => keys.map((key) => cell(row[key])).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
