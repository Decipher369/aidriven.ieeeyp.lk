export type OrderStatus = "pending" | "confirmed" | "rejected" | "cancelled";
export type Decision = "pending" | "approved" | "rejected";
export type MerchSize = "XS" | "S" | "M" | "L" | "XL" | "XXL";
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export interface Profile {
  id: string;
  delegate_id: string;
  full_name: string;
  email: string;
  phone: string;
  institution: string;
  is_active: boolean;
  created_at: string;
}
export interface Admin {
  user_id: string;
  full_name: string;
  created_at: string;
}
export interface TicketType {
  id: string;
  name: string;
  price: number;
  capacity: number;
  active: boolean;
  requires_membership: boolean;
}
export interface MerchItem {
  id: string;
  name: string;
  price: number;
  has_sizes: boolean;
  active: boolean;
}
export interface MerchVariant {
  id: string;
  merch_item_id: string;
  size: MerchSize | null;
  active: boolean;
}
export interface Order {
  id: string;
  delegate_id: string;
  status: OrderStatus;
  membership_number: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
}
export interface OrderItem {
  id: string;
  order_id: string;
  ticket_type_id: string | null;
  merch_variant_id: string | null;
  quantity: number;
  unit_price: number;
  display_name: string;
}
export interface Review {
  id: string;
  order_id: string;
  attempt_number: number;
  membership_number: string | null;
  membership_verified: boolean | null;
  decision: Decision;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}
export interface Receipt {
  id: string;
  order_id: string;
  review_attempt_id: string;
  receipt_path: string;
  submitted_at: string;
  decision: Decision;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}
export interface Ticket {
  id: string;
  order_item_id: string;
  delegate_id: string;
  ticket_type_id: string;
  status: "reserved" | "issued" | "used" | "void";
  qr_token: string | null;
  issued_at: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
}
export interface EventInfo {
  id: string;
  slug: string;
  title: string;
  body: string;
  published: boolean;
  updated_by: string | null;
  updated_at: string;
}
export interface EmailLog {
  id: string;
  delegate_id: string;
  order_id: string | null;
  template: string;
  dedupe_key: string;
  status: "queued" | "sent" | "failed";
  attempts: number;
  error: string | null;
  payload: Json;
  created_at: string;
  sent_at: string | null;
  delivery_started_at: string | null;
  delivery_lock_until: string | null;
  delivery_claim: string | null;
}
export interface Audit {
  id: string;
  actor_id: string | null;
  actor_role: "admin" | "delegate" | "system";
  action: string;
  entity_type: string;
  entity_id: string;
  order_id: string | null;
  details: Json;
  created_at: string;
}
export interface QueueOrder extends Order {
  full_name: string;
  email: string;
  phone: string;
  institution: string;
  delegate_display_id: string;
  total: number;
  has_ticket: boolean;
  has_merch: boolean;
  pending_receipts: number;
  latest_reason: string | null;
}
export interface AuditEntry extends Audit {
  actor_name: string;
  delegate_display_id: string | null;
  delegate_name: string | null;
  delegate_email: string | null;
}
type Fields<R> = { [K in keyof R]: R[K] };
type Table<R> = {
  Row: Fields<R>;
  Insert: never;
  Update: Partial<Fields<R>>;
  Relationships: [];
};
type View<R> = { Row: Fields<R>; Relationships: [] };
export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile>;
      admins: Table<Admin>;
      ticket_types: Table<TicketType>;
      merch_items: Table<MerchItem>;
      merch_variants: Table<MerchVariant>;
      orders: Table<Order>;
      order_items: Table<OrderItem>;
      payment_review_attempts: Table<Review>;
      payment_submissions: Table<Receipt>;
      tickets: Table<Ticket>;
      event_info: Table<EventInfo>;
      email_log: Table<EmailLog>;
      audit_log: Table<Audit>;
    };
    Views: {
      order_queue: View<QueueOrder>;
      order_totals: View<{ order_id: string; total: number }>;
      merch_totals: View<{
        merch_item_id: string;
        name: string;
        size: MerchSize | null;
        quantity: number;
      }>;
      audit_entries: View<AuditEntry>;
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      registration_rate_limit: {
        Args: { p_ip_hash: string };
        Returns: boolean;
      };
      claim_email: { Args: { p_id: string }; Returns: Json };
      complete_email: {
        Args: {
          p_id: string;
          p_claim: string;
          p_sent: boolean;
          p_error?: string | null;
        };
        Returns: boolean;
      };
      queue_event_reminders: { Args: Record<string, never>; Returns: number };
      create_order: {
        Args: {
          p_ticket_type_id?: string | null;
          p_merch?: Json;
          p_membership_number?: string | null;
        };
        Returns: string;
      };
      submit_receipt: {
        Args: {
          p_order_id: string;
          p_path: string;
          p_membership_number?: string | null;
        };
        Returns: string;
      };
      confirm_order: {
        Args: {
          p_order_id: string;
          p_membership_verified?: boolean;
          p_expected_receipt_ids?: string[];
        };
        Returns: Json;
      };
      reject_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: Json;
      };
      cancel_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: Json;
      };
      check_in_ticket: { Args: { p_token: string }; Returns: Json };
      upsert_event_info: {
        Args: {
          p_slug: string;
          p_title: string;
          p_body: string;
          p_published: boolean;
        };
        Returns: string;
      };
    };
    Enums: {
      merch_size: MerchSize;
      order_status: OrderStatus;
      submission_decision: Decision;
    };
    CompositeTypes: Record<string, never>;
  };
}
