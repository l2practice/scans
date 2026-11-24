/* Dò bảng có đường kẻ trên ảnh: tìm các đoạn kẻ ngang/dọc → dựng lưới → gộp ô theo chỗ thiếu đường kẻ (rowspan/colspan). */
'use strict';
const TBL = (() => {
  let TH = 135;

  // mặt nạ "điểm thuộc đường kẻ": tối hơn hẳn cả hai phía theo phương vuông góc (bắt được nét mờ, loại vùng tô xám)
  function mask(cv) {
    const w = cv.width, h = cv.height, d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const g = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
    const mh = new Uint8Array(w * h), mv = new Uint8Array(w * h), K = 3, C = 22, ABS = 215;
    for (let y = K; y < h - K; y++) for (let x = K; x < w - K; x++) {
      const i = y * w + x, v = g[i]; if (v > ABS) continue;
      if (v < g[i - K * w] - C && v < g[i + K * w] - C) mh[i] = 1;
      if (v < g[i - K] - C && v < g[i + K] - C) mv[i] = 1;
    }
    return { mh, mv, w, h };
  }

  // quét theo "main" (y cho ngang, x cho dọc): tìm các đoạn tối liên tục ≥ minRun, ghép các dòng liền kề thành một đoạn kẻ
  function segments(get, nMain, nCross, minRun, maxThick) {
    const out = []; let active = [];
    for (let a = 0; a < nMain; a++) {
      const runs = []; let b = 0;
      while (b < nCross) {
        if (get(a, b)) {
          let s = b, gap = 0;
          while (b < nCross && (get(a, b) || (gap = (get(a, b + 1) || get(a, b + 2)) ? 1 : 0))) b++; // chịu đứt nét ≤2px
          if (b - s >= minRun) runs.push([s, b]);
        } else b++;
      }
      const next = [];
      for (const [s, e] of runs) {
        let hit = null;
        for (const sg of active) {
          if (sg.m1 === a - 1) { const ov = Math.min(e, sg.c1) - Math.max(s, sg.c0); if (ov >= 0.5 * Math.min(e - s, sg.c1 - sg.c0)) { hit = sg; break; } }
        }
        if (hit) { hit.m1 = a; hit.c0 = Math.min(hit.c0, s); hit.c1 = Math.max(hit.c1, e); next.push(hit); }
        else { const sg = { c0: s, c1: e, m0: a, m1: a }; out.push(sg); next.push(sg); }
      }
      active = next;
    }
    return out.filter(s => s.m1 - s.m0 <= maxThick).map(s => ({ c0: s.c0, c1: s.c1, pos: (s.m0 + s.m1) / 2 }));
  }
  function mergeCollinear(segs) {
    segs.sort((a, b) => a.pos - b.pos || a.c0 - b.c0);
    const out = [];
    for (const s of segs) {
      const l = out[out.length - 1];
      if (l && Math.abs(l.pos - s.pos) <= 3 && s.c0 - l.c1 <= 10) { l.c1 = Math.max(l.c1, s.c1); }
      else out.push({ ...s });
    }
    return out;
  }
  const cluster = (vals, tol = 5) => {
    const v = [...vals].sort((a, b) => a - b), out = [];
    for (const x of v) { const l = out[out.length - 1]; if (l && x - l.last <= tol) { l.sum += x; l.n++; l.last = x; } else out.push({ sum: x, n: 1, last: x }); }
    return out.map(c => c.sum / c.n);
  };
  const nearest = (arr, v) => { let bi = 0, bd = 1e9; arr.forEach((a, i) => { const d = Math.abs(a - v); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const mergeIv = iv => { iv.sort((a, b) => a[0] - b[0]); const o = []; for (const x of iv) { const l = o[o.length - 1]; if (l && x[0] <= l[1] + 6) l[1] = Math.max(l[1], x[1]); else o.push([...x]); } return o; };
  const cover = (iv, a, b) => { let c = 0; for (const [s, e] of iv) { const ov = Math.min(e, b) - Math.max(s, a); if (ov > 0) c += ov; } return c / Math.max(1, b - a); };

  function buildTable(H, V, mk) {
    const Y = cluster(H.map(s => s.pos)), X = cluster(V.map(s => s.pos));
    if (Y.length < 3 || X.length < 3) return null;
    const hAt = Y.map(() => []), vAt = X.map(() => []);
    H.forEach(s => hAt[nearest(Y, s.pos)].push([s.c0, s.c1])); V.forEach(s => vAt[nearest(X, s.pos)].push([s.c0, s.c1]));
    const hI = hAt.map(mergeIv), vI = vAt.map(mergeIv);
    const nr = Y.length - 1, nc = X.length - 1, par = Array.from({ length: nr * nc }, (_, i) => i);
    const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
    // có đường kẻ hay không: lấy mẫu trực tiếp trên ảnh trong dải ±2px quanh vị trí lưới (chịu được nét mờ / đứt / dày)
    const { mh, mv, w, h } = mk;
    const vLine = (x, ya, yb) => { let c = 0, n = 0; const xi = Math.round(x); for (let y = Math.round(ya) + 2; y < Math.round(yb) - 1; y++, n++) { for (let dx = -2; dx <= 2; dx++) { const xx = xi + dx; if (xx >= 0 && xx < w && mv[y * w + xx]) { c++; break; } } } return n ? c / n : 1; };
    const hLine = (y, xa, xb) => { let c = 0, n = 0; const yi = Math.round(y); for (let x = Math.round(xa) + 2; x < Math.round(xb) - 1; x++, n++) { for (let dy = -2; dy <= 2; dy++) { const yy = yi + dy; if (yy >= 0 && yy < h && mh[yy * w + x]) { c++; break; } } } return n ? c / n : 1; };
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc - 1; j++) if (vLine(X[j + 1], Y[i], Y[i + 1]) < 0.5) uni(i * nc + j, i * nc + j + 1);
    for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc; j++) if (hLine(Y[i + 1], X[j], X[j + 1]) < 0.5) uni(i * nc + j, (i + 1) * nc + j);
    const sets = new Map();
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { const r = find(i * nc + j); if (!sets.has(r)) sets.set(r, []); sets.get(r).push([i, j]); }
    const cells = [];
    for (const list of sets.values()) {
      const r0 = Math.min(...list.map(x => x[0])), r1 = Math.max(...list.map(x => x[0])), c0 = Math.min(...list.map(x => x[1])), c1 = Math.max(...list.map(x => x[1]));
      if (list.length === (r1 - r0 + 1) * (c1 - c0 + 1)) cells.push({ r0, c0, rs: r1 - r0 + 1, cs: c1 - c0 + 1 });
      else list.forEach(([i, j]) => cells.push({ r0: i, c0: j, rs: 1, cs: 1 })); // tập không vuông vức → tách lẻ
    }
    cells.forEach(c => { c.x0 = X[c.c0]; c.x1 = X[c.c0 + c.cs]; c.y0 = Y[c.r0]; c.y1 = Y[c.r0 + c.rs]; });
    cells.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
    if (cells.length < 4) return null;
    return { x0: X[0], x1: X[X.length - 1], y0: Y[0], y1: Y[Y.length - 1], nr, nc, X, Y, cells };
  }

  function detect(cv) {
    const mk = mask(cv), { mh, mv, w, h } = mk, minRun = Math.max(25, Math.round(Math.min(w, h) * 0.02));
    const H = mergeCollinear(segments((y, x) => mh[y * w + x], h, w, minRun, 7));
    const V = mergeCollinear(segments((x, y) => mv[y * w + x], w, h, minRun, 7));
    const segs = [...H.map(s => ({ t: 'h', ...s })), ...V.map(s => ({ t: 'v', ...s }))];
    if (H.length < 3 || V.length < 3) return [];
    const par = segs.map((_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i], b = segs[j]; if (a.t === b.t) continue;
      const hs = a.t === 'h' ? a : b, vs = a.t === 'h' ? b : a;
      if (vs.pos >= hs.c0 - 5 && vs.pos <= hs.c1 + 5 && hs.pos >= vs.c0 - 5 && hs.pos <= vs.c1 + 5) par[find(i)] = find(j);
    }
    const groups = new Map(); segs.forEach((s, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(s); });
    const tables = [];
    for (const g of groups.values()) {
      const hh = g.filter(s => s.t === 'h'), vv = g.filter(s => s.t === 'v'); if (hh.length < 3 || vv.length < 3) continue;
      const t = buildTable(hh, vv, mk);
      if (t && t.x1 - t.x0 > 100 && t.y1 - t.y0 > 40) tables.push(t);
    }
    return tables.sort((a, b) => a.y0 - b.y0);
  }

  return { detect, setTH: v => { TH = v; } };
})();
