import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { auth, authReturn, listArtworks, type Artwork, type PayInfo } from './api';
import { ArtPage, Home, Nav } from './Site';
import { AboutPage, ContactPage, WorksPage, useSite } from './Pages';
import { Admin } from './Admin';
import { WallPage } from './Wall';
import { DEMO } from './demo';
import './styles.css';

const route = () => (authReturn && !location.hash.startsWith('#/') ? '/admin' : location.hash.replace(/^#/, '') || '/');
// Back from a Supabase email link: let supabase-js read the tokens, then show the admin page.
if (authReturn) auth.getSession().then(() => { if (!location.hash.startsWith('#/')) location.hash = '#/admin'; });

function App() {
  const [r, setR] = useState(route());
  const [data, setData] = useState<{ artworks: Artwork[]; pay: PayInfo } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { const f = () => { setR(route()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  useEffect(() => { if (!r.startsWith('/admin')) listArtworks().then(setData, (e) => setErr(e.message)); }, [r]);
  const go = (h: string) => { if (location.hash === h) window.scrollTo({ top: 0, behavior: 'smooth' }); else location.hash = h; };
  const site = useSite();

  const demo = DEMO && <div className="ng-demo">Preview · sample paintings · nothing is saved yet (connect the database in config.js) · {r.startsWith('/admin') ? <a href="#/">Open the gallery</a> : <a href="#/admin">Open the admin</a>}</div>;
  if (r.startsWith('/admin')) return <>{demo}<Admin go={go} /></>;
  const slug = /^\/art\/([^/?]+)/.exec(r)?.[1];
  const art = slug && data ? data.artworks.find((a) => a.slug === slug) : null;
  return <div className="ng">
    {demo}
    <Nav go={go} r={r} />
    {err ? <div className="ng-wrap ng-empty">{err}</div> : !data ? <div className="ng-wrap ng-empty">Loading…</div>
      : r.startsWith('/wall') ? <WallPage arts={data.artworks} go={go} />
      : r.startsWith('/works') ? <WorksPage arts={data.artworks} go={go} />
      : r.startsWith('/about') ? <AboutPage arts={data.artworks} site={site} go={go} />
      : r.startsWith('/contact') ? <ContactPage arts={data.artworks} site={site} />
      : slug ? (art ? <ArtPage a={art} pay={data.pay} go={go} /> : <div className="ng-wrap ng-empty">This artwork is not here any more. <a href="#/">See all works</a></div>)
      : <Home arts={data.artworks} go={go} />}
    <footer className="ng-foot"><div className="ng-wrap">Art From Vibrance{site?.city ? ` · ${site.city.split(',')[0]}` : ''} · <a href="#/about">About</a> · <a href="#/contact">Contact</a> · Pay by UPI, card or netbanking (Razorpay), or with Polygon, Ethereum, BNB, Bitcoin or Solana · <a href="#/admin">Admin</a></div></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
