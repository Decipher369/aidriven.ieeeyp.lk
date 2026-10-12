# AIDSL registration and admin portals

The existing Next.js 16 / React 19 site now includes registration, delegate and admin portals backed by Supabase. The summit remains at `/`. Date, venue, ticket pricing/capacity and merchandise are placeholders. No sellable catalog data or admin password is committed.

## Run the website

```bash
pnpm install
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
# Set NEXT_PUBLIC_ADMIN_ACCOUNT_EMAIL to the real admin account email.
pnpm dev
```

Open `http://localhost:3000/register` or `http://localhost:3000/admin/login`. This machine's gitignored `.env.local` already contains your supplied public Supabase configuration and the requested admin email; preserve it instead of copying over it. Restart Next.js after changing public environment variables.

Without Supabase configuration, public forms render but actions are disabled and protected routes show a setup message. There is no fake authentication or hardcoded administrator password.

## Routes

| Delegate                                               | Admin                                                |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `/register`, `/login`                                  | `/admin/login`                                       |
| `/set-password`, `/forgot-password`, `/reset-password` | `/admin/dashboard`                                   |
| `/portal`                                              | `/admin/orders`, `/admin/orders/:id`                 |
| `/portal/register-ticket`, `/portal/merch`             | `/admin/delegates`, `/admin/delegates/:id`           |
| `/portal/checkout/:orderId`                            | `/admin/merch`                                       |
| `/portal/orders`, `/portal/orders/:id`                 | `/admin/check-in`                                    |
| `/portal/ticket`, `/portal/event`, `/portal/profile`   | `/admin/audit`, `/admin/event-info`, `/admin/export` |

An IEEE Member Pass can be purchased before membership verification. Membership number and all pending receipts are reviewed together as one package. Rejection preserves the package and every image; resubmission creates a new numbered attempt. Confirmation requires explicit membership approval where applicable. QR issuance and check-in happen in database transactions.

## Database review and tests

All schema changes live in `supabase/migrations/`. Review the full SQL before pushing to a remote project. [Phase 1 notes](supabase/PHASE_1_REVIEW.md) explain the schema and [Phase 2 notes](supabase/PHASE_2_REVIEW.md) explain access policies and functions; [requirements](REGISTRATION_SPEC.md) record site alignment. Your later instruction authorizes building all remaining phases without separate phase pauses.

Run isolated local schema, access-policy, RPC, concurrency and database-load checks:

```bash
bash supabase/tests/run-all-local.sh
```

The runner uses installed PostgreSQL 15+ tools, a private temporary Unix socket and fictional users. It stops the server afterward. It never connects to Supabase. On another machine, set `PHASE1_PG_BIN` to the PostgreSQL binary directory if needed. Python 3 and `psql` are also required.

`local_auth_stub.sql` and `local_platform_stub.sql` are test-only. **Never apply these files to Supabase.** The native tests do not execute the platform-specific cron/webhook migration or prove live Auth, Storage HTTP, CAPTCHA or email delivery.

```bash
pnpm exec tsc --noEmit
pnpm exec eslint components/registration lib/registration 'app/(registration)'
deno check --config supabase/functions/deno.json \
  supabase/functions/register-delegate/index.ts \
  supabase/functions/send-email/index.ts \
  supabase/functions/event-reminder/index.ts
pnpm exec playwright test --config playwright.registration.config.ts
pnpm build
```

The browser tests expect the site running on port 3100; set `REGISTRATION_TEST_URL` to change the base URL. Public tests work with or without Supabase configuration. Protected-screen tests require public Supabase configuration but intercept every Supabase request with fictional sessions, so they never create accounts or write to the real project. They use `/usr/bin/chromium`; set `PLAYWRIGHT_CHROMIUM_PATH` on another machine. Mocked-session tests are UI checks, not real Supabase authorization evidence.

## Supabase setup

1. Create a Supabase project near the delegates, for example Singapore or Mumbai. Save the database password in a password manager. Copy its URL, project ref and publishable/anon key. Keep the service-role key out of the repository and browser.
2. Use a supported Supabase CLI installation. Global `npm install -g supabase` is unsupported; use a project dependency or the package runner instead ([official CLI instructions](https://supabase.com/docs/guides/local-development/cli/getting-started)). This repository already includes `supabase/config.toml`.

```bash
pnpm dlx supabase@2.119.0 login
pnpm dlx supabase@2.119.0 link --project-ref YOUR_PROJECT_REF
pnpm dlx supabase@2.119.0 db push --include-seed
```

For local development with the full stack, install Docker and run `pnpm dlx supabase@2.119.0 start`; the CLI prints Studio, API and mail-viewer addresses. See [migration and seed deployment](https://supabase.com/docs/guides/deployment/database-migrations).

The migrations create the private 1 MB `receipts` bucket, enable `pgcrypto`, `pg_cron` and `pg_net`, and configure the daily 3-day unpaid-order expiry, email retry and hourly reminder checks. Keep Supabase Storage out of exposed PostgREST schemas: receipt metadata must be created by the Storage API, not direct REST table inserts.

### Auth dashboard actions

- Set Site URL to the final production origin. Allow production `/set-password` and `/reset-password`, plus the local development URLs in the config.
- Disable public sign-ups. Delegate invitations are sent by `register-delegate`. If your project rejects invitations while sign-ups are disabled, investigate that Auth configuration before changing it; do not silently enable public signup.
- Enable CAPTCHA/bot protection. Create a Cloudflare Turnstile site for the production/local hostname and configure its site key and secret. The public registration function also verifies Turnstile server-side. Login and password recovery pass the Turnstile token to Supabase Auth when the public site key is configured; configure the same provider and secret in the Auth dashboard.
- Set minimum password length to 8.
- Customize the invite template with `supabase/templates/invite.html`. Keep the single-use confirmation URL intact.
- Configure custom SMTP: `smtp-relay.brevo.com`, port 587, Brevo SMTP login/key, verified sender address. Raise the invitation/email rate limits for the event's expected traffic; do not rely on the restricted built-in sender.

### First admin

After applying **all migrations**, create the admin manually in Authentication → Users with the real email and the password you chose. Do not supply delegate registration metadata (`full_name`, `phone`, `institution`) on that Auth user. The trigger leaves this manually created user without a delegate profile. Copy its user UUID, then insert the admin data:

```sql
insert into public.admins(user_id, full_name)
values ('USER_UUID_HERE', 'AIDSL Administrator');
```

This is a data insert into the migrated schema, not a dashboard schema edit. Admin authority comes only from this row. The database permits one admin and refuses any account that already has a delegate profile. Do not delete a delegate profile to force promotion. Trusted provisioning may alternatively set `app_metadata.registration_admin = true` before creating the Auth user.

The admin login accepts either its real email or `admin@aidriven`. The alias maps to `NEXT_PUBLIC_ADMIN_ACCOUNT_EMAIL`; it never grants authority by itself. To change the real email later, update the same Auth user and this environment value, then rebuild/restart. Its UUID and audit history stay the same. No admin password is stored in source or environment examples.

### Brevo and Edge Functions

Verify the sender/domain with SPF and DKIM. Create separate SMTP and REST API keys. Disable click/open tracking for transactional auth emails so links are not rewritten.

Set secrets through the CLI using your own secure values:

```bash
pnpm dlx supabase@2.119.0 secrets set \
  BREVO_API_KEY=YOUR_VALUE SENDER_EMAIL=YOUR_VERIFIED_SENDER \
  SITE_URL=YOUR_PRODUCTION_ORIGIN EVENT_NAME='AIDSL 2026 Summit' \
  CURRENCY=YOUR_CURRENCY EMAIL_WEBHOOK_SECRET=YOUR_RANDOM_SECRET \
  TURNSTILE_SECRET=YOUR_TURNSTILE_SECRET REMINDER_DAYS_BEFORE=2
pnpm dlx supabase@2.119.0 functions deploy register-delegate
pnpm dlx supabase@2.119.0 functions deploy send-email
pnpm dlx supabase@2.119.0 functions deploy event-reminder
```

Supabase supplies the service-role key to the Edge Functions automatically. Registration is public but protected by CORS, validation, CAPTCHA and IP rate limits. Email/reminder workers reject requests without the webhook secret even though JWT verification is disabled for their custom authentication.

Provide the project URL and the **same** webhook secret to Supabase Vault. These are configuration data, not schema changes:

```sql
select vault.create_secret('YOUR_SUPABASE_URL', 'registration_supabase_url');
select vault.create_secret('YOUR_RANDOM_SECRET', 'registration_email_webhook_secret');
```

Use Vault's update operation if rotating an existing secret; do not create duplicate names. Until Vault configuration exists, queued messages stay in the database. Once configured, the cron worker dispatches them. Event reminders remain disabled until you set a real ISO `EVENT_DATE` with timezone. Set `VENUE` when announced.

Email delivery uses unique queue keys, exclusive claims and Brevo idempotency keys. Automatic retries are capped at three within a conservative 10-minute window. An uncertain delivery beyond that window becomes a permanent failure for manual reconciliation in Brevo; it is never blindly resent. Brevo's deduplication window is time-limited ([provider documentation](https://developers.brevo.com/changelog/2021/11/10)), so this is not a claim of unconditional exactly-once delivery.

Send every template to real Gmail and Outlook accounts and check inbox/spam placement before launch. Those live checks require your configured providers and inbox access; local checks cannot establish delivery quality.

## Configuration

Every variable is documented in `.env.example`. Only `NEXT_PUBLIC_` values reach the browser. Edge Function secrets must be set in Supabase; putting them in `.env.local` does not configure the functions.

| Location                   | Variables                                                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser                    | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_ADMIN_ACCOUNT_EMAIL`, `NEXT_PUBLIC_CURRENCY`              |
| Edge secrets               | `SITE_URL`, `SENDER_EMAIL`, `BREVO_API_KEY`, `EMAIL_WEBHOOK_SECRET`, `TURNSTILE_SECRET`, `EVENT_NAME`, `EVENT_DATE`, `VENUE`, `ORG_NAME`, `CURRENCY`, `REMINDER_DAYS_BEFORE` |
| Database constraints/logic | 3-day hold expiry; max 5 merch units per line. Changing these requires a new versioned migration; an environment variable alone does not change database rules.              |
| Supabase Vault             | `registration_supabase_url`, `registration_email_webhook_secret`                                                                                                             |
| Auth dashboard             | Brevo SMTP credentials, sender, URLs, CAPTCHA, minimum password length, rate limits                                                                                          |

Catalog prices/capacities and merchandise are awaiting organizer confirmation. Add them using a versioned migration/seed. Do not interpret zero price as “to be announced.” Payment instructions can be edited/published in `/admin/event-info`. If asked to remove a delegate, use an owner-approved versioned data migration to deactivate and anonymize personal fields instead of deleting records; remove Auth access separately through trusted administration.

## Hosting

Deploy this Next.js project to Vercel or Netlify with Next.js support. Build command: `pnpm build`. Configure public environment variables before building, then configure matching Auth redirects and Edge Function `SITE_URL`. Test direct visits to nested routes and password-email redirects.

The old GitHub Pages workflow is disabled for this application: dynamic portal routes require Next.js hosting. Do not publish the current app as a static GitHub Pages export. Security headers are configured in `next.config.ts` (CSP, nosniff, referrer policy and camera permissions). Confirm them on the actual host.

## Launch and event-day runbook

- Supabase Free can pause after inactivity, stopping reminders and check-in. Upgrade to Pro for the event window or ensure the project remains active.
- Free has no automatic backups. Regularly export delegates, orders and tickets through `/admin/export` and store CSVs privately.
- Receipts are compressed to approximately 300 KB, maximum 1600 px, JPEG, with a 1 MB bucket limit.
- Run Supabase Security Advisor and resolve every finding. Test delegate A/B/admin with real sessions, receipts via short-lived signed URLs, admin-only RPCs, CAPTCHA, invitation limits and real phone camera access.
- The day before: verify the event date/venue and bank instructions, catalog capacities, all receipt decisions, email failures, Supabase uptime, login and camera access. Export confirmed tickets and prepare a charged phone, power bank and printed backup.
- Delegates should open `/portal/ticket` once while online and save a screenshot. Production builds cache the public ticket page shell/assets and user-specific QR data for offline display. Cached display does not override server-side check-in validity.
- If event Wi-Fi fails: use one shared printed/exported confirmed-ticket list, mark each arrival once, and reconcile check-ins after connectivity returns. Avoid separate offline lists that could admit duplicates.
- If an email is uncertain, check Brevo's delivery logs and the queue row before taking any resend action. Do not reset sent rows or dedupe keys casually.

## Verification boundary

Local checks cover SQL rules, simulated PostgREST claims, concurrent transactions, TypeScript, Edge Function types and browser layouts. They do not replace live Supabase Auth/Storage tests, Security Advisor, Gmail/Outlook spam checks, physical-phone testing or production deployment. Those require the remaining project/provider configuration.
