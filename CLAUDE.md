# CLAUDE.md — Nisha Gallery (project memory)

Art gallery site for the founder (Dr. Sanjay Anbu). Approved 2026-10-30: admin layout **A** (mock https://claude.ai/artifact/GvecRrqdNL6PNRkEij3V9k),
visitor site (mock https://claude.ai/artifact/KKxkhSFt7UVDQ7oZUo9NXx), NFT network **Polygon**, payments through **Nisha's own Razorpay account** (same pipeline as MedDroid, NOT MedDroid's account or keys; founder 2026-10-31),
crypto as second options: **Polygon (main), Ethereum, BNB Smart Chain, Bitcoin, Solana**.

## What it does
- Only the admin uploads. Each upload = an artwork with a **normal copy** (signed print + high-res download, many sales) and a
  **1-of-1 NFT copy** (token number = `nft_token`, metadata at `<worker>/gallery/nft/<token>.json`, ERC-721 style).
- Home page: hero slider of `on_home` works + grid. Artwork page (`#/art/<slug>`): both editions + checkout.
- Checkout: Razorpay (UPI/card/netbanking), or crypto paid **straight to the gallery's wallets**; the Worker checks every crypto
  payment on-chain (EVM JSON-RPC, blockstream.info, Solana RPC; Solana Pay reference so no hash to paste). A quote/NFT hold lasts 30 min.
- Admin (`#/admin`, Google sign-in via MedDroid's Supabase; allowed emails = `GALLERY_ADMINS` in medicalandroid `chat-worker/wrangler.toml`):
  Home page (upload, reorder, take off), Artworks (title, artist, medium, about, both prices, hide/delete), Orders (to send, mark shipped /
  NFT minted + mint tx), Payouts (one 0x wallet for Polygon/ETH/BNB, BTC address, SOL address, royalty %, NFT contract).

## Where things live
- **This repo:** React 18 + TS + Vite, hash routes, built to `docs/` (GitHub Pages: main /docs → https://sanjaydoc.github.io/nisha-gallery/).
  `src/api.ts` (Worker calls, types, CHAINS), `src/pay.ts` (Razorpay Checkout, MetaMask/EIP-681, BIP21, Solana Pay, QR), `src/Site.tsx`,
  `src/Admin.tsx`, `src/styles.css` (`ng-*` site, `.ad` admin = MedDroid admin look).
- **Backend:** medicalandroid repo → `chat-worker/worker.js` section "Nisha Gallery (/gallery/*)" (auto-deploys via Workers Builds).
  Tables/buckets: medicalandroid `supabase/gallery.sql` (gallery_artworks, gallery_orders, gallery_settings; buckets `gallery` public,
  `gallery-originals` private → buyers get 7-day signed links).
- Deploy: **right now GitHub Pages serves the preview build** (`npm run build:preview` = demo data, simulated payments; founder
  2026-10-30: "light theme + live on GitHub Pages"). Once Nisha's Supabase is connected: `npm run build` (live), commit `docs/`, push main.
- Theme: visitor site is LIGHT (warm paper #faf8f4, founder 2026-10-30); admin keeps the MedDroid admin look.

## Demo
`VITE_DEMO=1 npx vite build --outDir <tmp>` → `src/demo.ts` fakes the API in the browser (6 sample works, simulated Razorpay and
crypto, admin open without sign-in). Published as https://claude.ai/artifact/SphkBWyL1gvFLxxMf4RzCb (inlined single HTML).

## Nisha's own Supabase (founder plan 2026-10-30)
Nisha creates the Supabase project and runs medicalandroid `supabase/gallery.sql`. Then: her project URL + publishable key go into
`src/api.ts` (createClient), URL into `GALLERY_SUPABASE_URL` in medicalandroid `chat-worker/wrangler.toml`, and her **service_role key**
as Worker secret `GALLERY_SUPABASE_SERVICE_KEY` (Cloudflare dashboard; never in chat or git). Add the site URL to her Supabase Auth
redirect URLs and enable Google sign-in there.

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
- Razorpay: the gallery uses Nisha's own account only (Worker secrets GALLERY_RAZORPAY_KEY_ID / _KEY_SECRET / _WEBHOOK_SECRET, webhook
  `<worker>/gallery/razorpay-webhook`). Razorpay restricts crypto/NFT-related payments: Nisha should tell Razorpay she sells art prints
  and check before taking NFT payments through it (prints are lower risk).
- Webhook URL: https://medicalandroid-chat.dr-sanjayanbu.workers.dev/gallery/razorpay-webhook (events payment.captured + order.paid).
  Pinned "Nisha Gallery Launch" artifact https://claude.ai/artifact/53RNKHn6gayFq6Ukz6eBtm updated to v2 (2026-10-31): Razorpay row = Nisha's own
  account, new step 5 (open her Razorpay + 3 Worker secrets + webhook), warning card rewritten. Status: waiting for Nisha's Razorpay account.
- Tests: worker 45/45 (scratchpad `galw/test.mjs`), browser e2e 21/21 (`galw/e2e.mjs`: real worker code + fake Supabase/Razorpay/chains).
