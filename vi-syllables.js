/* Bộ kiểm tra âm tiết tiếng Việt – phần LOGIC (dữ liệu âm tiết nằm ở vi-data.js).
   Ý tưởng/quy tắc port từ viocr/corrector.go (MIT, github.com/nguyenhuucuongTC21B/viocr):
   - token hợp lệ = có trong tập âm tiết;
   - khoảng cách sửa CÓ TRỌNG SỐ dấu (OCR hay nhầm dấu thanh/dấu mũ hơn là nhầm chữ);
   - chỉ sửa khi: âm tiết vô nghĩa + ứng viên hợp lệ DUY NHẤT trong bán kính + token không thuộc nhóm miễn sửa;
   - mọi chỗ sửa đều trả về log để người dùng xem/hoàn tác.
   Dùng: VI.init(chuỗiÂmTiếtCáchBằngKhoảngTrắng) rồi VI.scan / VI.autoCorrect / VI.validRatio ... */
(function (root) {
  'use strict';
  const MAX_COST = 1.0;            // bán kính sửa: ứng viên có chi phí <= 1.0
  const MIN_LEN = 2;               // token < 2 ký tự không sửa
  const TONES = new Set([0x301, 0x300, 0x309, 0x303, 0x323]); // sắc huyền hỏi ngã nặng
  const OCR_PAIRS = [['x', 's'], ['i', 'l'], ['n', 'm'], ['r', 'n'], ['u', 'v'], ['ố', 'ộ']];

  let SET = new Set(), BY_LEN = new Map(), cache = new Map();

  const nfc = s => s.normalize('NFC');
  const TOKEN_RE = /\p{L}[\p{L}\p{M}]*/gu;           // chữ cái + dấu kết hợp (giữ nguyên vị trí cả với chuỗi NFD)
  const hasViet = s => { for (const ch of s) if (/\p{L}/u.test(ch) && ch.codePointAt(0) > 0x7f) return true; return false; };
  const isUpperOnly = t => t === t.toUpperCase() && t !== t.toLowerCase();

  function init(data) {
    const words = Array.isArray(data) ? data : String(data || '').split(/\s+/);
    SET = new Set(); BY_LEN = new Map(); cache = new Map();
    for (const w of words) {
      const s = nfc(w.trim().toLowerCase()); if (!s) continue;
      SET.add(s);
    }
    for (const s of SET) { const n = [...s].length; if (!BY_LEN.has(n)) BY_LEN.set(n, []); BY_LEN.get(n).push(s); }
    return SET.size;
  }
  const ready = () => SET.size > 0;
  const size = () => SET.size;

  function tokenize(text) {
    const out = []; let m; TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(text))) out.push({ token: m[0], start: m.index, end: m.index + m[0].length });
    return out;
  }
  const isValid = tok => SET.has(nfc(tok.toLowerCase()));

  // ---- khoảng cách sửa có trọng số dấu ----
  const decCache = new Map();
  function decompose(ch) {
    let d = decCache.get(ch);
    if (!d) { const n = ch.normalize('NFD'); const cps = [...n]; d = { base: cps[0], marks: cps.slice(1).map(c => c.codePointAt(0)) }; decCache.set(ch, d); }
    return d;
  }
  function runeCost(a, b) {
    if (a === b) return 0;
    const da = decompose(a), db = decompose(b);
    if (da.base === db.base) {
      const ta = da.marks.some(m => TONES.has(m)), tb = db.marks.some(m => TONES.has(m));
      if (ta && tb) return 0.6;      // khác dấu thanh
      if (!da.marks.length && !db.marks.length) return 0;
      return 0.75;                   // khác dấu mũ/móc/trăng (ă/â, ơ/ớ…)
    }
    const la = a.toLowerCase(), lb = b.toLowerCase();
    if ((la === 'd' && lb === 'đ') || (la === 'đ' && lb === 'd')) return 0.8;
    for (const [x, y] of OCR_PAIRS) if ((la === x && lb === y) || (la === y && lb === x)) return 0.85;
    return 1.0;
  }
  function weightedED(a, b, limit) {
    const ra = [...a], rb = [...b], la = ra.length, lb = rb.length;
    if (Math.abs(la - lb) > limit + 0.01) return limit + 1;
    let prev = Array.from({ length: lb + 1 }, (_, j) => j), cur = new Array(lb + 1);
    for (let i = 1; i <= la; i++) {
      cur[0] = i; let best = cur[0];
      for (let j = 1; j <= lb; j++) {
        const v = Math.min(prev[j - 1] + runeCost(ra[i - 1], rb[j - 1]), prev[j] + 1, cur[j - 1] + 1);
        cur[j] = v; if (v < best) best = v;
      }
      if (best > limit + 0.01) return limit + 1;   // cắt sớm
      [prev, cur] = [cur, prev];
    }
    return prev[lb];
  }

  // ứng viên tốt nhất (+ số ứng viên cùng chi phí) cho một token vô nghĩa
  function suggest(tok) {
    const t = nfc(tok.toLowerCase());
    if (cache.has(t)) return cache.get(t);
    const len = [...t].length; let best = '', bestCost = MAX_COST + 0.01, ties = 0;
    for (let d = -2; d <= 2; d++) {
      const list = BY_LEN.get(len + d); if (!list) continue;
      for (const s of list) {
        const c = weightedED(t, s, MAX_COST);
        if (c > MAX_COST) continue;
        if (c < bestCost - 1e-9) { bestCost = c; best = s; ties = 1; }
        else if (c <= bestCost + 1e-9 && s !== best) ties++;
      }
    }
    const r = best ? { best, cost: bestCost, ties } : { best: '', cost: Infinity, ties: 0 };
    if (cache.size > 5000) cache.clear();
    cache.set(t, r); return r;
  }

  // nhóm miễn sửa: quá ngắn, IN HOA toàn phần (mã hiệu), chỉ chữ Latin không dấu (tiếng Anh/mã), hoặc dính số
  function isProtectable(tok, text, start, end) {
    if ([...tok].length < MIN_LEN) return true;
    if (isUpperOnly(tok)) return true;
    if (!hasViet(tok)) return true;
    if (text) { const p = text[start - 1], n = text[end]; if ((p && /\d/.test(p)) || (n && /\d/.test(n))) return true; }
    return false;
  }
  function matchCase(orig, fixed) {
    if (isUpperOnly(orig)) return fixed.toUpperCase();
    const o = [...orig], f = [...fixed];
    if (o.length && o[0] !== o[0].toLowerCase() && f.length) f[0] = f[0].toUpperCase();
    return f.join('');
  }

  // token đáng ngờ để TÔ SÁNG: có chữ Việt có dấu mà không phải âm tiết hợp lệ
  function scan(text, opts = {}) {
    if (!ready()) return [];
    const out = [];
    for (const t of tokenize(text)) {
      if (!hasViet(t.token) || isValid(t.token)) continue;
      const s = opts.withSuggestion === false ? null : suggest(t.token);
      out.push({ ...t, suggestion: s && s.best && s.ties === 1 ? matchCase(t.token, s.best) : null, ties: s ? s.ties : 0 });
    }
    return out;
  }

  // sửa có kiểm soát: chỉ token vô nghĩa + ứng viên duy nhất + không miễn sửa
  function autoCorrect(text, opts = {}) {
    if (!ready()) return { text, changes: [] };
    const changes = [], max = opts.maxTokens || 600; let n = 0;
    for (const t of tokenize(text)) {
      if (n >= max) break;
      if (isProtectable(t.token, text, t.start, t.end) || isValid(t.token)) continue;
      n++;
      const s = suggest(t.token);
      if (!s.best || s.cost > MAX_COST || s.ties !== 1 || nfc(t.token.toLowerCase()) === s.best) continue;
      changes.push({ start: t.start, end: t.end, orig: t.token, fixed: matchCase(t.token, s.best), cost: s.cost });
    }
    let out = text;
    for (let i = changes.length - 1; i >= 0; i--) out = out.slice(0, changes[i].start) + changes[i].fixed + out.slice(changes[i].end);
    return { text: out, changes };
  }

  // tỉ lệ âm tiết hợp lệ: chỉ tính token hợp lệ hoặc có chữ Việt có dấu (tiếng Anh không bị phạt)
  function validRatio(text) {
    if (!ready()) return { ratio: 1, total: 0, valid: 0, invalid: 0 };
    let valid = 0, invalid = 0;
    for (const t of tokenize(text)) {
      if (isValid(t.token)) valid++; else if (hasViet(t.token)) invalid++;
    }
    const total = valid + invalid;
    return { ratio: total ? valid / total : 1, total, valid, invalid };
  }

  // ---- ký hiệu / số đáng ngờ (không cần dữ liệu âm tiết) ----
  const SYM_RULES = [
    [/[§‡†¢£¬¶◊¤]+/gu, 'ký hiệu lạ thường do OCR đọc nhầm'],
    [/\d[OoIlSB]\d|\b[OoIl]\d{2,}\b|\b\d{2,}[OoIl]\b/gu, 'chữ lẫn trong dãy số (O/0, l/1, S/5, B/8)'],
    [/\p{L}\d+\p{L}/gu, 'số xen giữa chữ trong một từ'],
    [/(?:^|\s)[|_~^`\\]{1,2}(?=\s|$)/gu, 'ký hiệu đứng riêng (có thể là nhiễu đường kẻ)'],
    [/[,;:]{2,}/gu, 'dấu câu lặp bất thường'],
  ];
  function symbolSuspects(text) {
    const out = [];
    for (const [re, reason] of SYM_RULES) { re.lastIndex = 0; let m; while ((m = re.exec(text))) { out.push({ start: m.index, end: m.index + m[0].length, text: m[0], reason }); if (!m[0]) re.lastIndex++; } }
    // ngoặc/nháy không cân bằng trong một đoạn ngắn
    for (const para of text.split(/\n+/)) {
      const o = (para.match(/\(/g) || []).length, c = (para.match(/\)/g) || []).length;
      if (o !== c && para.length < 400) out.push({ start: text.indexOf(para), end: text.indexOf(para) + para.length, text: para.slice(0, 40), reason: 'ngoặc đơn không cân bằng' });
    }
    return out.sort((a, b) => a.start - b.start);
  }

  root.VI = { init, ready, size, tokenize, isValid, suggest, scan, autoCorrect, validRatio, symbolSuspects, weightedED, runeCost, isProtectable, matchCase };
})(typeof window !== 'undefined' ? window : globalThis);
