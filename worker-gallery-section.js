// ───────────────────────────── Nisha Gallery (/gallery/*) ─────────────────────────────
// Founder approved 2026-10-30 (admin mock A + visitor mock). Site: github.com/sanjaydoc/nisha-gallery.
// Each artwork = a normal copy (print / download, many sales) + a 1-of-1 NFT copy. Buyers pay by Razorpay
// (same account as MedDroid) or crypto straight to the gallery's wallets: Polygon (main), Ethereum,
// BNB Smart Chain, Bitcoin, Solana. Every crypto payment is checked on-chain before the order is marked paid.
// Tables + buckets: supabase/gallery.sql. Admins: emails in GALLERY_ADMINS (wrangler.toml [vars]).
const GAL_CHAINS = {
  polygon: { kind: 'evm', chainId: 137, coin: 'POL', cg: 'polygon-ecosystem-token', dp: 6, rpc: (env) => env.POLYGON_RPC || 'https://polygon-rpc.com', name: 'Polygon' },
  eth: { kind: 'evm', chainId: 1, coin: 'ETH', cg: 'ethereum', dp: 6, rpc: (env) => env.ETH_RPC || 'https://cloudflare-eth.com', name: 'Ethereum' },
  bnb: { kind: 'evm', chainId: 56, coin: 'BNB', cg: 'binancecoin', dp: 6, rpc: (env) => env.BNB_RPC || 'https://bsc-dataseed.binance.org', name: 'BNB Smart Chain' },
  btc: { kind: 'btc', coin: 'BTC', cg: 'bitcoin', dp: 8, name: 'Bitcoin' },
  sol: { kind: 'sol', coin: 'SOL', cg: 'solana', dp: 6, rpc: (env) => env.SOL_RPC || 'https://api.mainnet-beta.solana.com', name: 'Solana' },
};
const GAL_DEC = { evm: 18, btc: 8, sol: 9 };
// The gallery can live in its own Supabase project (Nisha's account): GALLERY_SUPABASE_URL ([vars]) + GALLERY_SUPABASE_SERVICE_KEY
// (secret). Without them it uses MedDroid's project.
const galDb = (env) => ({ url: env.GALLERY_SUPABASE_URL || env.SUPABASE_URL, key: env.GALLERY_SUPABASE_SERVICE_KEY || (env.GALLERY_SUPABASE_URL ? '' : env.SUPABASE_SERVICE_KEY) });
const GAL_SVC = (env) => { const d = galDb(env); return { apikey: d.key, Authorization: `Bearer ${d.key}` }; };
const GAL_QUOTE_MIN = 30;           // a crypto quote / NFT reservation lasts 30 minutes
const GAL_SLIP = 0.99;              // accept up to 1% less (wallet rounding, rate moves)
const GAL_SEL = 'id,slug,title,artist,medium,about,image_url,copy_price,nft_price,nft_token,nft_status,reserved_until,nft_owner,mint_tx,on_home,home_order,published,copies_sold,created_at';

function galCors(request, env) {
  const { cors, origin, allowed } = payCors(request, env);
  return { cors: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-File-Name' }, origin, allowed };
}
const galSb = (env, path, init = {}) => fetch(`${galDb(env).url}/rest/v1/${path}`, { ...init, headers: { ...GAL_SVC(env), 'Content-Type': 'application/json', ...(init.headers || {}) } });
async function galRows(env, path) { const r = await galSb(env, path); return r.ok ? r.json() : []; }
const galNftFree = (a) => a.nft_status === 'available' || (a.nft_status === 'reserved' && (!a.reserved_until || Date.parse(a.reserved_until) < Date.now()));
const galPublic = ({ original_path, reserved_until, ...a }) => ({ ...a, nft_status: galNftFree({ ...a, reserved_until }) ? 'available' : a.nft_status }); // never the private file path
async function galSettings(env) { return (await galRows(env, 'gallery_settings?id=eq.1&select=*'))[0] || {}; }
function galWallets(s) { return { polygon: s.evm_wallet || '', eth: s.evm_wallet || '', bnb: s.evm_wallet || '', btc: s.btc_address || '', sol: s.sol_address || '' }; }
async function galAdmin(request, env) {
  const d = galDb(env);
  const u = await verifyUser({ SUPABASE_URL: d.url, SUPABASE_SERVICE_KEY: d.key }, bearer(request));
  const list = String(env.GALLERY_ADMINS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return u && list.includes((u.email || '').toLowerCase()) ? u : null;
}
// Live coin prices in rupees (CoinGecko), cached 2 minutes.
async function galRates(env) {
  const k = 'gal:rates';
  if (env.RATE_LIMIT) { const c = await env.RATE_LIMIT.get(k, 'json').catch(() => null); if (c) return c; }
  const ids = [...new Set(Object.values(GAL_CHAINS).map((c) => c.cg))].join(',');
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr`, { headers: { accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  const out = {}; for (const [m, c] of Object.entries(GAL_CHAINS)) { const p = j?.[c.cg]?.inr; if (p > 0) out[m] = p; }
  if (env.RATE_LIMIT && Object.keys(out).length) await env.RATE_LIMIT.put(k, JSON.stringify(out), { expirationTtl: 120 }).catch(() => {});
  return out;
}
// Decimal string → integer base units, and back (BigInt, no float errors).
function galUnits(s, dec) { const [i, f = ''] = String(s).split('.'); return BigInt(i || '0') * 10n ** BigInt(dec) + BigInt((f + '0'.repeat(dec)).slice(0, dec) || '0'); }
function galCeil(x, dp) { const m = 10 ** dp; return (Math.ceil(x * m) / m).toFixed(dp); }
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b) break; s = '1' + s; } return s; }
const galSlug = (t) => (String(t).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'art') + '-' + Date.now().toString(36).slice(-5);
async function galRpc(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(j.error.message || 'RPC error');
  return j.result;
}
async function galSigned(env, path, secs = 3600) {
  if (!path) return '';
  const r = await fetch(`${galDb(env).url}/storage/v1/object/sign/gallery-originals/${path}`, { method: 'POST', headers: { ...GAL_SVC(env), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: secs }) });
  const j = await r.json().catch(() => ({}));
  return j.signedURL ? `${galDb(env).url}/storage/v1${j.signedURL}` : '';
}

/* ---- on-chain checks. Each returns { ok } | { pending, msg } | { error } ---- */
async function galCheckEvm(env, ch, o, tx) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return { error: 'That transaction hash does not look right (0x + 64 characters).' };
  const url = ch.rpc(env);
  const t = await galRpc(url, 'eth_getTransactionByHash', [tx]);
  if (!t) return { pending: true, msg: 'Waiting for the network to see the payment…' };
  if (String(t.to || '').toLowerCase() !== o.pay_to.toLowerCase()) return { error: 'This transaction was not sent to the gallery wallet.' };
  if (BigInt(t.value) * 100n < galUnits(o.crypto_amount, 18) * BigInt(Math.round(GAL_SLIP * 100))) return { error: `The amount is less than ${o.crypto_amount} ${o.crypto_coin}.` };
  if (t.chainId && Number(BigInt(t.chainId)) !== ch.chainId) return { error: `This payment was on another network, not ${ch.name}.` };
  const rc = await galRpc(url, 'eth_getTransactionReceipt', [tx]);
  if (!rc) return { pending: true, msg: 'Payment sent, waiting for it to be confirmed…' };
  if (rc.status !== '0x1') return { error: 'This transaction failed on-chain.' };
  const b = await galRpc(url, 'eth_getBlockByNumber', [rc.blockNumber, false]);
  if (b && Number(BigInt(b.timestamp)) * 1000 < Date.parse(o.created_at) - 10 * 60e3) return { error: 'This transaction is older than the order.' };
  return { ok: true };
}
async function galCheckBtc(env, o, tx) {
  if (!/^[0-9a-fA-F]{64}$/.test(tx)) return { error: 'That Bitcoin transaction id does not look right (64 characters).' };
  const r = await fetch(`${env.BTC_API || 'https://blockstream.info/api'}/tx/${tx}`);
  if (r.status === 404 || r.status === 400) return { pending: true, msg: 'Waiting for the Bitcoin network to see the payment…' };
  const t = await r.json().catch(() => null);
  if (!t) return { pending: true, msg: 'Waiting for the Bitcoin network…' };
  const sats = (t.vout || []).filter((v) => v.scriptpubkey_address === o.pay_to).reduce((n, v) => n + BigInt(v.value || 0), 0n);
  if (sats === 0n) return { error: 'This transaction did not pay the gallery Bitcoin address.' };
  if (sats * 100n < galUnits(o.crypto_amount, 8) * BigInt(Math.round(GAL_SLIP * 100))) return { error: `The amount is less than ${o.crypto_amount} BTC.` };
  if (!t.status?.confirmed) return { pending: true, msg: 'Payment seen. Waiting for 1 Bitcoin confirmation (about 10 minutes)…' };
  if (t.status.block_time * 1000 < Date.parse(o.created_at) - 60 * 60e3) return { error: 'This transaction is older than the order.' };
  return { ok: true };
}
// Solana Pay: the order carries a random reference key; the buyer's wallet adds it to the transfer, so we find
// the payment by that key (no hash to paste).
async function galCheckSol(env, o) {
  const url = GAL_CHAINS.sol.rpc(env);
  const sigs = await galRpc(url, 'getSignaturesForAddress', [o.reference, { limit: 5 }]);
  if (!sigs || !sigs.length) return { pending: true, msg: 'Waiting for the Solana payment…' };
  for (const s of sigs) {
    if (s.err) continue;
    const t = await galRpc(url, 'getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
    if (!t || t.meta?.err) continue;
    const keys = (t.transaction?.message?.accountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey));
    const i = keys.indexOf(o.pay_to);
    if (i < 0) continue;
    const got = BigInt(t.meta.postBalances[i]) - BigInt(t.meta.preBalances[i]);
    if (got * 100n >= galUnits(o.crypto_amount, 9) * BigInt(Math.round(GAL_SLIP * 100))) return { ok: true, tx: s.signature };
    return { error: `The Solana payment was less than ${o.crypto_amount} SOL.` };
  }
  return { pending: true, msg: 'Waiting for the Solana payment to confirm…' };
}

/** Mark an order paid (idempotent) and settle the artwork: NFT → sold to the buyer's wallet, copy → +1 sold. */
async function galMarkPaid(env, o, paymentRef) {
  const up = await galSb(env, `gallery_orders?id=eq.${o.id}&status=neq.paid`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString(), payment_ref: paymentRef }) });
  if (!up.ok) return { error: (await up.text()).includes('duplicate') ? 'This payment was already used for another order.' : 'Could not save the payment.' };
  const row = (await up.json())[0];
  if (!row) return { already: true };
  const a = (await galRows(env, `gallery_artworks?id=eq.${o.artwork_id}&select=id,copies_sold`))[0];
  if (o.edition === 'nft') await galSb(env, `gallery_artworks?id=eq.${o.artwork_id}`, { method: 'PATCH', body: JSON.stringify({ nft_status: 'sold', reserved_until: null, nft_owner: o.buyer_wallet }) });
  else if (a) await galSb(env, `gallery_artworks?id=eq.${o.artwork_id}`, { method: 'PATCH', body: JSON.stringify({ copies_sold: (a.copies_sold || 0) + 1 }) });
  if (env.RESEND_API_KEY && env.ADMIN_EMAIL) {
    fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.NOTIFY_FROM || 'MedDroid <onboarding@resend.dev>', to: (env.GALLERY_ADMINS || env.ADMIN_EMAIL).split(',')[0].trim(), subject: `Nisha Gallery: ${o.edition === 'nft' ? 'NFT' : 'copy'} sold · ₹${o.amount_inr.toLocaleString('en-IN')}`,
        text: `Order ${o.id}\nEdition: ${o.edition}\nPaid by: ${o.method}${o.crypto_amount ? ` (${o.crypto_amount} ${o.crypto_coin})` : ''}\nBuyer: ${o.buyer_name} <${o.buyer_email}> ${o.buyer_phone}\n${o.edition === 'nft' ? `NFT to wallet: ${o.buyer_wallet}` : `Ship to: ${o.ship_address}`}` }) }).catch(() => {});
  }
  return { paid: true };
}
async function galDone(env, o) {
  const a = (await galRows(env, `gallery_artworks?id=eq.${o.artwork_id}&select=original_path,title,nft_token`))[0] || {};
  return { paid: true, order: o.id, edition: o.edition, download: await galSigned(env, a.original_path, 7 * 86400), token: o.edition === 'nft' ? a.nft_token : undefined };
}

/* ---- public routes ---- */
async function galOrder(request, env, cors) {
  let p = {}; try { p = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }, cors); }
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (env.RATE_LIMIT && ip) {
    const k = `gal:ord:${ip}:${Math.floor(Date.now() / 3600e3)}`; const n = parseInt((await env.RATE_LIMIT.get(k)) || '0', 10);
    if (n >= 30) return json(429, { error: 'Too many orders from this network. Please try again in an hour.' }, cors);
    await env.RATE_LIMIT.put(k, String(n + 1), { expirationTtl: 7200 }).catch(() => {});
  }
  const edition = p.edition === 'nft' ? 'nft' : 'copy';
  const method = String(p.method || '');
  if (method !== 'razorpay' && !GAL_CHAINS[method]) return json(400, { error: 'Unknown payment method' }, cors);
  const b = p.buyer || {};
  const buyer = { buyer_name: String(b.name || '').trim().slice(0, 120), buyer_email: String(b.email || '').trim().toLowerCase().slice(0, 160), buyer_phone: String(b.phone || '').trim().slice(0, 30), ship_address: String(b.address || '').trim().slice(0, 500), buyer_wallet: String(b.wallet || '').trim().slice(0, 120) };
  if (!buyer.buyer_name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyer.buyer_email)) return json(400, { error: 'Please give your name and a valid email.' }, cors);
  if (edition === 'nft' && !/^0x[0-9a-fA-F]{40}$/.test(buyer.buyer_wallet)) return json(400, { error: 'Enter the Polygon wallet address (0x…) where the NFT should go.' }, cors);
  if (edition === 'copy' && !buyer.ship_address) return json(400, { error: 'Please give the delivery address for the print.' }, cors);
  const a = (await galRows(env, `gallery_artworks?id=eq.${encodeURIComponent(String(p.artworkId || ''))}&published=eq.true&select=${GAL_SEL}`))[0];
  if (!a) return json(404, { error: 'Artwork not found' }, cors);
  const amount = edition === 'nft' ? a.nft_price : a.copy_price;
  if (!(amount > 0)) return json(400, { error: 'This edition is not for sale.' }, cors);
  const expires = new Date(Date.now() + GAL_QUOTE_MIN * 60e3).toISOString();
  // Hold the 1-of-1 NFT while this buyer pays (only if it is free or an old hold has run out).
  if (edition === 'nft') {
    const hold = await galSb(env, `gallery_artworks?id=eq.${a.id}&or=(nft_status.eq.available,and(nft_status.eq.reserved,reserved_until.lt.${new Date().toISOString()}))`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ nft_status: 'reserved', reserved_until: expires }) });
    if (!hold.ok || !(await hold.json()).length) return json(409, { error: 'Someone is buying this NFT right now, or it is sold. Please try again later.' }, cors);
  }
  const row = { artwork_id: a.id, edition, method, amount_inr: amount, expires_at: expires, ...buyer };
  let extra = {};
  if (method === 'razorpay') {
    if (!env.GALLERY_RAZORPAY_KEY_ID || !env.GALLERY_RAZORPAY_KEY_SECRET) return json(503, { error: 'Card / UPI payments are not switched on yet.' }, cors);
    const r = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${env.GALLERY_RAZORPAY_KEY_ID}:${env.GALLERY_RAZORPAY_KEY_SECRET}`) },
      body: JSON.stringify({ amount: amount * 100, currency: 'INR', receipt: `ng_${edition}_${Date.now().toString(36)}`, notes: { kind: 'gallery', artwork: a.title.slice(0, 200), edition, email: buyer.buyer_email } }) });
    const o = await r.json().catch(() => ({}));
    if (!r.ok || !o.id) return json(502, { error: o?.error?.description || 'Could not start the payment. Please try again.' }, cors);
    row.rzp_order_id = o.id;
    extra = { key_id: env.GALLERY_RAZORPAY_KEY_ID, rzp_order_id: o.id, amount_paise: amount * 100 };
  } else {
    const ch = GAL_CHAINS[method];
    const to = galWallets(await galSettings(env))[method];
    if (!to) return json(503, { error: `${ch.name} payments are not set up yet.` }, cors);
    const rate = (await galRates(env))[method];
    if (!rate) return json(503, { error: 'Could not get the live coin price. Please try again in a minute, or pay by card / UPI.' }, cors);
    Object.assign(row, { crypto_amount: galCeil(amount / rate, ch.dp), crypto_coin: ch.coin, pay_to: to });
    if (method === 'sol') row.reference = b58(crypto.getRandomValues(new Uint8Array(32)));
    extra = { chain: method, chainId: ch.chainId, coin: ch.coin, network: ch.name, amount: row.crypto_amount, pay_to: to, reference: row.reference, rate_inr: rate };
  }
  const ins = await galSb(env, 'gallery_orders', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
  if (!ins.ok) return json(500, { error: 'Could not record the order. Please try again.' }, cors);
  const o = (await ins.json())[0];
  return json(200, { order: o.id, edition, method, amount_inr: amount, expires_at: expires, title: a.title, ...extra }, cors);
}
async function galVerify(request, env, cors) {
  let p = {}; try { p = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }, cors); }
  const o = (await galRows(env, `gallery_orders?id=eq.${encodeURIComponent(String(p.order || ''))}&select=*`))[0];
  if (!o) return json(404, { error: 'Order not found' }, cors);
  if (o.status === 'paid') return json(200, await galDone(env, o), cors);
  let res;
  if (o.method === 'razorpay') {
    const oid = String(p.razorpay_order_id || ''), pid = String(p.razorpay_payment_id || ''), sig = String(p.razorpay_signature || '');
    if (oid !== o.rzp_order_id || !/^pay_\w+$/.test(pid)) return json(400, { error: 'Missing payment details' }, cors);
    if (!safeEq(await hmacHex(env.GALLERY_RAZORPAY_KEY_SECRET, `${oid}|${pid}`), sig)) return json(400, { error: 'Payment could not be verified.' }, cors);
    res = { ok: true, tx: pid };
  } else {
    const ch = GAL_CHAINS[o.method], tx = String(p.tx || '').trim();
    try {
      res = ch.kind === 'sol' ? await galCheckSol(env, o) : !tx ? { error: 'Paste the transaction hash.' } : ch.kind === 'btc' ? await galCheckBtc(env, o, tx) : await galCheckEvm(env, ch, o, tx);
    } catch (e) { return json(502, { error: 'Could not reach the network to check the payment. Try again in a minute.' }, cors); }
    if (res.ok && !res.tx) res.tx = tx;
  }
  if (res.pending) return json(202, { pending: true, msg: res.msg }, cors);
  if (res.error) return json(400, { error: res.error }, cors);
  const m = await galMarkPaid(env, o, `${o.method}:${res.tx}`);
  if (m.error) return json(409, { error: m.error }, cors);
  return json(200, await galDone(env, { ...o, status: 'paid' }), cors);
}
/** Razorpay webhook safety net for gallery orders (called from handlePayWebhook when no MedDroid plan matches). */
async function galRzpWebhook(env, orderId, paymentId) {
  const o = (await galRows(env, `gallery_orders?rzp_order_id=eq.${encodeURIComponent(orderId)}&select=*`))[0];
  if (o && o.status !== 'paid') await galMarkPaid(env, o, `razorpay:${paymentId}`);
  return !!o;
}
function galMeta(env, a, s) {
  const site = env.GALLERY_SITE || 'https://sanjaydoc.github.io/nisha-gallery';
  return { name: `${a.title} · NFT #${a.nft_token}`, description: `${a.title} by ${a.artist}. ${a.medium}. 1 of 1 NFT copy from Nisha Gallery.`, image: a.image_url, external_url: `${site}/#/art/${a.slug}`,
    attributes: [{ trait_type: 'Artist', value: a.artist }, { trait_type: 'Medium', value: a.medium }, { trait_type: 'Edition', value: '1 of 1' }],
    seller_fee_basis_points: (s.royalty_pct ?? 10) * 100, fee_recipient: s.evm_wallet || '' };
}

/* ---- admin routes ---- */
async function galAdminRoute(request, env, cors, path) {
  const admin = await galAdmin(request, env);
  if (!admin) return json(401, { error: 'Only the gallery admin can do this. Sign in with the admin account.' }, cors);
  const m = request.method;
  if (path === '/gallery/admin/me') return json(200, { email: admin.email }, cors);
  if (path === '/gallery/admin/upload' && m === 'POST') {
    // Raw image body. ?kind=web → public bucket (shown on the site); ?kind=original → private bucket.
    const u = new URL(request.url); const kind = u.searchParams.get('kind') === 'original' ? 'original' : 'web';
    const type = request.headers.get('Content-Type') || '';
    if (!/^image\/(jpeg|png|webp|tiff)$/.test(type)) return json(400, { error: 'Upload a JPG, PNG, WebP or TIFF image.' }, cors);
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/tiff': 'tif' }[type];
    const bucket = kind === 'original' ? 'gallery-originals' : 'gallery';
    const name = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const r = await fetch(`${galDb(env).url}/storage/v1/object/${bucket}/${name}`, { method: 'POST', headers: { ...GAL_SVC(env), 'Content-Type': type, 'x-upsert': 'false' }, body: request.body });
    if (!r.ok) return json(502, { error: 'Upload failed: ' + (await r.text()).slice(0, 200) }, cors);
    return json(200, kind === 'original' ? { path: name } : { url: `${galDb(env).url}/storage/v1/object/public/gallery/${name}`, path: name }, cors);
  }
  if (path === '/gallery/admin/artworks' && m === 'GET') return json(200, { artworks: await galRows(env, `gallery_artworks?select=${GAL_SEL},original_path&order=on_home.desc,home_order.asc,created_at.desc`) }, cors);
  if (path === '/gallery/admin/artworks' && m === 'POST') {
    let p = {}; try { p = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }, cors); }
    if (!p.title || !p.image_url) return json(400, { error: 'Title and image are needed.' }, cors);
    const top = (await galRows(env, 'gallery_artworks?select=home_order&order=home_order.desc&limit=1'))[0];
    const row = { slug: galSlug(p.title), title: String(p.title).slice(0, 160), artist: String(p.artist || '').slice(0, 120), medium: String(p.medium || '').slice(0, 200), about: String(p.about || '').slice(0, 3000),
      image_url: String(p.image_url), original_path: String(p.original_path || ''), copy_price: Math.max(0, parseInt(p.copy_price, 10) || 0), nft_price: Math.max(0, parseInt(p.nft_price, 10) || 0), on_home: p.on_home !== false, home_order: (top?.home_order || 0) + 1 };
    const r = await galSb(env, 'gallery_artworks', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!r.ok) return json(500, { error: 'Could not save the artwork.' }, cors);
    return json(200, { artwork: (await r.json())[0] }, cors);
  }
  const am = /^\/gallery\/admin\/artworks\/([0-9a-f-]{36})$/.exec(path);
  if (am && m === 'PATCH') {
    let p = {}; try { p = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }, cors); }
    const ok = ['title', 'artist', 'medium', 'about', 'copy_price', 'nft_price', 'on_home', 'home_order', 'published', 'mint_tx'];
    const patch = Object.fromEntries(Object.entries(p).filter(([k]) => ok.includes(k)));
    const r = await galSb(env, `gallery_artworks?id=eq.${am[1]}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    return r.ok ? json(200, { artwork: (await r.json())[0] }, cors) : json(400, { error: 'Could not update.' }, cors);
  }
  if (am && m === 'DELETE') {
    const sold = await galRows(env, `gallery_orders?artwork_id=eq.${am[1]}&select=id&limit=1`);
    if (sold.length) { await galSb(env, `gallery_artworks?id=eq.${am[1]}`, { method: 'PATCH', body: JSON.stringify({ published: false, on_home: false }) }); return json(200, { hidden: true }, cors); }
    await galSb(env, `gallery_artworks?id=eq.${am[1]}`, { method: 'DELETE' });
    return json(200, { deleted: true }, cors);
  }
  if (path === '/gallery/admin/orders' && m === 'GET') return json(200, { orders: await galRows(env, 'gallery_orders?select=*,artwork:artwork_id(title,nft_token,image_url)&order=created_at.desc&limit=200') }, cors);
  const om = /^\/gallery\/admin\/orders\/([0-9a-f-]{36})$/.exec(path);
  if (om && m === 'PATCH') {
    let p = {}; try { p = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }, cors); }
    if (!['todo', 'shipped', 'minted', 'done'].includes(p.fulfil_status)) return json(400, { error: 'Bad status' }, cors);
    const r = await galSb(env, `gallery_orders?id=eq.${om[1]}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ fulfil_status: p.fulfil_status }) });
    const o = r.ok ? (await r.json())[0] : null;
    if (o && p.mint_tx && o.edition === 'nft') await galSb(env, `gallery_artworks?id=eq.${o.artwork_id}`, { method: 'PATCH', body: JSON.stringify({ mint_tx: String(p.mint_tx).slice(0, 100) }) });
    return o ? json(200, { order: o }, cors) : json(404, { error: 'Order not found' }, cors);
  }
  if (path === '/gallery/admin/settings' && m === 'POST') {
    let p = {}; try { p = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }, cors); }
    const patch = {};
    if (p.evm_wallet !== undefined) { if (p.evm_wallet && !/^0x[0-9a-fA-F]{40}$/.test(p.evm_wallet)) return json(400, { error: 'The Polygon / ETH / BNB wallet must be 0x + 40 characters.' }, cors); patch.evm_wallet = p.evm_wallet; }
    if (p.btc_address !== undefined) { if (p.btc_address && !/^(bc1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(p.btc_address)) return json(400, { error: 'That Bitcoin address does not look right.' }, cors); patch.btc_address = p.btc_address; }
    if (p.sol_address !== undefined) { if (p.sol_address && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p.sol_address)) return json(400, { error: 'That Solana address does not look right.' }, cors); patch.sol_address = p.sol_address; }
    if (p.royalty_pct !== undefined) patch.royalty_pct = Math.min(20, Math.max(0, parseInt(p.royalty_pct, 10) || 0));
    if (p.nft_contract !== undefined) patch.nft_contract = String(p.nft_contract).slice(0, 60);
    patch.updated_at = new Date().toISOString();
    const r = await galSb(env, 'gallery_settings?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    return r.ok ? json(200, { settings: (await r.json())[0] }, cors) : json(500, { error: 'Could not save.' }, cors);
  }
  return json(404, { error: 'Not found' }, cors);
}

async function handleGallery(request, env) {
  const { cors, origin, allowed } = galCors(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!galDb(env).url || !galDb(env).key) return json(503, { error: 'The gallery database is not connected yet.' }, cors);
  const path = new URL(request.url).pathname;
  const nm = /^\/gallery\/nft\/(\d+)(\.json)?$/.exec(path);   // NFT metadata (ERC-721 tokenURI); open to everyone
  if (nm && request.method === 'GET') {
    const a = (await galRows(env, `gallery_artworks?nft_token=eq.${nm[1]}&select=${GAL_SEL}`))[0];
    return a ? json(200, galMeta(env, a, await galSettings(env)), { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }) : json(404, { error: 'No such token' }, { 'Access-Control-Allow-Origin': '*' });
  }
  // Razorpay webhook for the GALLERY's own Razorpay account (Nisha's, not MedDroid's): set the webhook URL there to
  // <worker>/gallery/razorpay-webhook with secret GALLERY_RAZORPAY_WEBHOOK_SECRET.
  if (path === '/gallery/razorpay-webhook' && request.method === 'POST') {
    if (!env.GALLERY_RAZORPAY_WEBHOOK_SECRET) return new Response('not configured', { status: 503 });
    const raw = await request.text();
    if (!safeEq(await hmacHex(env.GALLERY_RAZORPAY_WEBHOOK_SECRET, raw), request.headers.get('X-Razorpay-Signature'))) return new Response('bad signature', { status: 400 });
    let e = {}; try { e = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
    const pay = e?.payload?.payment?.entity;
    if ((e.event === 'payment.captured' || e.event === 'order.paid') && pay?.order_id && pay?.id) await galRzpWebhook(env, pay.order_id, pay.id);
    return new Response('ok');
  }
  if (allowed.length && origin && !allowed.includes(origin)) return json(403, { error: 'Origin not allowed' }, cors);
  try {
    if (path === '/gallery/artworks' && request.method === 'GET') {
      const [list, s] = await Promise.all([galRows(env, `gallery_artworks?published=eq.true&select=${GAL_SEL}&order=on_home.desc,home_order.asc,created_at.desc`), galSettings(env)]);
      const w = galWallets(s);
      return json(200, { artworks: list.map(galPublic), pay: { razorpay: !!env.GALLERY_RAZORPAY_KEY_ID, chains: Object.keys(GAL_CHAINS).filter((k) => w[k]), royalty_pct: s.royalty_pct ?? 10, nft_contract: s.nft_contract || '' } }, { ...cors, 'Cache-Control': 'no-store' });
    }
    if (path === '/gallery/order' && request.method === 'POST') return await galOrder(request, env, cors);
    if (path === '/gallery/verify' && request.method === 'POST') return await galVerify(request, env, cors);
    if (path.startsWith('/gallery/admin/')) {
      if (path === '/gallery/admin/settings' && request.method === 'GET') {
        if (!(await galAdmin(request, env))) return json(401, { error: 'Sign in with the admin account.' }, cors);
        return json(200, { settings: await galSettings(env) }, cors);
      }
      return await galAdminRoute(request, env, cors, path);
    }
  } catch (e) { return json(500, { error: 'Something went wrong. Please try again.' }, cors); }
  return json(404, { error: 'Not found' }, cors);
}

