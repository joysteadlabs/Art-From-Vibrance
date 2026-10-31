/* Payment helpers: Razorpay Checkout and crypto wallets.
   Crypto goes straight from the buyer's wallet to the gallery's wallet; the Worker checks it on-chain. */
import qrcode from 'qrcode-generator';
import type { Chain, Order } from './api';
import { DEMO } from './demo';

declare global { interface Window { Razorpay?: any; ethereum?: any } }

export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => ok(); s.onerror = () => bad(new Error('Could not load Razorpay. Check your connection.'));
    document.head.appendChild(s);
  });
}
/** Opens Razorpay Checkout; resolves with the signed payment details, rejects if the buyer closes it. */
export async function payRazorpay(o: Order, buyer: { name: string; email: string; phone: string }): Promise<Record<string, string>> {
  if (DEMO) { await new Promise((r) => setTimeout(r, 900)); return { razorpay_order_id: o.rzp_order_id!, razorpay_payment_id: 'pay_demo' + Date.now(), razorpay_signature: 'demo' }; }
  await loadRazorpay();
  return new Promise((ok, bad) => {
    const rz = new window.Razorpay({
      key: o.key_id, order_id: o.rzp_order_id, amount: o.amount_paise, currency: 'INR', name: 'Art From Vibrance',
      description: `${o.title} · ${o.edition === 'nft' ? 'NFT copy' : 'Normal copy'}`, prefill: { name: buyer.name, email: buyer.email, contact: buyer.phone },
      theme: { color: '#141210' }, handler: (r: Record<string, string>) => ok(r), modal: { ondismiss: () => bad(new Error('Payment window closed.')) },
    });
    rz.on('payment.failed', (r: any) => bad(new Error(r?.error?.description || 'Payment failed.')));
    rz.open();
  });
}

const DEC: Record<Chain, number> = { polygon: 18, eth: 18, bnb: 18, btc: 8, sol: 9 };
export function toUnits(amount: string, chain: Chain): bigint {
  const d = DEC[chain]; const [i, f = ''] = amount.split('.');
  return BigInt(i || '0') * 10n ** BigInt(d) + BigInt((f + '0'.repeat(d)).slice(0, d) || '0');
}
const EVM_CHAINS: Record<string, { id: number; add: any }> = {
  polygon: { id: 137, add: { chainId: '0x89', chainName: 'Polygon', nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 }, rpcUrls: ['https://polygon-rpc.com'], blockExplorerUrls: ['https://polygonscan.com'] } },
  eth: { id: 1, add: null },
  bnb: { id: 56, add: { chainId: '0x38', chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-dataseed.binance.org'], blockExplorerUrls: ['https://bscscan.com'] } },
};
export const hasEvmWallet = () => typeof window !== 'undefined' && !!window.ethereum;
/** Asks the browser wallet (MetaMask etc.) for an account. */
export async function evmAccount(): Promise<string> {
  const acc: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return acc[0];
}
/** Switches the wallet to the right network and sends the exact amount to the gallery wallet. Returns the tx hash. */
export async function payEvm(o: Order): Promise<string> {
  const ch = EVM_CHAINS[o.chain!];
  const from = await evmAccount();
  const hex = '0x' + ch.id.toString(16);
  try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }); }
  catch (e: any) { if (e?.code === 4902 && ch.add) await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [ch.add] }); else throw e; }
  return window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to: o.pay_to, value: '0x' + toUnits(o.amount!, o.chain!).toString(16) }] });
}
/** Link / QR text a phone wallet understands. */
export function payUri(o: Order): string {
  const label = encodeURIComponent('Art From Vibrance');
  if (o.chain === 'btc') return `bitcoin:${o.pay_to}?amount=${o.amount}&label=${label}`;
  if (o.chain === 'sol') return `solana:${o.pay_to}?amount=${o.amount}&reference=${o.reference}&label=${label}&message=${encodeURIComponent(o.title)}`;
  return `ethereum:${o.pay_to}@${EVM_CHAINS[o.chain!].id}?value=${toUnits(o.amount!, o.chain!).toString()}`;   // EIP-681
}
export function qrSvg(text: string): string {
  try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { return ''; }
}
export const explorer = (chain: Chain, tx: string) =>
  ({ polygon: `https://polygonscan.com/tx/${tx}`, eth: `https://etherscan.io/tx/${tx}`, bnb: `https://bscscan.com/tx/${tx}`, btc: `https://mempool.space/tx/${tx}`, sol: `https://solscan.io/tx/${tx}` })[chain];
