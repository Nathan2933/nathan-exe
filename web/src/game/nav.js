// Walkable grid + A* pathfinding on the ground plane (x/z).

export class NavGrid {
  constructor({ size = 64, cell = 0.5, islandRadius = 27, colliders = [], agentRadius = 0.45, blocked = null, queryColliders = null }) {
    this.blocked = null;
    this.extraBlocked = blocked; // (x, z) => true for non-walkable ground (water…)
    this.cell = cell;
    this.n = Math.ceil(size / cell);
    this.origin = -size / 2;
    this.islandRadius = islandRadius;
    this.colliders = colliders;
    this.queryColliders = queryColliders;
    this._qBuf = [];
    this.agentRadius = agentRadius;
    const total = this.n * this.n;
    this.blocked = new Uint8Array(total);
    this._g = new Float32Array(total);
    this._came = new Int32Array(total);
    this._closed = new Uint8Array(total);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const { x, z } = this.toWorld(i, j);
        this.blocked[j * this.n + i] = this.isWalkable(x, z, agentRadius) ? 0 : 1;
      }
    }
  }

  isWalkable(x, z, r = this.agentRadius) {
    if (Math.hypot(x, z) > this.islandRadius - r) return false;
    if (this.extraBlocked && this.extraBlocked(x, z)) return false;
    const list = this.queryColliders ? this.queryColliders(x, z, r, this._qBuf) : this.colliders;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.r !== undefined) {
        const dx = x - c.cx, dz = z - c.cz, rr = c.r + r;
        if (dx * dx + dz * dz < rr * rr) return false;
      } else if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
    }
    return true;
  }

  /** Fast lookup against the pre-baked grid (agent radius already applied). */
  gridFree(x, z) {
    const i = Math.floor((x - this.origin) / this.cell), j = Math.floor((z - this.origin) / this.cell);
    return this.free(i, j);
  }

  toCell(x, z) {
    return {
      i: Math.max(0, Math.min(this.n - 1, Math.floor((x - this.origin) / this.cell))),
      j: Math.max(0, Math.min(this.n - 1, Math.floor((z - this.origin) / this.cell))),
    };
  }
  toWorld(i, j) {
    return { x: this.origin + (i + 0.5) * this.cell, z: this.origin + (j + 0.5) * this.cell };
  }
  free(i, j) {
    return i >= 0 && j >= 0 && i < this.n && j < this.n && !this.blocked[j * this.n + i];
  }

  nearestFree(i, j) {
    if (this.free(i, j)) return { i, j };
    for (let r = 1; r < 24; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.free(i + di, j + dj)) return { i: i + di, j: j + dj };
        }
      }
    }
    return null;
  }

  /** Straight walkable line between two world points? */
  lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = s / Math.max(1, steps);
      if (!this.gridFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  findPath(sx, sz, tx, tz) {
    const s0 = this.toCell(sx, sz);
    const start = this.nearestFree(s0.i, s0.j);
    const t0 = this.toCell(tx, tz);
    const goal = this.nearestFree(t0.i, t0.j);
    if (!start || !goal) return [];
    const goalW = this.toWorld(goal.i, goal.j);
    const endX = this.isWalkable(tx, tz) ? tx : goalW.x;
    const endZ = this.isWalkable(tx, tz) ? tz : goalW.z;
    if (this.lineFree(sx, sz, endX, endZ)) return [{ x: endX, z: endZ }];

    const n = this.n;
    const startK = start.j * n + start.i;
    const goalK = goal.j * n + goal.i;
    const g = this._g; g.fill(Infinity);
    const came = this._came; came.fill(-1);
    const closed = this._closed; closed.fill(0);
    const open = new MinHeap();
    const h = (k) => {
      const dx = Math.abs((k % n) - goal.i), dz = Math.abs(Math.floor(k / n) - goal.j);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    g[startK] = 0;
    open.push(startK, h(startK));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false;
    while (open.size) {
      const k = open.pop();
      if (k === goalK) { found = true; break; }
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % n, j = Math.floor(k / n);
      for (const [di, dj, cost] of dirs) {
        const ni = i + di, nj = j + dj;
        if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(i + di, j) || !this.free(i, j + dj))) continue; // no corner cutting
        const nk = nj * n + ni;
        const ng = g[k] + cost;
        if (ng < g[nk]) { g[nk] = ng; came[nk] = k; open.push(nk, ng + h(nk)); }
      }
    }
    if (!found) return [];
    const cells = [];
    for (let k = goalK; k !== -1; k = came[k]) cells.push(this.toWorld(k % n, Math.floor(k / n)));
    cells.reverse();
    cells[cells.length - 1] = { x: endX, z: endZ };
    // String-pull: skip waypoints that have line of sight.
    const out = [];
    let cur = { x: sx, z: sz };
    let idx = 0;
    while (idx < cells.length) {
      let far = idx;
      for (let k = cells.length - 1; k > idx; k--) {
        if (this.lineFree(cur.x, cur.z, cells[k].x, cells[k].z)) { far = k; break; }
      }
      out.push(cells[far]);
      cur = cells[far];
      idx = far + 1;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const { k, p } = this; k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= p[i]) break;
      [k[i], k[par]] = [k[par], k[i]]; [p[i], p[par]] = [p[par], p[i]]; i = par;
    }
  }
  pop() {
    const { k, p } = this; const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[i], k[m]] = [k[m], k[i]]; [p[i], p[m]] = [p[m], p[i]]; i = m;
      }
    }
    return top;
  }
}
