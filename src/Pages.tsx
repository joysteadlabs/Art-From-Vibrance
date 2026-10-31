/* Menu pages: Works (#/works), About (#/about), Contact (#/contact). Founder-approved mock HrJAPDACizRZAUeRb9dXvA (2026-10-31).
   About & Contact content comes from admin → "About & Contact" (gallery_site_public); empty fields are hidden, nothing is invented. */
import { useEffect, useMemo, useState } from 'react';
import { EMPTY_SITE, getSiteInfo, igHandle, inr, waDigits, type Artwork, type SiteInfo } from './api';

const MEDIUMS = ['Oil', 'Acrylic', 'Watercolour', 'Gouache', 'Mixed media', 'Charcoal', 'Pencil', 'Ink'];
const mediumOf = (a: Artwork) => MEDIUMS.filter((m) => new RegExp(m === 'Watercolour' ? 'watercolou?r' : m, 'i').test(a.medium || ''));
const fromPrice = (a: Artwork) => { const p = [a.copy_price, a.nft_status !== 'sold' ? a.nft_price : 0].filter((x) => x > 0); return p.length ? inr(Math.min(...p)) : ''; };

export function useSite(): SiteInfo | null {
  const [s, setS] = useState<SiteInfo | null>(null);
  useEffect(() => { let on = true; getSiteInfo().then((x) => on && setS(x), () => on && setS(EMPTY_SITE)); return () => { on = false; }; }, []);
  return s;
}

export function WorksPage({ arts, go }: { arts: Artwork[]; go: (h: string) => void }) {
  const [f, setF] = useState('all');
  const recent = useMemo(() => new Set([...arts].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3).map((a) => a.id)), [arts]);
  const mediums = useMemo(() => MEDIUMS.filter((m) => arts.some((a) => mediumOf(a).includes(m))), [arts]);
  const chips: [string, string][] = [['all', 'All works'], ...mediums.map((m) => [m, m] as [string, string]), ['nft', 'NFT available'], ['new', 'New']];
  const list = arts.filter((a) => f === 'all' || (f === 'nft' ? a.nft_status !== 'sold' && a.nft_price > 0 : f === 'new' ? recent.has(a.id) : mediumOf(a).includes(f)));
  return <main className="ng-wrap ng-page">
    <div className="ng-ph">
      <div><span className="ng-eyebrow">The collection</span><h1>All works</h1>
        <p className="ng-sub">{arts.length} original {arts.length === 1 ? 'painting' : 'paintings'} · each as a signed print or a 1-of-1 NFT</p></div>
      <div className="ng-filters" role="group" aria-label="Filter works">{chips.map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}</div>
    </div>
    <div className="ng-grid ng-grid4">{list.map((a) => <button key={a.id} className="ng-w" onClick={() => go(`#/art/${a.slug}`)}>
      <div className="ng-im" style={{ backgroundImage: `url("${a.image_url}")` }} role="img" aria-label={a.title} />
      <h3>{a.title}</h3><div className="ng-meta">{a.artist}{a.medium ? ` · ${a.medium}` : ''}</div>
      {fromPrice(a) && <div className="ng-price">from {fromPrice(a)}</div>}
      {a.nft_status === 'sold' && <div className="ng-ed"><span className="ng-tag sold">NFT sold</span></div>}
    </button>)}</div>
    {!list.length && <p className="ng-empty">{arts.length ? 'No works match this filter yet.' : 'New works are on their way.'}</p>}
  </main>;
}

export function AboutPage({ arts, site, go }: { arts: Artwork[]; site: SiteInfo | null; go: (h: string) => void }) {
  if (!site) return <div className="ng-wrap ng-empty">Loading…</div>;
  const paras = site.about_text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const mediums = MEDIUMS.filter((m) => arts.some((a) => mediumOf(a).includes(m)));
  const artist = arts.find((a) => a.artist)?.artist || 'the artist';
  const commission = site.show_commissions && (site.contact_whatsapp || site.contact_email);
  return <main className="ng-wrap ng-page ng-two">
    <div className="ng-side">
      {site.about_photo ? <img className="ng-portrait" src={site.about_photo} alt={`${artist}, the artist`} /> : arts[0] && <img className="ng-portrait" src={arts[0].image_url} alt={arts[0].title} />}
      {site.city && <span className="ng-eyebrow mut">{site.city}</span>}
    </div>
    <div className="ng-col">
      <span className="ng-eyebrow">The artist</span>
      <h1>{site.about_heading || `About ${artist}`}</h1>
      {paras.length ? paras.map((t, k) => <p key={k} className={k ? 'ng-p2' : 'ng-p1'}>{t}</p>) : <p className="ng-p2">The artist's story is coming soon.</p>}
      <div className="ng-facts">
        <div><b>{arts.length}</b><span>{arts.length === 1 ? 'work' : 'works'} in the gallery</span></div>
        {mediums.length > 0 && <div><b>{mediums.slice(0, 2).join(' · ')}</b><span>mediums</span></div>}
        {site.city && <div><b>{site.city.split(',')[0]}</b><span>studio</span></div>}
      </div>
      <h2>Every work, two ways to own it</h2>
      <p className="ng-p2">A <b>normal copy</b>: an archival print, signed, delivered to your door. Or the <b>NFT copy</b>: one of one, owned on-chain, with the full-resolution original file.</p>
      <div className="ng-btns"><button className="ng-btn" onClick={() => go('#/works')}>See the works</button>{commission && <button className="ng-btn2" onClick={() => go('#/contact')}>Commission a painting</button>}</div>
    </div>
  </main>;
}

const Ico = ({ d }: { d: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />;
export function ContactPage({ arts, site }: { arts: Artwork[]; site: SiteInfo | null }) {
  if (!site) return <div className="ng-wrap ng-empty">Loading…</div>;
  const wa = waDigits(site.contact_whatsapp); const ig = igHandle(site.contact_instagram); const em = site.contact_email.trim();
  const ask = encodeURIComponent('Hello! I would like a painting made for my space. Here is a photo of my wall and the size I want:');
  const commissionHref = wa ? `https://wa.me/${wa}?text=${ask}` : em ? `mailto:${em}?subject=${encodeURIComponent('Commission a painting')}` : '';
  const pic = arts[1] || arts[0];
  return <main className="ng-wrap ng-page ng-two">
    <div className="ng-col">
      <span className="ng-eyebrow">Get in touch</span>
      <h1>Let's talk about art.</h1>
      <p className="ng-p2">Questions about a painting, delivery, or a custom piece for your home? Message the artist directly.</p>
      {pic && <img className="ng-cpic" src={pic.image_url} alt={pic.title} />}
    </div>
    <div className="ng-col">
      {wa && <a className="ng-cc" href={`https://wa.me/${wa}`} target="_blank" rel="noopener"><i className="g"><Ico d='<path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.3-4.4A9 9 0 1 1 21 12z"/>' /></i><span><b>WhatsApp</b><small>{site.contact_whatsapp} · fastest reply</small></span><em>Chat →</em></a>}
      {em && <a className="ng-cc" href={`mailto:${em}`}><i className="b"><Ico d='<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>' /></i><span><b>Email</b><small>{em}</small></span><em>Write →</em></a>}
      {ig && <a className="ng-cc" href={`https://instagram.com/${ig}`} target="_blank" rel="noopener"><i className="p"><Ico d='<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>' /></i><span><b>Instagram</b><small>@{ig} · new works first</small></span><em>Follow →</em></a>}
      {!wa && !em && !ig && <p className="ng-p2">Contact details are coming soon.</p>}
      {site.show_commissions && commissionHref && <div className="ng-comm">
        <span className="ng-eyebrow gold">Commissions</span>
        <b>Want a painting made for your space?</b>
        <p>Send a photo of your wall and the size you want{wa ? ' on WhatsApp' : ' by email'}. You'll get ideas and a price.</p>
        <a href={commissionHref} target={wa ? '_blank' : undefined} rel="noopener">{wa ? 'Ask on WhatsApp' : 'Ask by email'}</a>
      </div>}
      {site.city && <span className="ng-meta">Studio: {site.city} · Ships across India</span>}
    </div>
  </main>;
}
