# CLAUDE.md — Art From Vibrance (project memory)

Art gallery site (Nisha's), repo **github.com/joysteadlabs/Art-From-Vibrance** (was built as "Nisha Gallery" in sanjaydoc/nisha-gallery;
renamed + moved 2026-10-31). Founder: Dr. Sanjay Anbu. Approved designs: admin layout **A** (mock https://claude.ai/artifact/GvecRrqdNL6PNRkEij3V9k),
visitor site (mock https://claude.ai/artifact/KKxkhSFt7UVDQ7oZUo9NXx). NFT network **Polygon**; crypto: Polygon (main), Ethereum, BNB, Bitcoin, Solana.

## ⚠️ Founder rule (2026-10-31): NOTHING shared with MedDroid / medicalandroid
Own GitHub repo (joysteadlabs), own Supabase (Nisha's), own Razorpay (Nisha's), own Cloudflare Worker (Nisha's account, `worker/`).
Never point this site at MedDroid's Worker, Supabase, keys or accounts, and never add gallery code to the medicalandroid repo.

## What it does
- Only the admin uploads. Each upload = an artwork with a **normal copy** (signed print + high-res download, many sales) and a
  **1-of-1 NFT copy** (token number = `nft_token`, metadata at `<worker>/gallery/nft/<token>.json`, ERC-721 style).
- Home page: hero slider of `on_home` works + grid. Artwork page (`#/art/<slug>`): both editions + checkout.
- Checkout: Razorpay (UPI/card/netbanking, Nisha's account), or crypto paid **straight to the gallery's wallets**; the Worker checks every
  crypto payment on-chain (EVM JSON-RPC, blockstream.info, Solana RPC; Solana Pay reference). A quote/NFT hold lasts 30 min.
- Admin (`#/admin`): Google sign-in through **Nisha's Supabase**; allowed emails = `GALLERY_ADMINS` in `worker/wrangler.toml`.
  Home page (upload, reorder, take off), Artworks, Orders (mark shipped / NFT minted + tx), Payouts (wallets, royalty %, NFT contract).

## Where things live (all in this repo)
- `src/` React 18 + TS + Vite, hash routes, built to `docs/` (GitHub Pages: main /docs → https://joysteadlabs.github.io/Art-From-Vibrance/).
- **`public/config.js` → `docs/config.js`**: `window.GALLERY_CONFIG = { api, supabaseUrl, supabaseKey }` (all public). Edit `docs/config.js`
  on GitHub to connect, no rebuild. Empty supabaseUrl/supabaseKey = **PREVIEW** (sample paintings, nothing saved, banner says so) — that is
  why uploads vanished on refresh before (2026-10-31). `api` (payments Worker) is optional: without it the site browses + admin works,
  checkout says "Payments are not switched on yet".
- **Uploads + admin = direct Supabase (founder 2026-10-31: "use the working code of MedDroid medical records which save the images")**:
  same pattern as MedDroid `client/src/api/recordFiles.ts` (signed-in browser → `supabase.storage.from(bucket).upload`, guarded by Storage
  policies), code pattern only, Nisha's own project. `src/api.ts` DIRECT functions: adminUpload (web → public `gallery`, original → private
  `gallery-originals`), adminCreate/Update/Delete/Orders/Fulfil/Settings via PostgREST; public list via views `gallery_artworks_public`
  (no original_path) + `gallery_pay_public`. Security = `worker/gallery.sql` section 6: table `gallery_admins(email)`, function
  `gallery_is_admin()` (JWT email), RLS policies for admins, storage.objects insert/update/delete/read-originals for admins only.
  Admin auth (founder 2026-10-31: "create a signup form, login form ... admin login form"): `AuthForms` in src/Admin.tsx — tabs
  **Sign in / Create account**, **Forgot password?** → reset email → link lands on the site root → main.tsx (`authReturn`) opens #/admin →
  "Choose a new password" (PASSWORD_RECOVERY / `isRecovery()`); confirm-email links also land on #/admin. Google button removed (Google is
  not set up in her Supabase). Anyone can create an account, but ONLY emails in `gallery_admins` get the dashboard; others see
  "not on the gallery admin list" + the SQL to add them. Supabase must allow email sign-ups (Authentication → Sign In / Providers → Email).
  CFG strips a pasted '/rest/v1/' from the URL.
- `worker/worker.js` + `worker/wrangler.toml`: the gallery's own Cloudflare Worker for PAYMENTS (`/gallery/order`, `/gallery/verify`,
  `/gallery/razorpay-webhook`, `/gallery/nft/<n>.json`, `/health`; old admin routes kept). [vars]: ALLOWED_ORIGINS, GALLERY_SITE,
  GALLERY_ADMINS, GALLERY_SUPABASE_URL. Secrets (dashboard only): GALLERY_SUPABASE_SERVICE_KEY, GALLERY_RAZORPAY_KEY_ID / _KEY_SECRET /
  _WEBHOOK_SECRET, optional RESEND_API_KEY + GALLERY_EMAIL_FROM. Optional KV binding RATE_LIMIT.
- `worker/gallery.sql`: tables, buckets `gallery` (public) + `gallery-originals` (private), section 6 admins/policies/views. Re-run safe.
- Release: `npm run build`, keep the FILLED `docs/config.js` (build copies public/config.js over it — fill both), commit `docs/`, push main.
- Theme: visitor site LIGHT (warm paper #faf8f4); admin uses the dark admin look.

## Connect steps (Nisha's accounts)
1. Supabase SQL editor: run `worker/gallery.sql` (again if run before — it is re-run safe; section 6 is new). Add her admin email:
   `insert into gallery_admins (email) values ('her@email') on conflict do nothing;`
2. Supabase → Authentication → URL Configuration: Site URL + redirect `https://joysteadlabs.github.io/Art-From-Vibrance/`.
   (Google provider optional; email + password works without it.)
3. `docs/config.js` on GitHub: supabaseUrl + supabaseKey (publishable). Commit → uploads save. (Uploads need nothing else.)
4. Payments later: Cloudflare (Nisha's, free) → Import repository joysteadlabs/Art-From-Vibrance, root `worker`; GALLERY_SUPABASE_URL in
   wrangler.toml, secret GALLERY_SUPABASE_SERVICE_KEY; then `api` in config.js; Razorpay 3 secrets + webhook `<worker>/gallery/razorpay-webhook`.

## Tests (scratchpad `afvw/`, 2026-10-31): tsc strict + noUnused clean, ESLint (ts + react-hooks) clean; worker 48/48 (`test.mjs`); browser e2e 23/23 (`e2e.mjs`: direct Supabase uploads to both buckets,
artworks survive a page refresh, payments through the real worker code with fake Razorpay/chains); `nw.mjs` 5/5 (no Worker: browse + admin; password sign-in, wrong password message); `auth.mjs` 18/18 (one failing data part keeps the dashboard open + shows the real error; missing setup SQL shows the DB error; sign up incl. short/mismatch/duplicate,
unconfirmed, wrong password, admin in + survives refresh, non-admin message, forgot → reset link → new password, confirm link, phone);
SQL on real Postgres 16 WITHOUT default privileges (like her project; section 7 grants fix "permission denied for table") — (admin writes, stranger blocked incl. storage, anon sees only the views, original_path hidden, re-run safe).

## See it on your wall (founder-approved mock https://claude.ai/artifact/HUo2YJDoXAj5ZbS2FT6DmJ, built 2026-10-31)
- `src/Wall.tsx`: `WallCard` on the home page (title exactly "Upload or Take pic of your home to see matching paintings in gallery";
  Take a photo = `<input capture="environment">`, Upload from gallery) and `WallPage` at `#/wall`: 1 photo (sample room until the
  user adds one) → 2 pick 3 works (min(3, works)) → 3 each placed on the plainest wall area (`findWall`: lowest brightness variance
  in the upper 72%, favouring the middle) at an estimated real size (cm parsed from `medium` "W × H cm"; door ≈ 2.1 m ≈ 62% of photo
  height), above furniture; drag to move, Smaller/Real/Larger, No frame/Black/Wood (preview only), Buy → `#/art/<slug>`.
  Browser-only: the photo never leaves the device. No perspective warp yet (straight-on photos work best). Styles `.rv-*` in styles.css
  (Model Studio look). Tests: scratchpad `gallery-room/e2e.mjs` 22/22 (desktop + 390px) + `galw/e2e.mjs` 21/21 unchanged.

### Founder summary (as reported 2026-10-31)
LIVE on https://sanjaydoc.github.io/nisha-gallery/
| Part | What it does |
|---|---|
| Home page card | "Upload or Take pic of your home to see matching paintings in gallery", with Take a photo (opens the phone camera) and Upload from gallery |
| Step 1 · Your wall | Shows your photo, with a sample room until you add one |
| Step 2 · Pick 3 paintings | Tap 3 favourites (1-2-3 badges); the next step unlocks at 3 |
| Step 3 · See them on your wall | Each painting sits on the clearest part of your wall, above the furniture, at about its real size. Switch between the 3, drag to move, choose size and frame, then Buy this painting opens its page |
- Tests: 22/22 for the new feature (desktop + phone); the gallery's existing 21 checks still pass.
- Photo stays private: never leaves the phone, nothing uploaded.
- Sizes are estimates from the size in the painting's description (e.g. "90 × 120 cm"); no size listed → typical size, and the page says so.
- Angled photos: no perspective bending yet, so straight-on photos look best.
- Frames are a preview only; the gallery doesn't sell frames.
- Sample artworks until Nisha's database is connected.
- Next: founder tries it on the phone and says what to adjust.

## Not done yet / honest notes
- **On-chain minting is manual:** after an NFT sale the admin mints token #N to the buyer's wallet (needs an ERC-721 contract on Polygon,
  not deployed yet) and marks the order "NFT minted" with the tx. Next step: deploy the contract and automate minting.
- Razorpay restricts crypto/NFT-related payments: Nisha should tell Razorpay she sells art prints and check before taking NFT payments through it.

## Live status (2026-10-31)
- Claude pushes directly: sanjaydoc is a Write collaborator + Claude GitHub App installed on joysteadlabs (2026-10-31).
- Nisha's Supabase project `rzgizjhuzpbngnbhunhu` connected via docs/config.js (publishable key, public). Admin email: joysteadlabs@gmail.com
  (+ dr.sanjayanbu@gmail.com) in gallery_admins. Payments Worker not set up yet (api empty).
