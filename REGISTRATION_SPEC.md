# AIDSL registration engine: site alignment

Status: implementation of all phases authorized by the organizer. Migrations are locally tested and available for SQL review; no remote migration has been applied.

## Confirmed decisions

- Extend the existing Next.js 16 / React 19 / Tailwind 4 application. Use the App Router instead of React Router; do not introduce a separate Vite app.
- Keep the summit landing page at `/`. Integrate its registration actions with `/register` in the delegate portal phase.
- Keep delegate routes under `/portal` and admin routes under `/admin` on the same backend.
- Event name: AIDSL 2026 Summit. Organizers: AI Driven Sri Lanka and IEEE Young Professionals Sri Lanka, as currently described by the site.
- Date and exact venue: **To be announced**. Do not schedule a dated event reminder until a real event date has been supplied.
- Ticket types: IEEE Member Pass and Standard Delegate Pass, matching the existing landing page. Prices and capacities remain placeholders.
- Merchandise remains placeholders until a real catalog is supplied.
- Delegates can place an IEEE Member Pass order without prior membership approval. Collect the membership number with the purchase; reserve the ticket and leave the order pending. The admin reviews the membership number and payment receipts together afterward. Confirmation and QR issuance require approval of both membership and payment in that combined review.
- Support multiple receipts per order with preserved submission and review history.
- One manually provisioned admin account. Requested login alias: `admin@aidriven`. Never seed or commit an admin password or create an admin from browser metadata.
- Use provider-supported email idempotency and controlled retries in addition to unique database queue keys. Verify provider guarantees in Phase 3; do not claim a unique database key alone guarantees exactly-once external delivery.
- Hold expiry: 3 days; event reminder: 2 days before the confirmed date; merchandise quantity: at most 5 per line.

## Architecture

```text
app/                         existing Next.js application
  (registration)/            authentication and delegate route group
  (administration)/          admin route group
components/                  reusable portal and admin UI
lib/                         typed Supabase clients and validation
supabase/
  migrations/                versioned SQL only
  functions/                 register-delegate, send-email, event-reminder
  seed.sql                   confirmed catalog data and safe placeholder content
  tests/                     SQL rules, privileges, and concurrency scripts
README.md                    development, setup, deployment, event-day instructions
.env.example                 documented configuration; never real credentials
```

Route groups do not change the URLs specified in the original build prompt. New registration code uses strict TypeScript. Existing landing-page JavaScript is outside the registration implementation scope.

Use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the public client configuration. The service-role key remains exclusively in Supabase Edge Functions, provided by Supabase. Local development remains at `http://localhost:3000`.

Portal and admin screens should use the summit's branding with mobile-first forms and tables. Their own layouts should avoid applying cinematic scrolling to transactional screens. Include loading, empty, and error states on every screen.

## Placeholder behavior

Do not invent purchasable ticket prices, merchandise products, or a seat count. Placeholder labels are presentation content, not sellable catalog rows. Purchases remain unavailable until real active catalog rows are configured through versioned migrations or the seed file. In particular, a zero price must not silently mean “price to be announced.”

Production URL, currency, verified Brevo sender, bank instructions, final catalog, and the underlying admin email remain configuration inputs. The site's existing contact address is not evidence of a verified transactional sender.

## Configuration and provisioning decisions

1. Membership review timing is confirmed: purchase first, then membership and payment review together. Each review attempt retains the membership number reviewed so subsequent correction cannot rewrite earlier review evidence.
2. Multiple receipts are confirmed as package review: all currently pending receipts belong to one payment review attempt, decided atomically. A later resubmission creates a new attempt while retaining every earlier receipt and decision. The schema adds `payment_review_attempts` to represent the package, with `payment_submissions.review_attempt_id` linking every receipt to its review history.
3. Admin login: the organizer supplied a real email, stored in gitignored `.env.local`. The UI accepts `admin@aidriven` as an alias for that account. Admin authority comes exclusively from the `admins` table.
4. Admin/profile exclusivity: manually created Auth accounts without delegate registration metadata stay without profiles. The registration Edge Function always sends validated delegate metadata. Trusted provisioning may also set `app_metadata.registration_admin` before Auth insertion. Neither mechanism grants authority; the owner manually inserts the `admins` row. Existing delegate profiles cannot be promoted or silently deleted.

## Database requirements

Keep the original enums, money types, UUID identifiers, restrictive foreign keys, status rules, immutable order items, append-only audit log, RLS requirements, and eight RPC functions.

The database must additionally enforce ticket-to-order ownership and ticket-line consistency, prevent capacity overflow under concurrent writes, and preserve size consistency when a parent merchandise item changes. Business records cannot be hard-deleted. Sensitive identity fields and admin authority are never writable from the browser.

All receipts stay in a private bucket. Every submission retains its object path, submission time, decision, reviewer, review time, and rejection reason. Decisions must not discard or silently overwrite earlier receipt history.

## Implementation phases

1. **Schema:** draft migration SQL, safe seed data, integrity triggers and indexes, direct SQL rejection tests. Show SQL for review before declaring it final. Report files, run instructions, and actual test results.
2. **RLS, storage, RPC:** review SQL, implement policies and transactional functions, and test privileges, real sessions, and concurrency. Report actual validation results.
3. **Edge Functions and email:** registration, CAPTCHA, rate limiting, Brevo templates, idempotency and retries. Real Gmail/Outlook delivery checks require configured provider accounts and inbox access. Report actual validation results.
4. **Delegate portal:** registration through ticket display, profile and order history, receipt compression and retries, phone verification. Report actual validation results.
5. **Admin portal:** queue, membership and receipt review, delegates, merch totals, check-in, audit, event info, exports. Report actual validation results.
6. **Hardening and docs:** Security Advisor, load test, deployment headers, setup and event-day runbook. Stop with actual validation results.

Do not deploy, apply remote migrations, provision credentials, or claim live inbox/device tests have passed without carrying out those actions with the required access.

The organizer subsequently requested all forms, portals and login screens immediately, authorizing continuation through the remaining phases without individual approval pauses. Live validation still requires Supabase, CAPTCHA and Brevo configuration.
