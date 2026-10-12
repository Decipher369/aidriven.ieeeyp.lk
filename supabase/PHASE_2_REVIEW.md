# Access and transactional SQL review

The full executable SQL is in these migrations:

- [RLS, storage and eight business functions](migrations/20261006000200_registration_access.sql)
- [Read-only queue, merchandise and audit views](migrations/20261006000300_registration_views.sql)
- [Server-generated historical item labels](migrations/20261006000400_registration_item_labels.sql)
- [Manual-admin provisioning, registration rate limiting and email claiming](migrations/20261006000500_registration_delivery.sql)
- [Supabase cron and webhook setup](migrations/20261006000600_registration_schedules.sql)

The organizer authorized continuation through all implementation phases. These files are available for review before a remote push; no project schema has been changed remotely.

## Access

`is_admin()` is a security-definer function with an empty search path. It reads only the manually populated admins table. RLS permits delegates to read their own data, admins to read the complete queue and logs, and authenticated users to read active catalog/published event pages. Anonymous roles get no table or business-function privileges.

Only full name, phone and institution have direct profile UPDATE privileges. Orders, receipts, tickets, catalog and admin authority cannot be changed through direct API writes. Views use `security_invoker = true`, preserving their underlying table policies.

```sql
grant update(full_name, phone, institution)
  on public.profiles to authenticated;

create policy orders_read on public.orders
  for select to authenticated
  using (delegate_id = (select auth.uid()) or (select public.is_admin()));
```

Receipts have a private 1 MB bucket. Insert requires an owned open order and the exact user/order/image folder structure. Delegates can read their folder; admins can read all. No storage UPDATE/DELETE policy exists. The Storage schema must not be exposed through PostgREST.

## Transactions and review

All business RPCs check the authenticated caller before writing. Prices and totals are calculated from the database catalog. Ticket allocation locks the type and uses the one-active-ticket unique index. Membership is recorded at purchase and reviewed only with the payment package.

Confirm/reject serialize on the order row, close the pending package and update every receipt consistently. Confirmation also checks the receipt IDs viewed by the admin when supplied, generates the QR in the database, and queues one deduplicated message. Rejected packages stay immutable; a new submission creates a numbered package and reopens the order. Cancellation preserves history and voids the reserved ticket.

Check-in uses the atomic `UPDATE ... WHERE status='issued' RETURNING` pattern. A second scan looks up the already-used ticket and returns its check-in time and admin.

Expiry is scheduler-only and cannot be called by delegates/admins. Private helpers are in a schema that API roles cannot access. Email worker functions are executable only by the service role inside Edge Functions; no direct service-role audit writes are granted.

## Validation boundary

The native runner tests schema rules, policy/privilege behavior with simulated PostgREST claims, receipt review and membership correction, idempotent queue/claims, simultaneous purchases/confirmations/scans, and a 50-delegate database purchase load. It does not prove real Supabase Auth/Storage HTTP behavior or execute the platform-specific cron/webhook migration. Live sessions, deployed workers and Security Advisor still require project setup.

Run `bash supabase/tests/run-all-local.sh` for local checks. Follow README setup to apply reviewed SQL through the Supabase CLI.
