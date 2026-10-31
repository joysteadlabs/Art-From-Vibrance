/* Admin (founder chose layout A, 2026-10-30): only the gallery admin (GALLERY_ADMINS on the Worker) can upload.
   Each upload makes a normal copy (print + download) and a 1-of-1 NFT copy with its own token number. */
import { useEffect, useRef, useState } from 'react';
import { adminArtworks, adminCreate, adminDelete, adminFulfil, adminMe, adminOrders, adminSaveSettings, adminSettings, adminUpdate, adminUpload, CHAINS, auth, inr, type AdminOrder, type Artwork, type Settings } from './api';
import { explorer } from './pay';

type Tab = 'home' | 'works' | 'orders' | 'payouts';
const ICONS: Record<Tab, string> = {
  home: '<path d="M3 12l9-8 9 8M5 10v10h14V10"/>',
  works: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  orders: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>',
  payouts: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2"/>',
};
const LABEL: Record<Tab, string> = { home: 'Home page', works: 'Artworks', orders: 'Orders', payouts: 'Payouts' };

/** Web-size copy for the site (max 2000 px, JPEG); the untouched file goes to the private originals bucket. */
async function webCopy(f: File): Promise<Blob> {
  const img = await createImageBitmap(f);
  const s = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Could not read the image.'))), 'image/jpeg', 0.88));
}

export function Admin({ go }: { go: (h: string) => void }) {
  const [state, setState] = useState<'loading' | 'out' | 'denied' | 'in'>('loading');
  const [email, setEmail] = useState('');
  const [tab, setTab] = useState<Tab>('home');
  const [arts, setArts] = useState<Artwork[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [set, setSet] = useState<Settings | null>(null);
  const [toast, setToast] = useState('');
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2800); };
  const load = async () => { const [a, o, s] = await Promise.all([adminArtworks(), adminOrders(), adminSettings()]); setArts(a); setOrders(o); setSet(s); };

  useEffect(() => {
    const check = async () => {
      const s = (await auth.getSession()).data.session;
      if (!s) { setState('out'); return; }
      setEmail(s.user.email || '');
      try { await adminMe(); setState('in'); await load(); } catch { setState('denied'); }
    };
    check();
    const { data } = auth.onAuthStateChange((e) => { if (e === 'SIGNED_IN' || e === 'SIGNED_OUT') check(); });
    return () => data.subscription.unsubscribe();
  }, []);
  const back = location.origin + location.pathname + '#/admin';
  const signIn = () => auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back } });
  const [mail, setMail] = useState(''); const [pw, setPw] = useState(''); const [sent, setSent] = useState('');
  // Email + password (Supabase Auth; the admin user is added in Supabase → Authentication → Users).
  const pwIn = async (e: { preventDefault(): void }) => { e.preventDefault(); setSent('');
    if (!mail.trim() || !pw) { setSent('Enter your email and password.'); return; }
    const { error } = await auth.signInWithPassword({ email: mail.trim(), password: pw });
    if (error) setSent(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message); };

  if (state !== 'in') return <div className="ad"><div className="ad-gate neu">
    <h1>Gallery <span>admin</span></h1>
    {state === 'loading' ? <p>Checking your sign-in…</p> : state === 'denied' ? <><p>{email} is not a gallery admin. Only the admin can upload artworks.</p><button className="btn g" onClick={() => auth.signOut()}>Sign out</button></> : <><p>Sign in with the gallery admin Google account to upload artworks and see orders.</p><button className="btn" onClick={signIn}>Sign in with Google</button>
      <p className="mut sm">or sign in with email</p>
      <form className="ad-mail" onSubmit={pwIn}><input type="email" autoComplete="username" placeholder="Email" value={mail} onChange={(e) => setMail(e.target.value)} /><input type="password" autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} /><button className="btn" type="submit">Sign in</button></form>
      {sent && <p className="mut sm">{sent}</p>}</>}
    <button className="lnk" onClick={() => go('#/')}>← Back to the gallery</button>
  </div></div>;

  const paid = orders.filter((o) => o.status === 'paid');
  const home = arts.filter((a) => a.on_home && a.published).sort((x, y) => x.home_order - y.home_order);
  const todo = paid.filter((o) => o.fulfil_status === 'todo').length;
  return <div className="ad">
    <header className="ad-bar"><b className="ad-logo"><i>A</i>Art From Vibrance</b><span className="chip in c-green">🔒 Admin · {email}</span><span className="sp" /><button className="btn g sm" onClick={() => go('#/')}>View site</button><button className="btn g sm" onClick={() => auth.signOut()}>Sign out</button></header>
    <div className="ad-app">
      <nav className="rail">{(Object.keys(LABEL) as Tab[]).map((t) => <button key={t} className={`rb${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[t] }} />{LABEL[t]}{t === 'orders' && todo > 0 && <em>{todo}</em>}</button>)}</nav>
      <main className="ad-main">
        <div className="tiles">
          <div className="tile neu"><div className="v">{home.length}</div><div className="l">On the home page</div></div>
          <div className="tile neu"><div className="v">{arts.filter((a) => a.published).length}</div><div className="l">Artworks listed</div></div>
          <div className="tile neu"><div className="v">{paid.length}</div><div className="l">Paid orders</div><div className="d">{todo ? `${todo} to send` : 'all sent'}</div></div>
          <div className="tile neu"><div className="v">{inr(paid.reduce((n, o) => n + o.amount_inr, 0))}</div><div className="l">Sales</div></div>
        </div>
        {tab === 'home' && <HomeTab arts={arts} home={home} reload={load} say={say} />}
        {tab === 'works' && <WorksTab arts={arts} reload={load} say={say} />}
        {tab === 'orders' && <OrdersTab orders={orders} reload={load} say={say} />}
        {tab === 'payouts' && set && <PayoutsTab s={set} setS={setSet} say={say} />}
      </main>
    </div>
    {toast && <div className="ad-toast">{toast}</div>}
  </div>;
}

function Uploader({ reload, say }: { reload: () => Promise<void>; say: (t: string) => void }) {
  const [busy, setBusy] = useState('');
  const [over, setOver] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    const fs = [...(files || [])].filter((f) => /^image\/(jpeg|png|webp|tiff)$/.test(f.type));
    if (!fs.length) { say('Choose JPG, PNG or WebP images.'); return; }
    try {
      for (const [k, f] of fs.entries()) {
        setBusy(`Uploading ${k + 1} of ${fs.length}: ${f.name}`);
        const [web, orig] = await Promise.all([adminUpload(await webCopy(f), 'web'), adminUpload(f, 'original')]);
        const title = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        await adminCreate({ title, artist: 'Nisha', image_url: web.url, original_path: orig.path, copy_price: 5000, nft_price: 15000, on_home: true });
      }
      await reload(); say(`${fs.length} artwork${fs.length > 1 ? 's' : ''} added · normal copy + NFT copy each. Set titles and prices in Artworks.`);
    } catch (e) { say((e as Error).message); }
    setBusy('');
  };
  return <label className={`drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
    <input ref={inp} type="file" accept="image/jpeg,image/png,image/webp,image/tiff" multiple onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
    <b>{busy || 'Drop artwork images here, or click to upload'}</b>
    <span>Each image becomes an artwork with a normal copy and a 1-of-1 NFT copy · the full-resolution file stays private for buyers</span>
  </label>;
}

function HomeTab({ arts, home, reload, say }: { arts: Artwork[]; home: Artwork[]; reload: () => Promise<void>; say: (t: string) => void }) {
  const move = async (i: number, d: number) => {
    const j = i + d; if (j < 0 || j >= home.length) return;
    await Promise.all([adminUpdate(home[i].id, { home_order: home[j].home_order }), adminUpdate(home[j].id, { home_order: home[i].home_order === home[j].home_order ? home[i].home_order + d : home[i].home_order })]);
    await reload();
  };
  const off = arts.filter((a) => a.published && !a.on_home);
  return <div className="g2">
    <section className="card neu"><h3>Home page slides<small>first one shows first</small></h3>
      <Uploader reload={reload} say={say} />
      <div className="slides">{home.map((a, i) => <div key={a.id} className="sl">
        <div className="im" style={{ backgroundImage: `url("${a.image_url}")` }} />{i === 0 && <span className="first">★ First</span>}
        <div className="bar"><span title={a.title}>{a.title}</span></div>
        <div className="bar pills"><span className="cpy">Copy {inr(a.copy_price)}</span><span className={`nft${a.nft_status === 'sold' ? ' sold' : ''}`}>NFT #{a.nft_token}{a.nft_status === 'sold' ? ' · sold' : ''}</span></div>
        <div className="bar"><button className="ib" aria-label="Move earlier" onClick={() => move(i, -1)}>‹</button><button className="ib" aria-label="Move later" onClick={() => move(i, 1)}>›</button><span /><button className="ib del" aria-label="Take off the home page" onClick={async () => { await adminUpdate(a.id, { on_home: false }); await reload(); say('Taken off the home page (still listed)'); }}>✕</button></div>
      </div>)}</div>
      {!home.length && <p className="mut">Nothing on the home page yet. Upload an image above.</p>}
    </section>
    <section className="card neu"><h3>Not on the home page<small>{off.length}</small></h3>
      {off.length ? off.map((a) => <div key={a.id} className="row"><div className="th" style={{ backgroundImage: `url("${a.image_url}")` }} /><div className="grow"><b>{a.title}</b><div className="mut sm">{a.artist}</div></div><button className="btn g sm" onClick={async () => { await adminUpdate(a.id, { on_home: true, home_order: (home.at(-1)?.home_order || 0) + 1 }); await reload(); }}>Show on home</button></div>) : <p className="mut">Every listed artwork is on the home page.</p>}
    </section>
  </div>;
}

function WorksTab({ arts, reload, say }: { arts: Artwork[]; reload: () => Promise<void>; say: (t: string) => void }) {
  return <section className="card neu"><h3>Artworks<small>{arts.length}</small></h3>
    <Uploader reload={reload} say={say} />
    <div className="works">{arts.map((a) => <WorkRow key={a.id + a.title + a.copy_price + a.nft_price + a.published} a={a} reload={reload} say={say} />)}</div>
  </section>;
}
function WorkRow({ a, reload, say }: { a: Artwork; reload: () => Promise<void>; say: (t: string) => void }) {
  const [f, setF] = useState({ title: a.title, artist: a.artist, medium: a.medium, about: a.about, copy_price: String(a.copy_price), nft_price: String(a.nft_price) });
  const dirty = f.title !== a.title || f.artist !== a.artist || f.medium !== a.medium || f.about !== a.about || f.copy_price !== String(a.copy_price) || f.nft_price !== String(a.nft_price);
  const save = async () => { try { await adminUpdate(a.id, { ...f, copy_price: +f.copy_price || 0, nft_price: +f.nft_price || 0 }); await reload(); say('Saved'); } catch (e) { say((e as Error).message); } };
  return <div className={`wk${a.published ? '' : ' hid'}`}>
    <div className="th big" style={{ backgroundImage: `url("${a.image_url}")` }} />
    <div className="wf">
      <label>Title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label>Artist<input value={f.artist} onChange={(e) => setF({ ...f, artist: e.target.value })} /></label>
      <label className="w2">Medium · size · year<input value={f.medium} onChange={(e) => setF({ ...f, medium: e.target.value })} placeholder="Oil on canvas · 90 × 120 cm · 2025" /></label>
      <label className="w2">About the work<textarea rows={2} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} /></label>
      <label>Normal copy (₹)<input inputMode="numeric" value={f.copy_price} onChange={(e) => setF({ ...f, copy_price: e.target.value.replace(/\D/g, '') })} /></label>
      <label>NFT copy (₹)<input inputMode="numeric" value={f.nft_price} disabled={a.nft_status === 'sold'} onChange={(e) => setF({ ...f, nft_price: e.target.value.replace(/\D/g, '') })} /></label>
    </div>
    <div className="wa">
      <span className={`nft${a.nft_status === 'sold' ? ' sold' : ''}`}>NFT #{a.nft_token} · {a.nft_status}</span>
      <span className="mut sm">{a.copies_sold} {a.copies_sold === 1 ? 'copy' : 'copies'} sold</span>
      <button className="btn sm" disabled={!dirty} onClick={save}>Save</button>
      <button className="btn g sm" onClick={async () => { await adminUpdate(a.id, { published: !a.published, ...(a.published ? { on_home: false } : {}) }); await reload(); }}>{a.published ? 'Hide' : 'Show'}</button>
      <button className="lnk" onClick={async () => { const r = await adminDelete(a.id); await reload(); say(r.hidden ? 'It has orders, so it was hidden instead of deleted.' : 'Deleted'); }}>Delete</button>
    </div>
  </div>;
}

function OrdersTab({ orders, reload, say }: { orders: AdminOrder[]; reload: () => Promise<void>; say: (t: string) => void }) {
  const [show, setShow] = useState<'todo' | 'paid' | 'all'>('todo');
  const list = orders.filter((o) => (show === 'all' ? true : o.status === 'paid' && (show === 'paid' || o.fulfil_status === 'todo')));
  return <section className="card neu"><h3>Orders<small>{orders.filter((o) => o.status === 'paid').length} paid</small></h3>
    <div className="seg in">{([['todo', 'To send'], ['paid', 'All paid'], ['all', 'Everything']] as const).map(([k, l]) => <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}</div>
    <div className="tbl"><table><thead><tr><th>When</th><th>Artwork</th><th>Edition</th><th>Paid</th><th>Buyer</th><th>Send to</th><th>Status</th></tr></thead><tbody>
      {list.map((o) => { const ch = o.method !== 'razorpay' ? o.method : null; const tx = (o.payment_ref || '').split(':').slice(1).join(':');
        return <tr key={o.id}>
          <td className="mono sm">{new Date(o.paid_at || o.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
          <td>{o.artwork?.title}</td>
          <td>{o.edition === 'nft' ? <span className="nft">NFT #{o.artwork?.nft_token}</span> : <span className="cpy">Copy</span>}</td>
          <td><b>{inr(o.amount_inr)}</b><div className="mut sm">{ch ? <>{o.crypto_amount} {o.crypto_coin}{tx && <> · <a href={explorer(ch, tx)} target="_blank" rel="noreferrer">tx</a></>}</> : 'Razorpay'}{o.status !== 'paid' && ` · ${o.status}`}</div></td>
          <td>{o.buyer_name}<div className="mut sm">{o.buyer_email} {o.buyer_phone}</div></td>
          <td className="sm">{o.edition === 'nft' ? <span className="mono">{o.buyer_wallet}</span> : o.ship_address}</td>
          <td>{o.status === 'paid' ? <select value={o.fulfil_status} onChange={async (e) => {
            let mint: string | undefined;
            if (e.target.value === 'minted') { mint = window.prompt('Paste the mint transaction hash (0x…), or leave empty') || undefined; }
            try { await adminFulfil(o.id, e.target.value, mint); await reload(); say('Updated'); } catch (er) { say((er as Error).message); }
          }}>{(o.edition === 'nft' ? ['todo', 'minted', 'done'] : ['todo', 'shipped', 'done']).map((s) => <option key={s} value={s}>{{ todo: 'To send', shipped: 'Shipped', minted: 'NFT minted', done: 'Done' }[s]}</option>)}</select> : <span className="mut sm">{o.status}</span>}</td>
        </tr>; })}
      {!list.length && <tr><td colSpan={7} className="mut">Nothing here.</td></tr>}
    </tbody></table></div>
  </section>;
}

function PayoutsTab({ s, setS, say }: { s: Settings; setS: (s: Settings) => void; say: (t: string) => void }) {
  const [f, setF] = useState({ ...s, royalty_pct: String(s.royalty_pct) });
  const save = async () => { try { setS(await adminSaveSettings({ ...f, royalty_pct: +f.royalty_pct })); say('Payout details saved'); } catch (e) { say((e as Error).message); } };
  return <div className="g2">
    <section className="card neu"><h3>Where the money goes<small>admin only</small></h3>
      <div className="wf">
        <label className="w2">UPI · cards · netbanking<input value="Razorpay → Nisha's own Razorpay account (settles to her bank)" disabled /></label>
        <label className="w2">Polygon, Ethereum and BNB wallet (one 0x address)<input value={f.evm_wallet} onChange={(e) => setF({ ...f, evm_wallet: e.target.value.trim() })} placeholder="0x…" /></label>
        <label className="w2">Bitcoin address<input value={f.btc_address} onChange={(e) => setF({ ...f, btc_address: e.target.value.trim() })} placeholder="bc1…" /></label>
        <label className="w2">Solana address<input value={f.sol_address} onChange={(e) => setF({ ...f, sol_address: e.target.value.trim() })} placeholder="Phantom / Solflare address" /></label>
        <label>Artist royalty on resale<select value={f.royalty_pct} onChange={(e) => setF({ ...f, royalty_pct: e.target.value })}>{[0, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}%</option>)}</select></label>
        <label>NFT contract (Polygon)<input value={f.nft_contract} onChange={(e) => setF({ ...f, nft_contract: e.target.value.trim() })} placeholder="0x… once deployed" /></label>
      </div>
      <div className="foot"><button className="btn" onClick={save}>Save payout details</button></div>
    </section>
    <section className="card neu"><h3>How buyers pay</h3>
      <div className="row"><i className="dot" style={{ background: '#3395ff' }}>₹</i><div className="grow"><b>Razorpay</b><div className="mut sm">UPI, cards, netbanking · always on</div></div></div>
      {(Object.keys(CHAINS) as (keyof typeof CHAINS)[]).map((c) => { const on = !!(c === 'btc' ? s.btc_address : c === 'sol' ? s.sol_address : s.evm_wallet);
        return <div key={c} className="row"><i className="dot" style={{ background: CHAINS[c].color }}>{CHAINS[c].mark}</i><div className="grow"><b>{CHAINS[c].name} · {CHAINS[c].coin}</b><div className="mut sm">{CHAINS[c].note}</div></div><span className={`chip ${on ? 'c-green' : 'c-amber'}`}>{on ? 'On' : 'Add address'}</span></div>; })}
      <p className="mut sm">Crypto is paid straight into these wallets. Each payment is checked on its network before the order is marked paid. A coin only shows at checkout once its address is saved.</p>
    </section>
  </div>;
}
