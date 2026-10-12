-- No invented catalog prices/capacities or admin credentials. Ticket and merch
-- placeholders stay in the landing-page presentation until details are final.
insert into public.event_info(slug, title, body, published) values
  ('about', 'AIDSL 2026 Summit',
   'Organized by AI Driven Sri Lanka and IEEE Young Professionals Sri Lanka.', true),
  ('schedule', 'Date and venue', E'Date: To be announced.\n\nVenue: To be announced.', true),
  ('payment-instructions', 'Payment instructions', 'To be announced.', false)
on conflict (slug) do nothing;
