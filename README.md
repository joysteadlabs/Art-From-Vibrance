# Art From Vibrance

Original artworks, each sold as a **normal copy** (signed print + high-res download) and a **1-of-1 NFT copy** on Polygon.
Pay by UPI, card or netbanking (Razorpay), or with Polygon, Ethereum, BNB, Bitcoin or Solana.

- Site: https://joysteadlabs.github.io/Art-From-Vibrance/
- Admin: https://joysteadlabs.github.io/Art-From-Vibrance/#/admin
- Repo: https://github.com/joysteadlabs/Art-From-Vibrance

| Folder | What |
|---|---|
| `docs/` | The live website (GitHub Pages: main → /docs) |
| `docs/config.js` | Connection settings (Worker URL + Supabase URL + publishable key). Empty = preview, nothing saved |
| `src/` | Site source (React + Vite) |
| `worker/` | The gallery's own server (Cloudflare Worker) + `gallery.sql` for Supabase |

Develop: `npm install`, `npm run dev`. Release: `npm run build`, commit `docs/`, push `main`. Full notes: `CLAUDE.md`.
