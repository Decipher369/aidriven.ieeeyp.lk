# Phase 1 SQL review

Status: **historical Phase 1 review notes**. The organizer subsequently authorized all remaining implementation phases. The current migrations and tests also include RLS, storage, RPCs and delivery infrastructure. No remote migration has been applied. Use the root README for current setup and admin-provisioning instructions.

Review the full executable [migration SQL](migrations/20261006000100_registration_schema.sql) and [seed SQL](seed.sql). No dashboard schema editing is required.

## Site-specific additions

- `ticket_types.requires_membership` identifies the IEEE Member Pass.
- `orders.membership_number` is collected when purchasing, before verification.
- `payment_review_attempts` represents a package of receipts, with numbered attempts, the membership number reviewed, membership approval, reviewer, decision, reason and time.
- `payment_submissions.review_attempt_id` groups the images. Deferred constraints require all receipt decisions to match their package at commit.
- Rejected packages and receipts are immutable. Resubmission creates a new attempt; old evidence remains available.
- A unique index limits `admins` to one account. Phase 2's double-confirm test must use two sessions for that account instead of creating two admins.

## Critical SQL

```sql
create unique index tickets_one_active_per_delegate
  on public.tickets(delegate_id) where status <> 'void';

create unique index review_attempts_one_pending_per_order
  on public.payment_review_attempts(order_id) where decision = 'pending';

create unique index admins_single_account_key on public.admins ((true));
```

Allocation and voiding lock the ticket-type row. A trigger checks ownership, ticket-line consistency and capacity. The Phase 2 RPC will take this same lock before counting; parallel-session verification belongs to Phase 2.

```sql
select capacity into v_capacity
  from public.ticket_types where id = new.ticket_type_id for update;

select count(*) into v_count from public.tickets
  where ticket_type_id = new.ticket_type_id
    and status <> 'void' and id <> new.id;

if v_count >= v_capacity then
  raise exception 'Ticket type is sold out' using errcode = '23514';
end if;
```

Orders can reserve Member Pass tickets before verification. This guard applies when the admin approves the combined review:

```sql
if new.decision = 'approved' and v_requires and
  (new.membership_verified is distinct from true or
   length(btrim(coalesce(new.membership_number, ''))) = 0) then
  raise exception 'Membership and receipts must be approved together'
    using errcode = '23514';
end if;
```

Commit-time constraints require the latest package to be approved before order confirmation, no pending review, the same confirming/reviewing admin, matching decisions on every receipt, and an issued ticket for a confirmed ticket order. Reopening a rejected order requires a new package containing a receipt.

The migration also refuses invalid prices and quantities, illegal transitions, incorrect merch sizes, order-item mutation, business-record deletion, and audit UPDATE/DELETE/TRUNCATE. Every public table has RLS enabled with API access denied until Phase 2.

## Placeholder seed

The seed publishes summit/organizer content and “To be announced” date and venue. Bank instructions are unpublished. It creates no sellable catalog rows: zero prices and invented capacities must not represent placeholders. Add real catalog details through versioned SQL/seed data when supplied.

## Admin provisioning

There is no seeded Auth user or password. The real email backing `admin@aidriven` is still needed.

The Auth insert trigger skips users with trusted `raw_app_meta_data.registration_admin = true`, set before insertion through trusted provisioning. This marker does not grant access; only an `admins` row grants authority. Client-editable user metadata cannot grant authority or skip delegate creation.

An ordinary Auth user would otherwise receive a delegate profile, so the original “create any user, then insert into admins” instructions cannot be used unchanged. Phase 2 must finalize the provisioning workflow. No delegate profile is silently deleted or promoted.

## Run and test

The existing site still runs with `pnpm dev` at `http://localhost:3000`. Registration screens are later phases.

On this machine, run the entire isolated database test with one command:

```bash
bash supabase/tests/run-phase1-local.sh
```

The runner uses the PostgreSQL tools already installed, creates a fresh database under `/tmp`, applies the draft and seed, runs the checks, and stops the server afterward. It uses a private Unix socket with TCP disabled and never connects to remote Supabase. Logs remain in the temporary directory. On another machine, supply `PHASE1_PG_BIN` if the tools are not detected automatically.

Against a **fresh disposable vanilla PostgreSQL 15+ database** owned by the test account:

```bash
psql "$PHASE1_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/local_auth_stub.sql \
  -f supabase/migrations/20261006000100_registration_schema.sql \
  -f supabase/seed.sql \
  -f supabase/tests/phase1_schema.sql
```

**Never run the Auth stub on Supabase.** It only mocks the minimal Auth table and API roles on an empty local database. On a disposable Supabase environment, apply the migration and seed using its existing Auth schema, then run only the test script as the database owner.

Repeat tests after applying the schema once:

```bash
psql "$PHASE1_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/phase1_schema.sql
```

Fixture rows roll back; sequence values can still advance, so delegate-number gaps are normal.

**Observed: 64 checks passed on PostgreSQL 18.1**, including all Phase 1 rejection cases, purchase before verification, multiple receipts, combined approval, rejection/resubmission history, immutable evidence, and API audit-write denial.

These are local SQL tests with a minimal Auth stub, not real API-session or Supabase compatibility tests. Storage, the eight RPCs, allow policies, cron extensions, real-session RLS and parallel tests belong to Phase 2. Emails, physical-phone testing and deployment are later phases.

Approve the full draft SQL before starting Phase 2.
