import { useEffect, useMemo, useRef, useState } from 'react';
import { CHAINS, createOrder, inr, verifyOrder, type Artwork, type Chain, type Method, type Order, type Paid, type PayInfo } from './api';
import { WallCard } from './Wall';
import { evmAccount, explorer, hasEvmWallet, payEvm, payRazorpay, payUri, qrSvg } from './pay';

export function Nav({ go, r }: { go: (h: string) => void; r: string }) {
  const on = (p: string) => (r.startsWith(p) ? 'on' : undefined);
  return <nav className="ng-nav" aria-label="Main"><div className="ng-wrap"><a className="ng-logo" href="#/" onClick={(e) => { e.preventDefault(); go('#/'); }}>Art From Vibrance</a>
    {([['/works', 'Works'], ['/about', 'About'], ['/contact', 'Contact']] as const).map(([p, l]) => <a key={p} href={`#${p}`} className={on(p)} aria-current={on(p) ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(`#${p}`); }}>{l}</a>)}</div></nav>;
}

export function Home({ arts, go }: { arts: Artwork[]; go: (h: string) => void }) {
  const home = arts.filter((a) => a.on_home);
  const [i, setI] = useState(0);
  const [f, setF] = useState<'all' | 'nft' | 'new'>('all');
  const [auto, setAuto] = useState(true);   // a manual pick stops the auto-advance (approved mock HrJAPDACizRZAUeRb9dXvA)
  useEffect(() => { if (home.length < 2 || !auto) return; const t = setInterval(() => setI((x) => (x + 1) % home.length), 5000); return () => clearInterval(t); }, [home.length, auto]);
  const n = Math.max(1, home.length);
  const pick = (k: number) => { setAuto(false); setI(((k % n) + n) % n); };
  const h = home[i % n];
  const from = (a: Artwork) => inr(Math.min(a.copy_price || a.nft_price, a.nft_price || a.copy_price));
  const recent = new Set([...arts].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3).map((a) => a.id));
  const list = arts.filter((a) => f === 'all' || (f === 'nft' && a.nft_status !== 'sold') || (f === 'new' && recent.has(a.id)));
  return <>
    {h ? <>
      <section className="ng-hero" aria-label="Paintings carousel">
        <img className="ng-hero-bg" src={h.image_url} alt="" aria-hidden="true" />
        <div className="ng-wrap ng-hero-in">
          <div className="ng-hero-art"><div className="ng-frame"><img src={h.image_url} alt={`${h.title}, painting by ${h.artist || 'the artist'}`} /></div></div>
          <div className="ng-cap">
            <span className="ng-kick">Now showing{home.length > 1 ? ` · ${(i % n) + 1} / ${home.length}` : ''}</span>
            <h1>{h.title}</h1>
            <p>{h.artist}{h.medium ? ` · ${h.medium}` : ''}</p>
            <div className="ng-hero-btns">
              <button className="ng-cta" onClick={() => go(`#/art/${h.slug}`)}>View · from {from(h)}</button>
              <button className="ng-cta2" onClick={() => go('#/wall')}>See it on your wall</button>
            </div>
            {home.length > 1 && <div className="ng-arrows">
              <button aria-label="Previous painting" onClick={() => pick(i - 1)}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
              <button aria-label="Next painting" onClick={() => pick(i + 1)}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
            </div>}
          </div>
        </div>
        {home.length > 1 && <div className="ng-dots">{home.map((x, k) => <button key={x.id} aria-label={`Show ${x.title}`} className={k === i % n ? 'on' : ''} onClick={() => pick(k)} />)}</div>}
      </section>
      {home.length > 1 && <div className="ng-wrap ng-thumbs"><span>In the carousel</span>{home.map((x, k) => <button key={x.id} aria-label={`Show ${x.title}`} className={k === i % n ? 'on' : ''} onClick={() => pick(k)}><img src={x.image_url} alt="" /></button>)}</div>}
    </> : <section className="ng-wrap ng-intro"><h1>Original works, in <em>two editions</em></h1></section>}
    <div className="ng-wrap">
      <div className="ng-lead"><h2>Every work, two ways to own it</h2><p>A <b>normal copy</b>: an archival print, signed, delivered to your door. Or the <b>NFT copy</b>: one of one, owned on-chain, with the full-resolution original file. Pay by UPI or card, or with crypto.</p></div>
      <WallCard arts={arts} go={go} />
      <div className="ng-filters">{([['all', 'All works'], ['nft', 'NFT available'], ['new', 'New']] as const).map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>
      <div className="ng-grid">{list.map((a) => <button key={a.id} className="ng-w" onClick={() => go(`#/art/${a.slug}`)}>
        <div className="ng-im" style={{ backgroundImage: `url("${a.image_url}")` }} />
        <h3>{a.title}</h3><div className="ng-meta">{a.artist}{a.copy_price ? ` · from ${inr(a.copy_price)}` : ''}</div>
        <div className="ng-ed">{a.copy_price > 0 && <span className="ng-tag">Normal copy</span>}{a.nft_status === 'sold' ? <span className="ng-tag sold">NFT sold</span> : a.nft_price > 0 && <span className="ng-tag n">NFT copy</span>}{recent.has(a.id) && <span className="ng-tag">New</span>}</div>
      </button>)}</div>
      {!arts.length && <p className="ng-empty">New works are on their way.</p>}
    </div>
  </>;
}

export function ArtPage({ a, pay, go }: { a: Artwork; pay: PayInfo; go: (h: string) => void }) {
  const [buy, setBuy] = useState<'copy' | 'nft' | null>(null);
  const [msg, setMsg] = useState('');
  const sold = a.nft_status === 'sold', held = a.nft_status === 'reserved';
  const share = async () => { const u = location.href; try { if (navigator.share) await navigator.share({ title: a.title, url: u }); else { await navigator.clipboard.writeText(u); setMsg('Link copied'); } } catch { setMsg(u); } setTimeout(() => setMsg(''), 2500); };
  return <div className="ng-wrap">
    <button className="ng-back" onClick={() => go('#/')}>← All works</button>
    <div className="ng-det">
      <div className="ng-big" style={{ backgroundImage: `url("${a.image_url}")` }} role="img" aria-label={a.title} />
      <div>
        <h1>{a.title}</h1><div className="ng-by">{[a.artist, a.medium].filter(Boolean).join(' · ')}</div>
        {a.about && <div className="ng-about">{a.about}</div>}
        <div className="ng-eds">
          {a.copy_price > 0 && <div className="ng-edc"><div className="ng-top"><h4>Normal copy</h4><span className="ng-pr">{inr(a.copy_price)}</span></div>
            <ul><li>Archival print, signed, with certificate</li><li>High-resolution download included</li><li>Delivered across India in 5–7 days</li></ul>
            <button className="ng-buy" onClick={() => setBuy('copy')}>Buy normal copy</button></div>}
          {a.nft_price > 0 && <div className="ng-edc nft"><div className="ng-top"><h4>NFT copy</h4><span className="ng-pr">{inr(a.nft_price)}</span></div>
            <ul><li>1 of 1 · you own it on-chain and can resell it</li><li>Includes the full-resolution original file</li><li>The artist earns {pay.royalty_pct}% on every resale</li></ul>
            <div className="ng-kv"><span>Token</span><b>#{a.nft_token}</b><span>Network</span><b>Polygon</b>{pay.nft_contract && <><span>Contract</span><b>{pay.nft_contract}</b></>}{sold && a.nft_owner && <><span>Owner</span><b>{a.nft_owner.slice(0, 6)}…{a.nft_owner.slice(-4)}</b></>}</div>
            <button className="ng-buy" disabled={sold || held} onClick={() => setBuy('nft')}>{sold ? 'NFT sold' : held ? 'Someone is buying this right now' : 'Buy NFT copy'}</button></div>}
        </div>
        <div className="ng-share"><button onClick={share}>Share</button>{msg && <span>{msg}</span>}</div>
      </div>
    </div>
    {buy && <Checkout a={a} edition={buy} pay={pay} close={() => setBuy(null)} />}
  </div>;
}

type Step = 'form' | 'paying' | 'crypto' | 'done';
function Checkout({ a, edition, pay, close }: { a: Artwork; edition: 'copy' | 'nft'; pay: PayInfo; close: () => void }) {
  const amount = edition === 'nft' ? a.nft_price : a.copy_price;
  const methods: Method[] = [...(pay.razorpay ? ['razorpay' as Method] : []), ...pay.chains];
  const [m, setM] = useState<Method>(methods[0] || 'razorpay');
  const [b, setB] = useState(() => { try { return { name: '', email: '', phone: '', address: '', wallet: '', ...JSON.parse(localStorage.getItem('ng-buyer') || '{}') }; } catch { return { name: '', email: '', phone: '', address: '', wallet: '' }; } });
  const up = (p: Partial<typeof b>) => setB((x: typeof b) => ({ ...x, ...p }));
  const [step, setStep] = useState<Step>('form');
  const [err, setErr] = useState('');
  const [o, setO] = useState<Order | null>(null);
  const [done, setDone] = useState<Paid | null>(null);
  const [tx, setTx] = useState('');
  const [wait, setWait] = useState('');
  const poll = useRef<number>();
  useEffect(() => () => clearInterval(poll.current), []);
  const crypto = m !== 'razorpay';

  const check = async (order: Order, hash: string) => {
    try {
      const r = await verifyOrder({ order: order.order, ...(hash ? { tx: hash } : {}) });
      if ('paid' in r) { clearInterval(poll.current); setDone(r); setStep('done'); return true; }
      setWait(r.msg); return false;
    } catch (e) { clearInterval(poll.current); setErr((e as Error).message); setWait(''); return true; }
  };
  const watch = (order: Order, hash: string) => { clearInterval(poll.current); setWait('Checking the payment…'); check(order, hash); poll.current = window.setInterval(() => check(order, hash), order.chain === 'btc' ? 30000 : 5000); };

  const start = async () => {
    setErr('');
    if (!b.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) { setErr('Please give your name and email.'); return; }
    if (edition === 'copy' && !b.address.trim()) { setErr('Please give the delivery address for the print.'); return; }
    if (edition === 'nft' && !/^0x[0-9a-fA-F]{40}$/.test(b.wallet)) { setErr('Enter your Polygon wallet address (0x…), where the NFT will be sent.'); return; }
    try { localStorage.setItem('ng-buyer', JSON.stringify({ name: b.name, email: b.email, phone: b.phone, address: b.address, wallet: b.wallet })); } catch { /* fine */ }
    setStep('paying');
    try {
      const order = await createOrder({ artworkId: a.id, edition, method: m, buyer: b });
      setO(order);
      if (order.method === 'razorpay') {
        const r = await payRazorpay(order, b);
        const v = await verifyOrder({ order: order.order, ...r });
        if ('paid' in v) { setDone(v); setStep('done'); } else { setErr(v.msg); setStep('form'); }
      } else {
        setStep('crypto');
        if (order.chain === 'sol') watch(order, '');
      }
    } catch (e) { setErr((e as Error).message); setStep('form'); }
  };
  const walletPay = async () => {
    if (!o) return; setErr('');
    try { const h: string = await payEvm(o); setTx(h); watch(o, h); }
    catch (e: any) { setErr(e?.code === 4001 ? 'You cancelled in the wallet.' : e?.message || 'The wallet could not send the payment.'); }
  };
  const useWallet = async () => { try { up({ wallet: await evmAccount() }); } catch { setErr('Could not read the wallet address.'); } };

  return <div className="ng-ov" onClick={(e) => { if (e.target === e.currentTarget && step !== 'paying') close(); }}>
    <div className="ng-ck" role="dialog" aria-modal="true" aria-label="Checkout">
      <button className="ng-x" aria-label="Close" onClick={close}>×</button>
      {step === 'done' && done ? <div className="ng-ok">
        <div className="ng-okc">✓</div><h3>Payment received</h3>
        <p className="ng-sub">{inr(amount)} for “{a.title}”. A confirmation is on its way to {b.email}.</p>
        {edition === 'nft' ? <p className="ng-sub">NFT #{done.token} will be sent to <b className="ng-mono">{b.wallet.slice(0, 8)}…{b.wallet.slice(-6)}</b> on Polygon. We will email you the transaction.</p> : <p className="ng-sub">Your signed print ships in 5–7 days.</p>}
        {done.download && <a className="ng-pay" href={done.download} target="_blank" rel="noreferrer">Download the full-resolution file</a>}
        {o?.chain && tx && <a className="ng-link" href={explorer(o.chain, tx)} target="_blank" rel="noreferrer">View the payment on the block explorer</a>}
        <button className="ng-pay ghost" onClick={close}>Done</button>
      </div> : step === 'crypto' && o ? <CryptoPay o={o} tx={tx} setTx={setTx} wait={wait} err={err} walletPay={walletPay} submit={() => { setErr(''); watch(o, tx.trim()); }} back={() => { clearInterval(poll.current); setStep('form'); setWait(''); }} />
      : <>
        <h3>{edition === 'nft' ? 'Buy the NFT copy' : 'Buy a normal copy'}</h3>
        <p className="ng-sub">{a.title} · {a.artist}</p>
        <div className="ng-fl"><label>Name<input value={b.name} onChange={(e) => up({ name: e.target.value })} autoComplete="name" /></label>
          <label>Email<input type="email" value={b.email} onChange={(e) => up({ email: e.target.value })} autoComplete="email" /></label>
          <label>Phone<input type="tel" value={b.phone} onChange={(e) => up({ phone: e.target.value })} autoComplete="tel" /></label>
          {edition === 'copy' ? <label className="w2">Delivery address<textarea rows={2} value={b.address} onChange={(e) => up({ address: e.target.value })} autoComplete="street-address" /></label>
            : <label className="w2">Your wallet address, to receive the NFT (Polygon)<span className="ng-row"><input placeholder="0x…" value={b.wallet} onChange={(e) => up({ wallet: e.target.value.trim() })} />{hasEvmWallet() && <button type="button" className="ng-mini" onClick={useWallet}>Use my wallet</button>}</span></label>}
        </div>
        <div className="ng-pm">Pay with</div>
        {pay.razorpay && <button className={`ng-opt${m === 'razorpay' ? ' on' : ''}`} onClick={() => setM('razorpay')}><i style={{ background: '#3395ff' }}>₹</i><span><b>UPI, card or netbanking</b><small>Secure checkout by Razorpay</small></span></button>}
        {pay.chains.length > 0 && <div className="ng-crypto">{pay.chains.map((c) => <button key={c} className={`ng-opt${m === c ? ' on' : ''}`} onClick={() => setM(c)}><i style={{ background: CHAINS[c].color }}>{CHAINS[c].mark}</i><span><b>{CHAINS[c].name} · {CHAINS[c].coin}</b><small>{CHAINS[c].note}</small></span></button>)}</div>}
        {!methods.length && <p className="ng-err">Payments are not open yet. Please write to us.</p>}
        {err && <p className="ng-err">{err}</p>}
        <div className="ng-tot"><span>Total</span><span>{inr(amount)}</span></div>
        <button className="ng-pay" disabled={step === 'paying' || !methods.length} onClick={start}>{step === 'paying' ? 'Starting…' : crypto ? `Continue with ${CHAINS[m as Chain].coin}` : 'Pay ' + inr(amount)}</button>
        <p className="ng-fine">{crypto ? `You will see the exact ${CHAINS[m as Chain].coin} amount at today's rate. It goes straight to the gallery's wallet.` : 'Paid to Art From Vibrance through Razorpay.'}</p>
      </>}
    </div>
  </div>;
}

function CryptoPay({ o, tx, setTx, wait, err, walletPay, submit, back }: { o: Order; tx: string; setTx: (s: string) => void; wait: string; err: string; walletPay: () => void; submit: () => void; back: () => void }) {
  const c = CHAINS[o.chain!];
  const uri = useMemo(() => payUri(o), [o]);
  const qr = useMemo(() => qrSvg(uri), [uri]);
  const evm = o.chain === 'polygon' || o.chain === 'eth' || o.chain === 'bnb';
  const [copied, setCopied] = useState('');
  const copy = async (t: string, k: string) => { try { await navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(''), 1500); } catch { /* select manually */ } };
  const mins = Math.max(0, Math.round((Date.parse(o.expires_at) - Date.now()) / 60000));
  return <>
    <h3>Pay {o.amount} {c.coin}</h3>
    <p className="ng-sub">{inr(o.amount_inr)} on {c.name} · price held for {mins} min</p>
    {evm && hasEvmWallet() && <button className="ng-pay" onClick={walletPay} disabled={!!tx}>{tx ? 'Sent from your wallet' : `Pay with browser wallet (MetaMask)`}</button>}
    <div className="ng-qr"><span dangerouslySetInnerHTML={{ __html: qr }} /><div>
      <small>Send exactly</small><b className="ng-mono">{o.amount} {c.coin}</b><button className="ng-mini" onClick={() => copy(o.amount!, 'a')}>{copied === 'a' ? 'Copied' : 'Copy'}</button>
      <small>to the gallery {c.name} address</small><b className="ng-mono ng-addr">{o.pay_to}</b><button className="ng-mini" onClick={() => copy(o.pay_to!, 'w')}>{copied === 'w' ? 'Copied' : 'Copy'}</button>
      <a className="ng-link" href={uri}>Open in a wallet app</a>
    </div></div>
    {o.chain === 'sol' ? <p className="ng-fine">Scan with Phantom or Solflare. This page notices the payment by itself.</p>
      : <label className="ng-fl1">{o.chain === 'btc' ? 'Bitcoin transaction id' : 'Transaction hash (0x…)'}, after you pay<span className="ng-row"><input value={tx} onChange={(e) => setTx(e.target.value.trim())} placeholder={o.chain === 'btc' ? '64 characters' : '0x…'} /><button className="ng-mini" disabled={!tx} onClick={submit}>Check</button></span></label>}
    {wait && <p className="ng-wait"><i />{wait}</p>}
    {err && <p className="ng-err">{err}</p>}
    <button className="ng-link" onClick={back}>← Choose another way to pay</button>
  </>;
}
