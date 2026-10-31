/* Preview mode: the whole gallery runs in the browser with sample artworks and simulated payments.
   On when built with VITE_DEMO=1, or while config.js (window.GALLERY_CONFIG) is not filled in yet. Nothing is saved. */
type Cfg = { api?: string; supabaseUrl?: string; supabaseKey?: string };
const RAW: Cfg = (globalThis as { GALLERY_CONFIG?: Cfg }).GALLERY_CONFIG || {};
// Tolerate a pasted '/rest/v1/' or trailing slash on the Supabase URL.
export const CFG: Cfg = { ...RAW, supabaseUrl: (RAW.supabaseUrl || '').trim().replace(/\/(rest|auth|storage)\/v1\/?.*$/, '').replace(/\/+$/, ''), supabaseKey: (RAW.supabaseKey || '').trim(), api: (RAW.api || '').trim() };
export const CONNECTED = !!(CFG.supabaseUrl && CFG.supabaseKey);   // the payments Worker (CFG.api) is optional
export const DEMO = import.meta.env.VITE_DEMO === '1' || !CONNECTED;

const PAL = [['#d9643a', '#f2c14e', '#2b3a55'], ['#1d3557', '#457b9d', '#f1faee'], ['#3a2e39', '#c7a27c', '#e8d5b7'], ['#264653', '#2a9d8f', '#e9c46a'], ['#6d2e46', '#d5b9b2', '#a26769'], ['#0b3954', '#bfd7ea', '#ff6663']];
function art(i: number) {
  const p = PAL[i % PAL.length]; let r = i * 97 + 13; const R = () => (r = (r * 9301 + 49297) % 233280) / 233280; let s = '';
  for (let k = 0; k < 7; k++) s += `<circle cx="${(R() * 400) | 0}" cy="${(R() * 500) | 0}" r="${(50 + R() * 140) | 0}" fill="${p[k % 3]}" opacity="${(0.35 + R() * 0.5).toFixed(2)}"/>`;
  s += `<path d="M0 ${330 + R() * 80} Q 200 ${240 + R() * 90} 400 ${320 + R() * 80} L400 500 L0 500Z" fill="${p[0]}" opacity=".55"/>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="${p[2]}"/>${s}</svg>`);
}
const SEED: [string, string, string, number, number, string][] = [
  ['Monsoon Ghats', 'Nisha R.', 'Oil on canvas · 90 × 120 cm · 2025', 4500, 15000, 'Painted on the Chennai coast through one monsoon season: layers laid down wet and scraped back, so the light seems to come from inside the canvas.'],
  ['Saffron Hour', 'Nisha R.', 'Acrylic on linen · 60 × 75 cm · 2024', 12000, 36000, 'The last hour of light over the Kapaleeshwarar tank, in four colours.'],
  ['Indigo Field', 'Nisha R.', 'Mixed media · 50 × 70 cm · 2025', 8000, 24000, ''],
  ['Temple Light', 'Nisha R.', 'Oil on canvas · 100 × 100 cm · 2024', 6500, 19500, ''],
  ['Coromandel Tide', 'Nisha R.', 'Watercolour · 40 × 55 cm · 2023', 15000, 45000, ''],
  ['Night Market', 'Nisha R.', 'Gouache · 45 × 60 cm · 2025', 9000, 27000, ''],
];
const now = Date.now();
const S: any = {
  arts: SEED.map(([title, artist, medium, copy_price, nft_price, about], i) => ({ id: 'a' + i, slug: title.toLowerCase().replace(/ /g, '-'), title, artist, medium, about, image_url: art(i), copy_price, nft_price, nft_token: i + 1,
    nft_status: i === 5 ? 'sold' : 'available', nft_owner: i === 5 ? '0x51b4c2e8a9d01f3b7c6e5d4a3b2c1d0e9f8a0e0a4' : '', mint_tx: '', on_home: i < 4, home_order: i, published: true, copies_sold: i % 3, created_at: new Date(now - (6 - i) * 864e5).toISOString() })),
  orders: [] as any[],
  set: { evm_wallet: '0x7a3F2b9E41c0D8a6F3b5C12e9d04A7c1E5f89c21', btc_address: 'bc1qnishagallery0demo0address0xyz9k2', sol_address: '7Xg5mGa11eryDemoSoNanaWa11et11111111111111', royalty_pct: 10, nft_contract: '' },
  tokens: 7, checks: {} as Record<string, number>,
};
const RATE: Record<string, number> = { polygon: 50, eth: 300000, bnb: 60000, btc: 9000000, sol: 15000 };
const COIN: Record<string, [string, string, number, number?]> = { polygon: ['POL', 'Polygon', 6, 137], eth: ['ETH', 'Ethereum', 6, 1], bnb: ['BNB', 'BNB Smart Chain', 6, 56], btc: ['BTC', 'Bitcoin', 8], sol: ['SOL', 'Solana', 6] };
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const ok = <T,>(data: unknown, status = 200) => ({ status, data: data as T });
function fail(msg: string): never { throw new Error(msg); }
const pub = ({ original_path, ...a }: any) => a;

export const demoAuth = {
  getSession: async () => ({ data: { session: { access_token: 'demo', user: { email: 'nisha@nishagallery.com' } } } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signInWithOAuth: async () => ({}),
  signInWithPassword: async () => ({ error: null }),
  signOut: async () => { location.hash = '#/'; },
};

export async function demoCall<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  await wait();
  const m = init.method || 'GET';
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
  const u = new URL(path, 'https://demo.local');
  const p = u.pathname;
  if (p === '/gallery/artworks') return ok({ artworks: S.arts.filter((a: any) => a.published).sort((a: any, b: any) => Number(b.on_home) - Number(a.on_home) || a.home_order - b.home_order).map(pub), pay: { razorpay: true, chains: ['polygon', 'eth', 'bnb', 'btc', 'sol'].filter((c) => (c === 'btc' ? S.set.btc_address : c === 'sol' ? S.set.sol_address : S.set.evm_wallet)), royalty_pct: S.set.royalty_pct, nft_contract: S.set.nft_contract } });
  if (p === '/gallery/order') {
    const a = S.arts.find((x: any) => x.id === body.artworkId) || fail('Artwork not found');
    if (body.edition === 'nft' && a.nft_status !== 'available') fail('Someone is buying this NFT right now, or it is sold.');
    const amount = body.edition === 'nft' ? a.nft_price : a.copy_price;
    const o: any = { id: 'o' + (S.orders.length + 1), artwork_id: a.id, edition: body.edition, method: body.method, amount_inr: amount, status: 'created', fulfil_status: 'todo', created_at: new Date().toISOString(),
      buyer_name: body.buyer.name, buyer_email: body.buyer.email, buyer_phone: body.buyer.phone, ship_address: body.buyer.address, buyer_wallet: body.buyer.wallet, crypto_amount: '', crypto_coin: '', payment_ref: null };
    const out: any = { order: o.id, edition: o.edition, method: o.method, amount_inr: amount, expires_at: new Date(Date.now() + 30 * 60e3).toISOString(), title: a.title };
    if (o.method === 'razorpay') Object.assign(out, { key_id: 'rzp_demo', rzp_order_id: 'order_demo' + o.id, amount_paise: amount * 100 });
    else {
      const [coin, network, dp, chainId] = COIN[o.method];
      o.crypto_amount = (Math.ceil((amount / RATE[o.method]) * 10 ** dp) / 10 ** dp).toFixed(dp); o.crypto_coin = coin;
      Object.assign(out, { chain: o.method, chainId, coin, network, amount: o.crypto_amount, pay_to: o.method === 'btc' ? S.set.btc_address : o.method === 'sol' ? S.set.sol_address : S.set.evm_wallet, reference: o.method === 'sol' ? 'DemoRef' + o.id : undefined });
    }
    if (o.edition === 'nft') a.nft_status = 'reserved';
    S.orders.unshift(o);
    return ok(out);
  }
  if (p === '/gallery/verify') {
    const o = S.orders.find((x: any) => x.id === body.order) || fail('Order not found');
    // Demo: crypto "confirms" on the second check (Solana after ~6 s), so the waiting step can be seen.
    if (o.method !== 'razorpay' && (S.checks[o.id] = (S.checks[o.id] || 0) + 1) < 2) return ok({ pending: true, msg: o.method === 'btc' ? 'Payment seen. Waiting for 1 Bitcoin confirmation…' : 'Waiting for the network to confirm the payment…' }, 202);
    const a = S.arts.find((x: any) => x.id === o.artwork_id);
    if (o.status !== 'paid') {
      Object.assign(o, { status: 'paid', paid_at: new Date().toISOString(), payment_ref: `${o.method}:${body.tx || body.razorpay_payment_id || 'demo-signature'}` });
      if (o.edition === 'nft') Object.assign(a, { nft_status: 'sold', nft_owner: o.buyer_wallet }); else a.copies_sold++;
    }
    return ok({ paid: true, order: o.id, edition: o.edition, download: a.image_url, token: o.edition === 'nft' ? a.nft_token : undefined });
  }
  if (p === '/gallery/admin/me') return ok({ email: 'nisha@nishagallery.com' });
  if (p === '/gallery/admin/upload') {
    const blob = init.body as Blob;
    const url = await new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(blob); });
    return ok(u.searchParams.get('kind') === 'original' ? { path: 'demo/original' } : { url, path: 'demo/web' });
  }
  if (p === '/gallery/admin/artworks' && m === 'GET') return ok({ artworks: [...S.arts].sort((a: any, b: any) => Number(b.on_home) - Number(a.on_home) || a.home_order - b.home_order) });
  if (p === '/gallery/admin/artworks' && m === 'POST') {
    const a = { id: 'a' + Date.now() + Math.random(), slug: String(body.title).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36).slice(-4), artist: '', medium: '', about: '', ...body, nft_token: S.tokens++, nft_status: 'available', nft_owner: '', mint_tx: '', home_order: Math.max(0, ...S.arts.map((x: any) => x.home_order)) + 1, published: true, copies_sold: 0, created_at: new Date().toISOString() };
    S.arts.push(a); return ok({ artwork: a });
  }
  const am = /^\/gallery\/admin\/artworks\/(.+)$/.exec(p);
  if (am) {
    const a = S.arts.find((x: any) => x.id === am[1]) || fail('Not found');
    if (m === 'DELETE') { if (S.orders.some((o: any) => o.artwork_id === a.id)) { Object.assign(a, { published: false, on_home: false }); return ok({ hidden: true }); } S.arts.splice(S.arts.indexOf(a), 1); return ok({ deleted: true }); }
    const { slug, id, nft_token, ...rest } = body; Object.assign(a, rest); return ok({ artwork: a });
  }
  if (p === '/gallery/admin/orders') return ok({ orders: S.orders.map((o: any) => ({ ...o, artwork: S.arts.find((a: any) => a.id === o.artwork_id) })) });
  const om = /^\/gallery\/admin\/orders\/(.+)$/.exec(p);
  if (om) { const o = S.orders.find((x: any) => x.id === om[1]); o.fulfil_status = body.fulfil_status; return ok({ order: o }); }
  if (p === '/gallery/admin/settings' && m === 'GET') return ok({ settings: S.set });
  if (p === '/gallery/admin/settings') {
    if (body.evm_wallet && !/^0x[0-9a-fA-F]{40}$/.test(body.evm_wallet)) fail('The Polygon / ETH / BNB wallet must be 0x + 40 characters.');
    Object.assign(S.set, body, { royalty_pct: +body.royalty_pct }); return ok({ settings: S.set });
  }
  return fail('Not found');
}
