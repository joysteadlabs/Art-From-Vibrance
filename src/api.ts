/* Talks to the gallery's own Worker (worker/worker.js, Nisha's Cloudflare). Addresses come from config.js.
   The Worker holds the Razorpay keys and the Supabase service key; this site holds nothing secret. */
import { createClient } from '@supabase/supabase-js';
import { CFG, DEMO, demoAuth, demoCall } from './demo';

export const API = (CFG.api || '').replace(/\/+$/, '');
// Public (publishable) Supabase key: used only for the admin's Google sign-in.
export const supabase = DEMO ? (null as never) : createClient(CFG.supabaseUrl!, CFG.supabaseKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

/* Email links from Supabase (confirm account / reset password) land on the site root with tokens in the URL hash.
   Remember that before supabase-js clears it, so main.tsx can open #/admin (and the new-password form). */
const AUTH_HASH = /access_token=|type=(recovery|signup)|error_description=/.test(location.hash);
let recovery = /type=recovery/.test(location.hash);
export const authReturn = AUTH_HASH;
export const isRecovery = () => recovery;
export const clearRecovery = () => { recovery = false; };
/** Sign-in for the admin page (a stand-in in the demo build, which needs no accounts). */
export const auth = DEMO ? demoAuth : supabase.auth;
if (!DEMO) auth.onAuthStateChange((e) => { if (e === 'PASSWORD_RECOVERY') recovery = true; });

export type Artwork = {
  id: string; slug: string; title: string; artist: string; medium: string; about: string; image_url: string;
  copy_price: number; nft_price: number; nft_token: number; nft_status: 'available' | 'reserved' | 'sold'; nft_owner: string; mint_tx: string;
  on_home: boolean; home_order: number; published: boolean; copies_sold: number; created_at: string; original_path?: string;
};
export type Chain = 'polygon' | 'eth' | 'bnb' | 'btc' | 'sol';
export type Method = 'razorpay' | Chain;
export type PayInfo = { razorpay: boolean; chains: Chain[]; royalty_pct: number; nft_contract: string };
export type Order = {
  order: string; edition: 'copy' | 'nft'; method: Method; amount_inr: number; expires_at: string; title: string;
  key_id?: string; rzp_order_id?: string; amount_paise?: number;
  chain?: Chain; chainId?: number; coin?: string; network?: string; amount?: string; pay_to?: string; reference?: string;
};
export type Paid = { paid: true; order: string; edition: 'copy' | 'nft'; download: string; token?: number };
export type Settings = { evm_wallet: string; btc_address: string; sol_address: string; royalty_pct: number; nft_contract: string };
export type AdminOrder = {
  id: string; edition: 'copy' | 'nft'; method: Method; amount_inr: number; crypto_amount: string; crypto_coin: string; status: string; fulfil_status: string;
  buyer_name: string; buyer_email: string; buyer_phone: string; ship_address: string; buyer_wallet: string; payment_ref: string | null; created_at: string; paid_at: string | null;
  artwork?: { title: string; nft_token: number; image_url: string };
};

export const CHAINS: Record<Chain, { name: string; coin: string; note: string; color: string; mark: string }> = {
  polygon: { name: 'Polygon', coin: 'POL', note: 'Lowest fees · recommended', color: '#8247e5', mark: '⬡' },
  eth: { name: 'Ethereum', coin: 'ETH', note: 'MetaMask, Coinbase Wallet', color: '#627eea', mark: 'Ξ' },
  bnb: { name: 'BNB Smart Chain', coin: 'BNB', note: 'MetaMask, Trust Wallet, Binance Web3', color: '#f0b90b', mark: 'B' },
  btc: { name: 'Bitcoin', coin: 'BTC', note: 'Any Bitcoin wallet · about 10 min to confirm', color: '#f7931a', mark: '₿' },
  sol: { name: 'Solana', coin: 'SOL', note: 'Phantom, Solflare (Solana Pay)', color: '#14b8a6', mark: '◎' },
};
export const inr = (n: number) => '₹' + (n || 0).toLocaleString('en-IN');

async function call<T>(path: string, init: RequestInit = {}, auth = false): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = { ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...((init.headers as Record<string, string>) || {}) };
  if (DEMO) return demoCall<T>(path, init);
  if (!API) throw new Error('Payments are not switched on yet. Please check back soon.');
  if (auth) { const t = (await supabase.auth.getSession()).data.session?.access_token; if (t) headers.Authorization = `Bearer ${t}`; }
  let r: Response;
  try { r = await fetch(API + path, { ...init, headers }); } catch { throw new Error('Could not reach the gallery server. Check your connection.'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 202) throw new Error((data as { error?: string }).error || `Server error (${r.status})`);
  return { status: r.status, data: data as T };
}

export const listArtworks = async (): Promise<{ artworks: Artwork[]; pay: PayInfo }> => DIRECT ? directList() : (await call<{ artworks: Artwork[]; pay: PayInfo }>('/gallery/artworks')).data;
export const createOrder = async (p: { artworkId: string; edition: 'copy' | 'nft'; method: Method; buyer: { name: string; email: string; phone: string; address: string; wallet: string } }) =>
  (await call<Order>('/gallery/order', { method: 'POST', body: JSON.stringify(p) })).data;
/** Returns Paid, or { pending, msg } while the network has not confirmed it yet. */
export const verifyOrder = async (p: Record<string, string>) => (await call<Paid | { pending: true; msg: string }>('/gallery/verify', { method: 'POST', body: JSON.stringify(p) })).data;

// ---- Direct Supabase (same pattern as MedDroid Records: the signed-in browser writes straight to Supabase
// Storage + tables, guarded by Storage/RLS policies in worker/gallery.sql). Code pattern only: Nisha's own project.
// Used for the admin and the public list, so uploads save as soon as config.js has the Supabase URL + key,
// even before the payments Worker exists. Payments (order/verify) still go through the Worker.
export const DIRECT = !DEMO;
const PUB_SEL = 'id,slug,title,artist,medium,about,image_url,copy_price,nft_price,nft_token,nft_status,reserved_until,nft_owner,mint_tx,on_home,home_order,published,copies_sold,created_at';
const nftFree = (a: { nft_status: string; reserved_until?: string | null }) => a.nft_status === 'available' || (a.nft_status === 'reserved' && (!a.reserved_until || Date.parse(a.reserved_until) < Date.now()));
const pubArt = (a: Artwork & { reserved_until?: string | null }) => { const { reserved_until, original_path, ...r } = a; return { ...r, nft_status: nftFree(a) ? 'available' : a.nft_status } as Artwork; };
function dbErr(e: { message?: string } | null, what: string): never { throw new Error(`${what}: ${e?.message || 'database error'}`); }
async function directList() {
  const [a, s] = await Promise.all([
    supabase.from('gallery_artworks_public').select(PUB_SEL).order('on_home', { ascending: false }).order('home_order').order('created_at', { ascending: false }),
    supabase.from('gallery_pay_public').select('*').maybeSingle(),
  ]);
  if (a.error) dbErr(a.error, 'Could not load the artworks');
  const st = (s.data || {}) as Partial<Settings>;
  let pay: PayInfo = { razorpay: false, chains: [], royalty_pct: st.royalty_pct ?? 10, nft_contract: st.nft_contract || '' };
  if (API) { try { pay = (await call<{ pay: PayInfo }>('/gallery/artworks')).data.pay; } catch { /* payments server down: browse only */ } }
  return { artworks: (a.data as Artwork[]).map(pubArt), pay };
}
const slugOf = (t: string) => (String(t).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'art') + '-' + Date.now().toString(36).slice(-5);
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/tiff': 'tif' };

// admin (direct to Supabase; the demo build keeps its in-browser fake)
export const adminMe = async () => {
  if (!DIRECT) return (await call<{ email: string }>('/gallery/admin/me', {}, true)).data;
  const { data, error } = await supabase.rpc('gallery_is_admin');
  if (error) dbErr(error, 'Could not check the admin list');
  if (!data) throw new Error('Not a gallery admin');
  return { email: (await supabase.auth.getSession()).data.session?.user.email || '' };
};
export const adminArtworks = async (): Promise<Artwork[]> => {
  if (!DIRECT) return (await call<{ artworks: Artwork[] }>('/gallery/admin/artworks', {}, true)).data.artworks;
  const { data, error } = await supabase.from('gallery_artworks').select(PUB_SEL + ',original_path').order('on_home', { ascending: false }).order('home_order').order('created_at', { ascending: false });
  if (error) dbErr(error, 'Could not load the artworks');
  return data as unknown as Artwork[];
};
/** Upload one image: 'web' → public bucket `gallery` (shown on the site), 'original' → private `gallery-originals`. */
export const adminUpload = async (blob: Blob, kind: 'web' | 'original'): Promise<{ url?: string; path: string }> => {
  if (!DIRECT) return (await call<{ url?: string; path: string }>(`/gallery/admin/upload?kind=${kind}`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } }, true)).data;
  const type = blob.type || 'image/jpeg';
  if (!EXT[type]) throw new Error('Upload a JPG, PNG, WebP or TIFF image.');
  const bucket = kind === 'original' ? 'gallery-originals' : 'gallery';
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${EXT[type]}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: type, upsert: false });
  if (error) dbErr(error, 'Upload failed');
  return kind === 'original' ? { path } : { url: supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl, path };
};
export const adminCreate = async (p: Partial<Artwork>): Promise<Artwork> => {
  if (!DIRECT) return (await call<{ artwork: Artwork }>('/gallery/admin/artworks', { method: 'POST', body: JSON.stringify(p) }, true)).data.artwork;
  if (!p.title || !p.image_url) throw new Error('Title and image are needed.');
  const top = await supabase.from('gallery_artworks').select('home_order').order('home_order', { ascending: false }).limit(1);
  const row = { slug: slugOf(p.title), title: String(p.title).slice(0, 160), artist: String(p.artist || '').slice(0, 120), medium: String(p.medium || '').slice(0, 200), about: String(p.about || '').slice(0, 3000),
    image_url: p.image_url, original_path: p.original_path || '', copy_price: Math.max(0, Math.round(Number(p.copy_price) || 0)), nft_price: Math.max(0, Math.round(Number(p.nft_price) || 0)),
    on_home: p.on_home !== false, home_order: ((top.data?.[0] as { home_order?: number } | undefined)?.home_order || 0) + 1 };
  const { data, error } = await supabase.from('gallery_artworks').insert(row).select(PUB_SEL + ',original_path').single();
  if (error) dbErr(error, 'Could not save the artwork');
  return data as unknown as Artwork;
};
export const adminUpdate = async (id: string, p: Partial<Artwork>): Promise<Artwork> => {
  if (!DIRECT) return (await call<{ artwork: Artwork }>(`/gallery/admin/artworks/${id}`, { method: 'PATCH', body: JSON.stringify(p) }, true)).data.artwork;
  const okKeys = ['title', 'artist', 'medium', 'about', 'copy_price', 'nft_price', 'on_home', 'home_order', 'published', 'mint_tx'];
  const patch = Object.fromEntries(Object.entries(p).filter(([k]) => okKeys.includes(k)));
  const { data, error } = await supabase.from('gallery_artworks').update(patch).eq('id', id).select(PUB_SEL + ',original_path').single();
  if (error) dbErr(error, 'Could not update');
  return data as unknown as Artwork;
};
export const adminDelete = async (id: string): Promise<{ deleted?: boolean; hidden?: boolean }> => {
  if (!DIRECT) return (await call<{ deleted?: boolean; hidden?: boolean }>(`/gallery/admin/artworks/${id}`, { method: 'DELETE' }, true)).data;
  const sold = await supabase.from('gallery_orders').select('id').eq('artwork_id', id).limit(1);
  if (sold.data?.length) { const { error } = await supabase.from('gallery_artworks').update({ published: false, on_home: false }).eq('id', id); if (error) dbErr(error, 'Could not hide'); return { hidden: true }; }
  const { error } = await supabase.from('gallery_artworks').delete().eq('id', id);
  if (error) dbErr(error, 'Could not delete');
  return { deleted: true };
};
export const adminOrders = async (): Promise<AdminOrder[]> => {
  if (!DIRECT) return (await call<{ orders: AdminOrder[] }>('/gallery/admin/orders', {}, true)).data.orders;
  const { data, error } = await supabase.from('gallery_orders').select('*,artwork:artwork_id(title,nft_token,image_url)').order('created_at', { ascending: false }).limit(200);
  if (error) dbErr(error, 'Could not load orders');
  return data as unknown as AdminOrder[];
};
export const adminFulfil = async (id: string, fulfil_status: string, mint_tx?: string): Promise<AdminOrder> => {
  if (!DIRECT) return (await call<{ order: AdminOrder }>(`/gallery/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ fulfil_status, mint_tx }) }, true)).data.order;
  const { data, error } = await supabase.from('gallery_orders').update({ fulfil_status }).eq('id', id).select('*').single();
  if (error) dbErr(error, 'Could not update the order');
  const o = data as AdminOrder & { artwork_id: string };
  if (mint_tx && o.edition === 'nft') await supabase.from('gallery_artworks').update({ mint_tx: String(mint_tx).slice(0, 100) }).eq('id', o.artwork_id);
  return o;
};
export const adminSettings = async (): Promise<Settings> => {
  if (!DIRECT) return (await call<{ settings: Settings }>('/gallery/admin/settings', {}, true)).data.settings;
  const { data, error } = await supabase.from('gallery_settings').select('*').eq('id', 1).maybeSingle();
  if (error) dbErr(error, 'Could not load settings');
  return (data || { evm_wallet: '', btc_address: '', sol_address: '', royalty_pct: 10, nft_contract: '' }) as Settings;
};
export const adminSaveSettings = async (p: Partial<Settings>): Promise<Settings> => {
  if (!DIRECT) return (await call<{ settings: Settings }>('/gallery/admin/settings', { method: 'POST', body: JSON.stringify(p) }, true)).data.settings;
  const patch: Record<string, unknown> = {};
  if (p.evm_wallet !== undefined) { if (p.evm_wallet && !/^0x[0-9a-fA-F]{40}$/.test(p.evm_wallet)) throw new Error('The Polygon / ETH / BNB wallet must be 0x + 40 characters.'); patch.evm_wallet = p.evm_wallet; }
  if (p.btc_address !== undefined) { if (p.btc_address && !/^(bc1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(p.btc_address)) throw new Error('That Bitcoin address does not look right.'); patch.btc_address = p.btc_address; }
  if (p.sol_address !== undefined) { if (p.sol_address && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p.sol_address)) throw new Error('That Solana address does not look right.'); patch.sol_address = p.sol_address; }
  if (p.royalty_pct !== undefined) patch.royalty_pct = Math.min(20, Math.max(0, Math.round(Number(p.royalty_pct)) || 0));
  if (p.nft_contract !== undefined) patch.nft_contract = String(p.nft_contract).slice(0, 60);
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('gallery_settings').update(patch).eq('id', 1).select('*').single();
  if (error) dbErr(error, 'Could not save');
  return data as Settings;
};
