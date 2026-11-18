// Draws the 1080x1920 Instagram Story card (pixel-art cinema scene) in the browser.
// One implementation for both the admin download and the public "Share as Story" button on review pages.
const IV = '#f3ead3', TEAL = '#6fc0bb';
const clampRating = (n) => Math.min(5, Math.max(0, Math.round(Number(n) || 0)));
const excerptOf = (text, n = 180) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

/**
 * @param r     {title, category, creator, year, rating, body, oneliner}
 * @param opts  {artBase, coverSrc, footText}  artBase = URL of the art folder (ends with /); footText = link shown under the sticker slot
 * @returns Promise<Blob> PNG
 */
export async function drawStoryCard(r, { artBase = '/reviews/art/', coverSrc = '', footText = '' } = {}) {
  await Promise.all([document.fonts.load('64px Silkscreen'), document.fonts.load('600 36px Inter')]).catch(() => {});
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const SC = { Movie: 'w', 'TV Show': 'w', Anime: 'w', Game: 'g', Music: 'm', Podcast: 'm' }[r.category] || 'n';
  const scene = { w: 'cinema', g: 'game', m: 'music', n: 'neutral' }[SC];
  const load = (src) => new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  const [bgImg, charImg, img] = await Promise.all([
    load(`${artBase}bg-${scene}-port.webp`),
    load({ w: `${artBase}nathan-cinema.webp`, g: `${artBase}nathan-game.webp`, m: `${artBase}nathan-music.webp`, n: '' }[SC]),
    load(coverSrc),
  ]);
  if (bgImg) g.drawImage(bgImg, 0, 0, W, H);
  else { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0a1230'); gr.addColorStop(1, '#1f1a48'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }

  const pix = (n) => `${n}px Silkscreen, "Courier New", monospace`;
  const sans = (n, w = 600, st = '') => `${st} ${w} ${n}px Inter, system-ui, sans-serif`.trim();
  const wrap = (text, font, maxW, maxLines) => {
    g.font = font; const words = String(text).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S{0,3}$/, '') + '…'; }
    return lines;
  };

  // header
  g.textAlign = 'center'; g.fillStyle = 'rgba(243,234,211,.88)'; g.font = pix(34); g.letterSpacing = '9px';
  g.fillText('NATHAN.EXE / REVIEWS', W / 2, 150); g.letterSpacing = '0px';
  g.fillStyle = 'rgba(243,234,211,.45)'; g.fillRect(175, 184, W - 350, 2);

  // framed poster (hangs on the wall under a small lamp)
  const fx = 517, fy = 236, fw = 505, fh = 580;
  const lamp = g.createRadialGradient(fx + fw / 2, fy - 4, 4, fx + fw / 2, fy - 4, 330); lamp.addColorStop(0, 'rgba(243,234,211,.20)'); lamp.addColorStop(1, 'rgba(243,234,211,0)');
  g.fillStyle = lamp; g.fillRect(fx - 120, fy - 40, fw + 240, fh + 120);
  g.fillStyle = IV; g.fillRect(fx + fw / 2 - 70, fy - 22, 140, 12);
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(fx + 14, fy + 16, fw, fh);
  g.fillStyle = '#1d3f4c'; g.fillRect(fx, fy, fw, fh);
  g.strokeStyle = 'rgba(111,192,187,.45)'; g.lineWidth = 3; g.strokeRect(fx + 4, fy + 4, fw - 8, fh - 8);
  const ix = fx + 28, iy = fy + 28, iw = fw - 56, ih = fh - 56;
  g.fillStyle = '#0a1020'; g.fillRect(ix, iy, iw, ih);
  if (img) { const s = Math.min(iw / img.width, ih / img.height); const w = img.width * s, h = img.height * s; g.drawImage(img, ix + (iw - w) / 2, iy + (ih - h) / 2, w, h); }
  else { g.fillStyle = TEAL; g.font = pix(150); g.fillText('★', fx + fw / 2, fy + fh / 2 + 55); }

  // our pixel-art Nathan, bottom-left (kept crisp)
  if (charImg) {
    const k = Math.min(545 / charImg.width, 880 / charImg.height), cw = charImg.width * k, ch = charImg.height * k;
    g.imageSmoothingEnabled = false; g.drawImage(charImg, 6, 1812 - ch, cw, ch); g.imageSmoothingEnabled = true;
  }
  const shade = g.createLinearGradient(0, 1730, 0, H); shade.addColorStop(0, 'rgba(5,8,22,0)'); shade.addColorStop(1, 'rgba(5,8,22,.85)');
  g.fillStyle = shade; g.fillRect(0, 1730, W, H - 1730);

  // text column (live data)
  const tx = 560, tw = 460; g.textAlign = 'left'; g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 8;
  let y = fy + fh + 90, ts = 64; g.fillStyle = IV;
  const title = String(r.title || '').toUpperCase();
  let tl = wrap(title, pix(ts), tw, 3);
  const widest = (ls) => Math.max(...ls.map((l) => g.measureText(l).width));
  while (ts > 36 && (g.font = pix(ts), widest(tl) > tw)) { ts -= 4; tl = wrap(title, pix(ts), tw, 3); }
  g.font = pix(ts); const lh = Math.round(ts * 1.22);
  for (const l of tl) { g.fillText(l, tx, y); y += lh; }
  y -= lh;
  const who = { Movie: 'Directed by', 'TV Show': 'Created by', Anime: 'Studio', Book: 'Written by', Game: 'By', Music: 'By', Podcast: 'By', App: 'By' }[r.category] || 'By';
  const meta = r.creator ? [r.creator, r.year].filter(Boolean).join(' · ') : r.year || '';
  if (meta) {
    g.fillStyle = 'rgba(243,234,211,.66)'; g.font = sans(30, 500); g.fillText(r.creator ? who : 'Year', tx, y + 52);
    g.fillStyle = IV; g.font = sans(40, 700); const ml = wrap(meta, sans(40, 700), tw, 2); ml.forEach((l, i) => g.fillText(l, tx, y + 100 + i * 48)); y += 100 + (ml.length - 1) * 48;
  }
  y += 30; g.fillStyle = 'rgba(243,234,211,.5)'; g.fillRect(tx, y, tw, 2);
  const n = clampRating(r.rating); y += 76; g.font = '56px sans-serif';
  for (let i = 0; i < 5; i++) { g.fillStyle = i < n ? IV : 'rgba(243,234,211,.22)'; g.fillText('★', tx + i * 58, y); }
  g.fillStyle = IV; g.font = pix(52); g.textAlign = 'right'; g.fillText(`${n}/5`, tx + tw, y); g.textAlign = 'left';
  y += 30; g.fillStyle = 'rgba(243,234,211,.5)'; g.fillRect(tx, y, tw, 2);
  y += 26;
  const one = String(r.oneliner || '').trim();
  const bodyTxt = excerptOf(r.body, 220);
  if (one) {
    // the one-liner: bigger than the description, plain (shrinks if a long word would overflow)
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 8;
    let fs = 44, ol, f1;
    for (;; fs -= 2) { f1 = sans(fs, 700, 'italic'); ol = wrap(one, f1, tw, 3); g.font = f1; if (fs <= 22 || Math.max(...ol.map((l) => g.measureText(l).width)) <= tw) break; }
    g.fillStyle = IV; g.font = f1; const lh1 = Math.round(fs * 1.25);
    ol.forEach((l, i) => g.fillText(l, tx, y + fs + i * lh1));
    y += ol.length * lh1 + 26;
  }
  // then the descriptive text, smaller, as much as fits above the link slot
  const f2 = sans(28, 500); const room = Math.floor((1500 - y) / 38);
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 8; g.fillStyle = 'rgba(243,234,211,.9)';
  if (room >= 1) for (const l of wrap(one ? bodyTxt : excerptOf(r.body, 150), one ? f2 : sans(38, 500, 'italic'), tw, Math.min(one ? room : 3, 6))) { g.font = one ? f2 : sans(38, 500, 'italic'); g.fillText(l, tx, y + 30); y += one ? 38 : 52; }
  g.shadowBlur = 0; g.shadowColor = 'transparent';

  // link-sticker slot: Instagram can't make an image tappable, so leave a clear spot for its Link sticker
  g.textAlign = 'center'; g.fillStyle = IV; g.font = pix(26); g.letterSpacing = '2px'; g.fillText('TAP TO READ THE FULL REVIEW', 790, 1525); g.letterSpacing = '0px';
  g.fillStyle = 'rgba(5,8,22,.55)'; g.beginPath(); g.roundRect(560, 1550, 460, 86, 43); g.fill();
  g.setLineDash([16, 10]); g.lineWidth = 3; g.strokeStyle = 'rgba(243,234,211,.7)'; g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(243,234,211,.6)'; g.font = sans(26, 500); g.fillText('link sticker goes here', 790, 1602);
  if (footText) {
    g.fillStyle = 'rgba(243,234,211,.85)'; g.font = sans(28, 600); g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 8;
    g.fillText(excerptOf(footText, 40), 790, 1678); g.shadowBlur = 0; g.shadowColor = 'transparent';
  }

  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Could not create the image.');
  return blob;
}
