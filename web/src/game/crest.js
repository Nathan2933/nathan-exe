// NATHAN.EXE crest: a pixel "N" in a small stepped forest-green square.
// 12×12 grid, crisp at 18–24px. Complete = filled with a muted-gold corner;
// incomplete = muted sage outline only.
const C = { forest: '#193D33', border: '#789580', cream: '#FFF3D6', gold: '#D8B45B', sage: '#B9C9B7', panel: '#244B3E' };

// stepped square: full rows 1..10 plus the notched outer ring
const OUTER = 'M1 0h10v1h1v10h-1v1H1v-1H0V1h1z';
const INNER = 'M2 1h8v1h1v8h-1v1H2v-1H1V2h1z';
const N = 'M3 3h2v6H3zM7 3h2v6H7zM5 4h1v2H5zM6 6h1v2H6z';

export function crestSVG(done, size = 20) {
  const body = done
    ? `<path d="${OUTER}" fill="${C.border}"/><path d="${INNER}" fill="${C.forest}"/><path d="${N}" fill="${C.cream}"/><rect x="9" y="1" width="1" height="1" fill="${C.gold}"/><rect x="10" y="2" width="1" height="1" fill="${C.gold}"/><rect x="9" y="2" width="1" height="1" fill="${C.gold}"/>`
    : `<path d="${OUTER}" fill="${C.border}"/><path d="${INNER}" fill="${C.sage}" fill-opacity=".25"/><path d="${N}" fill="${C.border}"/>`;
  return `<svg class="crest${done ? ' done' : ''}" viewBox="0 0 12 12" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function crestDataURI(done) {
  return `url("data:image/svg+xml,${encodeURIComponent(crestSVG(done).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}")`;
}
