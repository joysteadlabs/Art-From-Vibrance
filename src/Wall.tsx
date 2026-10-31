import { useEffect, useMemo, useRef, useState } from 'react';
import { inr, type Artwork } from './api';

/* "See it on your wall" (founder-approved mock https://claude.ai/artifact/HUo2YJDoXAj5ZbS2FT6DmJ, 2026-10-31):
   1) photo of your home or office (camera or gallery), 2) pick 3 paintings, 3) each one is placed on the plainest part of the
   wall at an estimated real size; drag to move, size + frame, then buy. Runs only in the browser: the photo never leaves the device. */

let pending: HTMLCanvasElement | null = null; // photo taken from the home card, handed to the page

function readPhoto(f: File): Promise<HTMLCanvasElement> {
  return new Promise((ok, bad) => {
    const rd = new FileReader();
    rd.onerror = () => bad(new Error('Could not read that photo.'));
    rd.onload = () => {
      const im = new Image();
      im.onerror = () => bad(new Error('That file is not a photo we can open.'));
      im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.width, im.height));
        const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height); ok(c);
      };
      im.src = rd.result as string;
    };
    rd.readAsDataURL(f);
  });
}

// Size in cm from the medium line, e.g. "Oil on canvas · 90 × 120 cm · 2025" (width × height).
export function sizeCm(a: Artwork): { w: number; h: number } | null {
  const m = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*cm/i.exec(a.medium || '');
  return m ? { w: +m[1], h: +m[2] } : null;
}
const price = (a: Artwork) => a.copy_price || a.nft_price;

function sampleRoom() {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const g = c.getContext('2d')!;
  const rr = (x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill(); };
  const wg = g.createLinearGradient(0, 0, 0, 640); wg.addColorStop(0, '#efe9df'); wg.addColorStop(1, '#e4dccf'); g.fillStyle = wg; g.fillRect(0, 0, 1200, 640);
  g.fillStyle = '#b98f62'; g.fillRect(0, 640, 1200, 260); for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(90,60,30,.08)'; g.fillRect(i * 90, 640, 2, 260); }
  g.fillStyle = '#d8cfc1'; g.fillRect(0, 630, 1200, 14);
  g.fillStyle = '#e7dfd3'; g.fillRect(980, 150, 170, 480); g.strokeStyle = '#cfc4b4'; g.lineWidth = 4; g.strokeRect(980, 150, 170, 480); g.fillStyle = '#bfb3a1'; g.beginPath(); g.arc(1000, 400, 7, 0, 7); g.fill();
  g.fillStyle = '#5b6b7a'; rr(300, 470, 560, 150, 26); g.fillStyle = '#6c7d8c'; rr(320, 430, 520, 90, 22); rr(270, 470, 70, 140, 18); rr(820, 470, 70, 140, 18);
  g.fillStyle = '#e9c46a'; rr(380, 455, 90, 60, 14); g.fillStyle = '#2a9d8f'; rr(700, 455, 90, 60, 14);
  g.fillStyle = '#3d3226'; g.fillRect(320, 620, 14, 40); g.fillRect(826, 620, 14, 40);
  g.fillStyle = '#8a6a48'; g.fillRect(90, 520, 110, 120); g.fillStyle = '#2f6b4f'; for (let k = 0; k < 9; k++) { g.beginPath(); g.ellipse(145 + Math.cos(k) * 50, 470 - k * 14, 20, 48, k * 0.6, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.ellipse(580, 700, 380, 40, 0, 0, 7); g.fill();
  return c;
}

type Box = { x: number; y: number; w: number; h: number };
// The plainest wall area: lowest brightness change in the upper part of the photo, favouring the middle.
export function findWall(c: HTMLCanvasElement): Box {
  const w = 120, h = Math.max(40, Math.round(120 * c.height / c.width)); const s = document.createElement('canvas'); s.width = w; s.height = h;
  const g = s.getContext('2d')!; g.drawImage(c, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data; const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  const bw = Math.round(w * 0.36), bh = Math.round(h * 0.4); let best = { s: Infinity, x: (w - bw) / 2, y: h * 0.1 };
  for (let y = Math.round(h * 0.06); y + bh < h * 0.72; y += 3) for (let x = Math.round(w * 0.04); x + bw < w * 0.96; x += 3) {
    let m = 0, q = 0, n = 0;
    for (let yy = y; yy < y + bh; yy += 2) for (let xx = x; xx < x + bw; xx += 2) { const v = L[yy * w + xx]; m += v; q += v * v; n++; }
    const sc = q / n - (m / n) ** 2 + Math.abs((x + bw / 2) / w - 0.5) * 40; if (sc < best.s) best = { s: sc, x, y };
  }
  const k = c.width / w; return { x: best.x * k, y: best.y * k, w: bw * k, h: bh * k };
}

type Frame = 'none' | 'black' | 'wood';
function draw(cv: HTMLCanvasElement, room: HTMLCanvasElement, box: Box, a: Artwork, img: HTMLImageElement | undefined, o: { sz: number; fr: Frame; at?: { x: number; y: number }; thumb?: boolean }) {
  cv.width = o.thumb ? 240 : room.width; cv.height = o.thumb ? Math.round(240 * room.height / room.width) : room.height;
  const g = cv.getContext('2d')!; const k = cv.width / room.width; g.save(); g.scale(k, k); g.drawImage(room, 0, 0);
  const cm = sizeCm(a); const ratio = cm ? cm.h / cm.w : img && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1.25;
  const pxPerCm = (room.height * 0.62) / 210; // a normal door (~2.1 m) fills about 62% of a wall photo's height
  let pw = (cm ? cm.w : 60) * pxPerCm * o.sz, ph = pw * ratio;
  const maxW = box.w * 1.35; if (pw > maxW) { ph *= maxW / pw; pw = maxW; }
  const maxH = box.h * 1.05; if (ph > maxH) { pw *= maxH / ph; ph = maxH; }
  const cx = o.at ? o.at.x : box.x + box.w / 2, cy = o.at ? o.at.y : Math.min(box.y + box.h / 2, box.y + box.h - ph / 2);
  const x = cx - pw / 2, y = cy - ph / 2, f = o.fr === 'none' ? 0 : Math.max(6, pw * 0.04);
  g.save(); g.shadowColor = 'rgba(0,0,0,.32)'; g.shadowBlur = pw * 0.08; g.shadowOffsetY = pw * 0.04; g.fillStyle = o.fr === 'wood' ? '#8a5a2b' : '#1c1c1c';
  g.fillRect(x - f, y - f, pw + 2 * f, ph + 2 * f); g.restore();
  if (img && img.complete && img.naturalWidth) { // cover-fit the image into the canvas area
    if (/^data:image\/svg/.test(img.src)) g.drawImage(img, x, y, pw, ph); // SVGs report no true pixel size: draw whole
    else {
      const ir = img.naturalHeight / img.naturalWidth; let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
      if (ir > ratio) { sh = sw * ratio; sy = (img.naturalHeight - sh) / 2; } else { sw = sh / ratio; sx = (img.naturalWidth - sw) / 2; }
      g.drawImage(img, sx, sy, sw, sh, x, y, pw, ph);
    }
  } else { g.fillStyle = '#d9d2c5'; g.fillRect(x, y, pw, ph); }
  if (f) { g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.strokeRect(x - f + 1, y - f + 1, pw + 2 * f - 2, ph + 2 * f - 2); }
  g.restore(); return { x: cx, y: cy, w: pw, h: ph };
}

const Cam = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
const Up = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4" /><path d="M4 16v4h16v-4" /></svg>;

function PhotoButtons({ onPhoto, small }: { onPhoto: (c: HTMLCanvasElement) => void; small?: boolean }) {
  const [err, setErr] = useState('');
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readPhoto(f).then((c) => { setErr(''); onPhoto(c); }, (x) => setErr(x.message)); };
  return <>
    <div className="rv-btns">
      <label className="rv-btn solid"><Cam />{small ? 'Take a photo' : 'Take a photo'}<input type="file" accept="image/*" capture="environment" hidden onChange={pick} /></label>
      <label className="rv-btn ghost"><Up />{small ? 'Upload' : 'Upload from gallery'}<input type="file" accept="image/*" hidden onChange={pick} /></label>
    </div>
    {err && <p className="rv-err" role="alert">{err}</p>}
  </>;
}

function useImages(arts: Artwork[]) {
  const [, tick] = useState(0);
  return useMemo(() => {
    const m = new Map<string, HTMLImageElement>();
    for (const a of arts) { const im = new Image(); im.onload = () => tick((n) => n + 1); im.src = a.image_url; m.set(a.id, im); }
    return m;
  }, [arts]);
}

/** Card on the home page. */
export function WallCard({ arts, go }: { arts: Artwork[]; go: (h: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const show = arts.filter((a) => a.image_url);
  const imgs = useImages(show.slice(0, 1));
  const room = useMemo(sampleRoom, []); const box = useMemo(() => findWall(room), [room]);
  useEffect(() => { if (ref.current && show[0]) draw(ref.current, room, box, show[0], imgs.get(show[0].id), { sz: 1, fr: 'black' }); });
  if (!show.length) return null;
  return <section className="rv rv-feat" aria-labelledby="rv-ft">
    <div>
      <span className="rv-kick">New · See it on your wall</span>
      <h2 id="rv-ft">Upload or Take pic of your home to see matching paintings in gallery</h2>
      <p>Take a photo of your home or office wall, choose 3 favourite paintings, and see each one hanging on your own wall before you buy.</p>
      <PhotoButtons onPhoto={(c) => { pending = c; go('#/wall'); }} />
    </div>
    <button className="rv-feat-art" onClick={() => go('#/wall')} aria-label="Try it with a sample room"><canvas ref={ref} /></button>
  </section>;
}

/** The 3-step page at #/wall. */
export function WallPage({ arts, go }: { arts: Artwork[]; go: (h: string) => void }) {
  const works = useMemo(() => arts.filter((a) => a.image_url && (a.copy_price || a.nft_price)), [arts]);
  const need = Math.min(3, works.length);
  const imgs = useImages(works);
  const [room, setRoomC] = useState<HTMLCanvasElement>(() => { const c = pending || sampleRoom(); return c; });
  const [mine, setMine] = useState(() => !!pending);
  useEffect(() => { pending = null; }, []);
  const box = useMemo(() => findWall(room), [room]);
  const [step, setStep] = useState(1);
  const [chosen, setChosen] = useState<string[]>([]);
  const [cur, setCur] = useState('');
  const [sz, setSz] = useState(1);
  const [fr, setFr] = useState<Frame>('black');
  const [at, setAt] = useState<Record<string, { x: number; y: number }>>({});
  const roomRef = useRef<HTMLCanvasElement>(null), outRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const byId = (id: string) => works.find((a) => a.id === id)!;

  const setRoom = (c: HTMLCanvasElement) => { setRoomC(c); setMine(true); setAt({}); setStep(1); };
  useEffect(() => { const c = roomRef.current; if (step === 1 && c) { c.width = room.width; c.height = room.height; c.getContext('2d')!.drawImage(room, 0, 0); } }, [room, step]);
  useEffect(() => { if (step === 3 && outRef.current && cur) last.current = draw(outRef.current, room, box, byId(cur), imgs.get(cur), { sz, fr, at: at[cur] }); });

  const toggle = (id: string) => setChosen((c) => c.includes(id) ? c.filter((x) => x !== id) : c.length < need ? [...c, id] : c);
  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => { const cv = e.currentTarget, r = cv.getBoundingClientRect(), k = cv.width / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }; };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { const p = pt(e), l = last.current; if (l && Math.abs(p.x - l.x) < l.w / 2 + 20 && Math.abs(p.y - l.y) < l.h / 2 + 20) { drag.current = { dx: p.x - l.x, dy: p.y - l.y }; e.currentTarget.setPointerCapture(e.pointerId); } };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drag.current) return; const p = pt(e); setAt((m) => ({ ...m, [cur]: { x: p.x - drag.current!.dx, y: p.y - drag.current!.dy } })); };
  const up = () => { drag.current = null; };

  if (!works.length) return <div className="ng-wrap ng-empty">New works are on their way. <a href="#/">Back to the gallery</a></div>;
  const tabs: [number, string, string][] = [[1, 'Your wall', 'Photo of home or office'], [2, `Pick ${need} paintings`, 'Your favourites'], [3, 'See them on your wall', 'Choose, then buy']];
  const can = (n: number) => n === 1 || n === 2 || chosen.length === need;
  const c = cur && byId(cur);
  return <div className="ng-wrap rv rv-page">
    <button className="ng-back" onClick={() => go('#/')}>← All works</button>
    <section className="rv-tool" aria-label="See paintings on your wall">
      <div className="rv-steps" role="tablist">{tabs.map(([n, t, s]) =>
        <button key={n} role="tab" aria-selected={step === n} disabled={!can(n)} className={`rv-tab${step === n ? ' on' : ''}${step > n ? ' done' : ''}`} onClick={() => setStep(n)}>
          <span className="n">{n}</span><span><b>{t}</b><small>{s}</small></span></button>)}</div>

      {step === 1 && <div className="rv-pane">
        <h1>Step 1 · Photo of your wall</h1>
        <p className="rv-sub">Stand back so the whole wall is in the picture. Daylight works best.</p>
        <div className="rv-drop">
          <canvas ref={roomRef} aria-label={mine ? 'Your photo' : 'Sample room'} />
          <div className="rv-tips">
            <span className="rv-kick">{mine ? 'Your photo' : 'Sample room'}</span>
            <ul><li>Face the wall straight on</li><li>Keep some empty wall in view</li><li>Your photo stays on your device</li></ul>
            <PhotoButtons onPhoto={setRoom} small />
          </div>
        </div>
        <div className="rv-bar sticky"><span className="rv-small">{mine ? 'Looks good? Go to the next step.' : 'Using the sample room until you add yours.'}</span><button className="rv-btn solid" onClick={() => setStep(2)}>Next: pick paintings →</button></div>
      </div>}

      {step === 2 && <div className="rv-pane">
        <h1>Step 2 · Pick your {need} favourite paintings</h1>
        <p className="rv-sub">Tap to choose. Tap again to remove.</p>
        <div className="rv-grid">{works.map((a) => { const k = chosen.indexOf(a.id), cm = sizeCm(a); return <button key={a.id} className={`rv-pick${k >= 0 ? ' on' : ''}`} aria-pressed={k >= 0} onClick={() => toggle(a.id)}>
          <img alt="" src={a.image_url} loading="lazy" /><b>{a.title}</b><span>{cm ? `${cm.w} × ${cm.h} cm · ` : ''}{inr(price(a))}</span>{k >= 0 && <i className="ck">{k + 1}</i>}</button>; })}</div>
        <div className="rv-bar sticky"><span className="rv-count">{chosen.length} of {need} chosen</span><button className="rv-btn solid" disabled={chosen.length < need} onClick={() => { setCur(chosen[0]); setStep(3); }}>Show them on my wall →</button></div>
      </div>}

      {step === 3 && c && <div className="rv-pane">
        <h1>Step 3 · Which one suits your wall?</h1>
        <p className="rv-sub">We placed each painting on the clearest part of your wall at about its real size. Drag it to move it.</p>
        <div className="rv-res">
          <div className="rv-stage"><canvas ref={outRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label={`${c.title} on your wall`} /><span className="rv-hint">Drag to move</span></div>
          <div className="rv-opts">
            <div className="rv-opts" role="radiogroup" aria-label="Choose a painting">{chosen.map((id) => { const a = byId(id), cm = sizeCm(a); return <button key={id} role="radio" aria-checked={id === cur} className={`rv-opt${id === cur ? ' on' : ''}`} onClick={() => setCur(id)}>
              <Thumb room={room} box={box} a={a} img={imgs.get(id)} sz={sz} fr={fr} at={at[id]} /><span><b>{a.title}</b><span>{cm ? `${cm.w} × ${cm.h} cm · ` : ''}{inr(price(a))}</span></span></button>; })}</div>
            <div className="rv-seg" role="group" aria-label="Size">{([[0.8, 'Smaller'], [1, 'Real size'], [1.25, 'Larger']] as const).map(([v, l]) => <button key={l} className={sz === v ? 'on' : ''} onClick={() => setSz(v)}>{l}</button>)}</div>
            <div className="rv-seg" role="group" aria-label="Frame">{([['none', 'No frame'], ['black', 'Black'], ['wood', 'Wood']] as const).map(([v, l]) => <button key={v} className={fr === v ? 'on' : ''} onClick={() => setFr(v)}>{l}</button>)}</div>
            <div className="rv-bar"><span><span className="rv-small">{c.title} · {c.copy_price ? 'print' : 'NFT copy'}</span><br /><span className="rv-price">{inr(price(c))}</span></span><button className="rv-btn solid" onClick={() => go(`#/art/${c.slug}`)}>Buy this painting →</button></div>
            <span className="rv-small">{sizeCm(c) ? 'Sizes are estimated from a normal door height (about 2.1 m).' : 'This work has no size listed, so it is shown at a typical size.'} Colours on screen may differ from the real painting. Frames here are a preview only.</span>
          </div>
        </div>
      </div>}
    </section>
  </div>;
}

function Thumb(p: { room: HTMLCanvasElement; box: Box; a: Artwork; img?: HTMLImageElement; sz: number; fr: Frame; at?: { x: number; y: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) draw(ref.current, p.room, p.box, p.a, p.img, { sz: p.sz, fr: p.fr, at: p.at, thumb: true }); });
  return <canvas ref={ref} />;
}
