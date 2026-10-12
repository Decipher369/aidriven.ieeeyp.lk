# AIDSL 2026 Summit

Route: `/`. The existing `/home` experience keeps its original shell.

## Architecture

- `Summit.jsx`: semantic scene content, navigation, native inquiry dialog and accessible FAQ.
- `Summit.module.scss`: scoped palette, spatial layouts and normal-flow reduced-motion layout.
- `motion.js`: one GSAP timeline per pinned scene, Lenis synchronization, intro and cursor. The shared mutable motion object is sampled from the active timeline; no React updates happen each frame.
- `webgl/Scene.jsx`: one persistent R3F Canvas, centered original GLB, depth-tested ecosystem orbit, restrained lights and contact text texture.
- `webgl/shaders.js`: noise-based molten surface, rounded registration aperture and radial/tangential contact text displacement.
- `data/content.js`: event facts, partner placeholders and FAQ.

## Assets

The 123 KB GLB is copied unchanged from the supplied exact-colour model. Its materials are preserved; a parent group controls transforms around the calculated visual center.

`public/graphics/aidsl-ecosystem.webp` is a 1536 px transparent rendering of the supplied SVG (about 128 KB). The SVG remains at `public/graphics/AIDSL_Web_Element.svg`, with repeated embedded images deduplicated; the original source also remains in `assets/`. The WebP is used for GPU texture and semantic fallback to avoid downloading the original 34 MB SVG.

Programme imagery is resized WebP from the project's existing AIDSL event photos. These illustrate the sessions; they are not announced 2026 speakers or programme content. See `public/images/programme/SOURCES.md`.

The local SDF orbit font is Liberation Sans; its license is included in `public/fonts/`.

## Content still awaiting organizer confirmation

## Root content migration

The cinematic experience is now the root page (`/`); the separate `/summit` route was removed. `/home` retains its own site shell.

`data/migrated.js` preserves the original root page's statistics, descriptions, six timed agenda entries, eight speaker roles, pass benefits, FAQ copy, historical partner assets and social links. The six agenda entries appear directly in the animated Programme scene. `Editorial.jsx` renders the speaker and fellowship details between the cinematic scenes, along with the four leadership profiles and both organizer logos. Historical partners remain separate from the 2026 partner placeholders.

Contact and partnership links use the original root page's published email, telephone and social destinations. Registration, pricing, date, venue and speaker identities remain unannounced. Registration buttons open an availability dialog. No sponsorship-deck file was supplied, so the deck action requests it by email.

## Local development

Use the project's existing pnpm installation:

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000/`.

## Validation status

The production build passes after allowing access to the existing Google Fonts downloads. Headless Chromium checks at 1440 × 1000 and 390 × 844 reported no runtime errors or horizontal overflow. FAQ interaction passed in desktop, mobile and reduced-motion modes. Reduced motion produces zero pin spacers. Screenshots were reviewed for the programme descriptions, pass comparison, experience cards, leadership, contact and organizer-logo footer. Physical-device performance and Safari remain unverified. No public deployment was performed.

The content refinement consolidates pillar descriptions into the card deck, the timed agenda into the Programme scene, and contact details into one ending. The Programme rows and imagery remain animated throughout the pinned scroll, and the agenda stays visible at the end. The pass comparison, historical logos and leadership have dedicated motion; reading sections use local reveal timing. Registration now follows invitation → passes → orange action panel.
