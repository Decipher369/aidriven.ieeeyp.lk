# Local verification — 6 October 2026

- Production `pnpm build`: passed with the supplied public Supabase configuration.
- TypeScript strict `tsc --noEmit`: passed.
- Registration ESLint: passed.
- Deno type checks for the three Edge Functions: passed.
- Phase 1 direct SQL integrity tests: 64 passed.
- Phase 2 role/privilege/RPC tests: 46 passed.
- Four parallel transaction checks: passed (last seat, duplicate delegate purchase, duplicate confirmation, duplicate QR scan).
- Fifty simultaneous database ticket orders: all succeeded within capacity (3.15 seconds in the latest run).
- Five Chromium browser tests: passed. Desktop and mobile public/admin screens, joint receipt and membership approval, delegate screens/QR, admin access denial. Protected screens used fictional intercepted Supabase responses, not real Auth accounts.

Native database tests ran on temporary PostgreSQL 18.1 with test-only Auth and Storage stubs. This verifies SQL constraints, simulated session claims and transaction behavior, not the complete hosted Supabase stack. Test users and orders were discarded.

After CLI login, all six migrations and the seed were applied to the linked hosted project. All three Edge Functions were deployed. Hosted database lint returned no schema errors. Anonymous REST reads of profiles, admins, orders, tickets, event_info and audit_log returned HTTP 401 / insufficient_privilege. Public sign-ups are still enabled and require the organizer's Auth dashboard configuration. No admin account, real delegate registration or payment was created remotely.

Pending configuration-dependent checks: Vault secrets and scheduled-worker execution, real delegate/admin Auth and Storage HTTP authorization, CAPTCHA and Brevo delivery, Gmail/Outlook spam placement, physical-phone camera and offline tests, Supabase Security Advisor, and production hosting.
