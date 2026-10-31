/* Talks to the /gallery/* routes on MedDroid's chat Worker (medicalandroid repo, chat-worker/worker.js).
   The Worker holds the Razorpay keys and the Supabase service key; this site holds nothing secret. */
import { createClient } from '@supabase/supabase-js';
import { DEMO, demoAuth, demoCall } from './demo';

export const API = 'https://medicalandroid-chat.dr-sanjayanbu.workers.dev';
// Public (publishable) Supabase key: used only for the admin's Google sign-in.
export const supabase = DEMO ? (null as never) : createClient('https://jeusnqudtuajafpjodjg.supabase.co', 'sb_publishable_wA1RROIgG_VcqYaZMP5xtg_rPEiJjYh', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

/** Sign-in for the admin page (a stand-in in the demo build, which needs no accounts). */
export const auth = DEMO ? demoAuth : supabase.auth;

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
  if (auth) { const t = (await supabase.auth.getSession()).data.session?.access_token; if (t) headers.Authorization = `Bearer ${t}`; }
  let r: Response;
  try { r = await fetch(API + path, { ...init, headers }); } catch { throw new Error('Could not reach the gallery server. Check your connection.'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 202) throw new Error((data as { error?: string }).error || `Server error (${r.status})`);
  return { status: r.status, data: data as T };
}

export const listArtworks = async () => (await call<{ artworks: Artwork[]; pay: PayInfo }>('/gallery/artworks')).data;
export const createOrder = async (p: { artworkId: string; edition: 'copy' | 'nft'; method: Method; buyer: { name: string; email: string; phone: string; address: string; wallet: string } }) =>
  (await call<Order>('/gallery/order', { method: 'POST', body: JSON.stringify(p) })).data;
/** Returns Paid, or { pending, msg } while the network has not confirmed it yet. */
export const verifyOrder = async (p: Record<string, string>) => (await call<Paid | { pending: true; msg: string }>('/gallery/verify', { method: 'POST', body: JSON.stringify(p) })).data;

// admin
export const adminMe = async () => (await call<{ email: string }>('/gallery/admin/me', {}, true)).data;
export const adminArtworks = async () => (await call<{ artworks: Artwork[] }>('/gallery/admin/artworks', {}, true)).data.artworks;
export const adminUpload = async (blob: Blob, kind: 'web' | 'original') => (await call<{ url?: string; path: string }>(`/gallery/admin/upload?kind=${kind}`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } }, true)).data;
export const adminCreate = async (p: Partial<Artwork>) => (await call<{ artwork: Artwork }>('/gallery/admin/artworks', { method: 'POST', body: JSON.stringify(p) }, true)).data.artwork;
export const adminUpdate = async (id: string, p: Partial<Artwork>) => (await call<{ artwork: Artwork }>(`/gallery/admin/artworks/${id}`, { method: 'PATCH', body: JSON.stringify(p) }, true)).data.artwork;
export const adminDelete = async (id: string) => (await call<{ deleted?: boolean; hidden?: boolean }>(`/gallery/admin/artworks/${id}`, { method: 'DELETE' }, true)).data;
export const adminOrders = async () => (await call<{ orders: AdminOrder[] }>('/gallery/admin/orders', {}, true)).data.orders;
export const adminFulfil = async (id: string, fulfil_status: string, mint_tx?: string) => (await call<{ order: AdminOrder }>(`/gallery/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ fulfil_status, mint_tx }) }, true)).data.order;
export const adminSettings = async () => (await call<{ settings: Settings }>('/gallery/admin/settings', {}, true)).data.settings;
export const adminSaveSettings = async (p: Partial<Settings>) => (await call<{ settings: Settings }>('/gallery/admin/settings', { method: 'POST', body: JSON.stringify(p) }, true)).data.settings;
