/* DocConverter – chuyển tài liệu sang Markdown/Word/... + OCR tiếng Việt. Chạy 100% client-side. */
'use strict';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('libs/pdf.worker.min.js', location.href).href;

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k.startsWith('on')) n[k] = v; else n.setAttribute(k, v);
  }
  kids.flat().forEach(c => n.append(c));
  return n;
};
const baseName = n => n.replace(/\.[^.]+$/, '');
const extOf = n => (n.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ================= Markdown helpers ================= */
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
td.use(turndownPluginGfm.gfm);
td.remove(['script', 'style', 'noscript']);

function htmlToMd(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,template').forEach(n => n.remove());
  return td.turndown(doc.body).replace(/\n{3,}/g, '\n\n').trim();
}
const mdCell = s => String(s ?? '').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|').trim();
function rowsToMd(rows) {
  rows = rows.map(r => r.slice());
  while (rows.length && rows[rows.length - 1].every(c => String(c ?? '').trim() === '')) rows.pop();
  if (!rows.length) return '';
  const w = Math.max(...rows.map(r => r.length));
  rows = rows.map(r => Array.from({ length: w }, (_, i) => mdCell(r[i])));
  const line = r => '| ' + r.join(' | ') + ' |';
  return [line(rows[0]), line(rows[0].map(() => '---')), ...rows.slice(1).map(line)].join('\n');
}
async function readText(file) {
  const buf = await file.arrayBuffer();
  for (const enc of ['utf-8', 'windows-1258', 'windows-1252']) {
    try { return new TextDecoder(enc, { fatal: true }).decode(buf); } catch { /* next */ }
  }
  return new TextDecoder('utf-8').decode(buf);
}

/* ================= OCR ================= */
const ocr = { worker: null, lang: null, onProgress: null };
async function getWorker(lang) {
  if (ocr.worker && ocr.lang === lang) return ocr.worker;
  if (ocr.worker) { await ocr.worker.terminate(); ocr.worker = null; }
  const abs = p => new URL(p, location.href).href;
  ocr.worker = await Tesseract.createWorker(lang, 1, {
    workerPath: abs('libs/tess/worker.min.js'),
    corePath: abs('libs/tess/'),
    langPath: abs('libs/tess/lang/'),
    gzip: true,
    logger: m => { if (m.status === 'recognizing text' && ocr.onProgress) ocr.onProgress(m.progress); },
  });
  ocr.lang = lang;
  return ocr.worker;
}

/* Khử bóng (ngưỡng thích nghi) + loại dấu đỏ để OCR công văn chụp bằng điện thoại tốt hơn */
function preprocess(cv, cleanInk) {
  const w = cv.width, h = cv.height, ctx = cv.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    const r = d[p], gg = d[p + 1], b = d[p + 2];
    g[i] = ((r > 150 && gg < 120 && b < 120) || (cleanInk && b > 90 && b - Math.max(r, gg) > 40)) ? 255 : (0.299 * r + 0.587 * gg + 0.114 * b); // xoá dấu đỏ (và mực xanh chữ ký nếu bật lọc)
  }
  const W = w + 1, S = new Uint32Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) { row += g[(y - 1) * w + x - 1]; S[y * W + x] = S[(y - 1) * W + x] + row; }
  }
  const r = Math.max(12, Math.round(Math.min(w, h) / 24));
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = g[y * w + x] < mean * 0.86 ? 0 : 255;
      const p = (y * w + x) * 4; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}


/* ===== Bộ dựng bố cục dùng chung cho OCR và PDF chữ =====
   Đầu vào: các dòng {y0,y1,segs:[{t,x0,x1,b,i,sz}],first}. Đầu ra: Markdown, có chèn HTML tối thiểu
   (<p align>, <table data-plain>, <b>, <i>) để bảo toàn căn lề, cột, thụt đầu dòng khi xuất Word. */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isUpper = t => { const l = t.replace(/[^\p{L}]/gu, ''); return l.length >= 3 && l === l.toUpperCase() && l !== l.toLowerCase(); };
const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

function mergeRows(lines) {
  const medH = median(lines.map(l => l.y1 - l.y0)) || 12;
  lines = [...lines].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = [];
  for (const l of lines) {
    const cy = (l.y0 + l.y1) / 2, r = rows[rows.length - 1];
    if (r && Math.abs(cy - r.cy) < medH * 0.5) {
      r.segs.push(...l.segs); r.y0 = Math.min(r.y0, l.y0); r.y1 = Math.max(r.y1, l.y1); r.cy = (r.y0 + r.y1) / 2;
    } else rows.push({ ...l, segs: [...l.segs], cy });
  }
  rows.forEach(r => r.segs.sort((a, b) => a.x0 - b.x0));
  return rows;
}

function layoutToMd(lines, W, o) {
  lines = lines.filter(l => l.segs.length);
  if (!lines.length) return '';
  const medH = median(lines.map(l => l.y1 - l.y0)) || 12;
  const x0s = [], x1s = [];
  lines.forEach(l => l.segs.forEach(s => { x0s.push(s.x0); x1s.push(s.x1); }));
  x0s.sort((a, b) => a - b); x1s.sort((a, b) => a - b);
  const L = x0s[Math.floor(x0s.length * 0.1)], R = x1s[Math.floor(x1s.length * 0.9)], CW = Math.max(R - L, 1);
  const tblMid = t => {
    const m = t.rows.filter(r => r.length === 2 && r[0].x0 !== null && r[1].x0 !== null).map(r => (r[0].x1 + r[1].x0) / 2);
    return m.length ? m.reduce((a, b) => a + b) / m.length : null;
  };

  // 1) chia dòng thành khối: dòng đơn / hàng của bảng (nhiều cột đứng cạnh nhau)
  const blocks = []; let prev = null;
  for (const ln of lines) {
    const gap = prev ? ln.y0 - prev.y1 : 1e9; prev = ln;
    let segs = ln.segs; const last = blocks[blocks.length - 1];
    if (!o.rich && segs.length > 1) segs = [{ ...segs[0], t: segs.map(s => s.t).join('  '), x1: segs[segs.length - 1].x1 }];
    if (segs.length >= 2) {
      if (last && last.type === 'table' && last.cols === segs.length && gap < medH * 1.2) last.rows.push(segs);
      else blocks.push({ type: 'table', cols: segs.length, rows: [segs] });
      continue;
    }
    const s = segs[0];
    if (last && last.type === 'table' && last.cols === 2 && gap < medH * 0.8) {
      const mid = tblMid(last);
      if (mid !== null) {
        if (s.x1 <= mid + CW * 0.02) { last.rows.push([s, { t: '', x0: null }]); continue; }
        if (s.x0 >= mid - CW * 0.02) { last.rows.push([{ t: '', x0: null }, s]); continue; }
      }
    }
    blocks.push({ type: 'line', s, gap, first: ln.first });
  }

  const fmt = s => {
    const t = esc(s.t);
    if (o.rich) return (s.b || (o.boldCaps && isUpper(s.t) && s.t.length < 90)) ? `<b>${s.i ? '<i>' + t + '</i>' : t}</b>` : (s.i ? `<i>${t}</i>` : t);
    return s.b ? `**${s.t}**` : s.t;
  };
  const emitTable = t => {
    const mid = t.cols === 2 ? tblMid(t) : null;
    const bounds = mid !== null ? [L, mid, R] : Array.from({ length: t.cols + 1 }, (_, i) => L + CW * i / t.cols);
    const widths = bounds.slice(1).map((b, i) => Math.max(8, Math.round((b - bounds[i]) / CW * 100)));
    const rows = t.rows.map(r => '<tr>' + r.map((s, i) => {
      const lo = bounds[i], hi = bounds[i + 1], w = hi - lo; let al = 'left';
      if (s.x0 !== null && s.t) {
        const gl = s.x0 - lo, gr = hi - s.x1;
        if (Math.abs(gl - gr) < w * 0.12 && gl > w * 0.05) al = 'center'; else if (gl > gr * 2 + w * 0.05) al = 'right';
      }
      return `<td align="${al}">${s.t ? fmt(s) : ''}</td>`;
    }).join('') + '</tr>').join('');
    return `<table data-plain="1" data-widths="${widths.join(',')}"><tbody>${rows}</tbody></table>`;
  };
  const emitPara = p => {
    if (p.head) return '#'.repeat(p.head) + ' ' + p.lines.map(l => l.t).join(' ');
    let align = p.align;
    if (align === 'left' && p.lines.length >= 2) {
      const nl = p.lines.slice(0, -1);
      if (nl.filter(l => l.x1 >= R - CW * 0.04).length / nl.length >= 0.6) align = 'justify';
    }
    const brk = align === 'center' || o.keepBr;
    let text;
    if (brk) text = p.lines.map(fmt).join(o.rich ? '<br>' : '  \n');
    else text = p.lines.map(fmt).reduce((a, b) => /\p{Ll}-$/u.test(a) && /^\p{Ll}/u.test(b) ? a.slice(0, -1) + b : a + ' ' + b);
    const boldAny = p.lines.some(l => l.b);
    if (o.rich && (align !== 'left' || p.indent || p.bullet || boldAny || /<b>|<i>/.test(text) || brk && p.lines.length > 1)) {
      return `<p${align !== 'left' ? ` align="${align}"` : ''}${p.indent ? ' data-indent="1"' : ''}>${text}</p>`;
    }
    return text;
  };

  // 2) gộp dòng thành đoạn, nhận diện căn lề / thụt đầu dòng / tiêu đề
  const out = []; let para = null;
  const flush = () => { if (para) { out.push(emitPara(para)); para = null; } };
  const bulletRe = /^([-–•●▪+*]|\d{1,2}[.)]|[a-zđ][.)])\s/i;
  for (const b of blocks) {
    if (b.type === 'table') { flush(); out.push(emitTable(b)); continue; }
    const s = b.s, gl = s.x0 - L, gr = R - s.x1;
    let align = 'left';
    if (Math.abs(gl - gr) < CW * 0.06 && gl > CW * 0.08) align = 'center';
    else if (gr < CW * 0.03 && gl > CW * 0.35) align = 'right';
    const indent = align === 'left' && gl > CW * 0.025 && gl < CW * 0.25;
    const bullet = bulletRe.test(s.t);
    let head = 0;
    if (o.body && s.sz && align === 'left') { const r = s.sz / o.body; if (r >= 1.3 && s.t.length < 140) head = r >= 1.8 ? 1 : r >= 1.45 ? 2 : 3; }
    const pl = para && para.lines[para.lines.length - 1];
    let join = false;
    if (para && head && para.head === head && b.gap < medH * 0.6) join = true;
    else if (para && !head && !para.head && !bullet && !b.first && para.align === align && b.gap < medH * 0.35) {
      if (align === 'center') join = true;
      else if (align === 'left' && !indent) join = pl.x1 >= R - CW * 0.25;
    }
    if (join) para.lines.push(s); else { flush(); para = { lines: [s], align, indent, bullet, head }; }
  }
  flush();
  return out.join('\n\n');
}

/* Dòng từ Tesseract → cấu trúc chung (tách cột theo khoảng trống lớn giữa các từ) */
function ocrLines(paras, clean) {
  // clean: loại từ/dòng "rác" do chữ ký, con dấu, hình, đường kẻ bị đọc nhầm thành chữ (độ tin cậy thấp, toàn ký hiệu, ký tự lẻ)
  const okWord = w => {
    const t = (w.text || '').trim(); if (!t) return false; if (!clean) return true;
    const alnum = t.replace(/[^\p{L}\p{N}]/gu, '').length;
    if (!alnum) return w.confidence >= 50 && /^[-–—/.,:;()]$/.test(t);   // ký hiệu lẻ: chỉ giữ dấu gạch/ngắt câu đọc chắc
    if (w.confidence < 20 && alnum <= 3 && !/^\d+$/.test(t)) return false; // mảnh vụn độ tin cậy rất thấp
    return true;                                                           // chữ cái / chữ số đơn lẻ (a, I…) luôn giữ
  };
  const raw = [];
  paras.forEach((p, pi) => (p.lines || []).forEach((l, li) => {
    const all = (l.words || []).filter(w => (w.text || '').trim());
    const ws = all.filter(okWord).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (clean && all.length && (!ws.length || (ws.length <= 1 && all.length - ws.length >= 2))) return;
    const t = (clean && all.length ? ws.map(w => w.text.trim()).join(' ') : (l.text || '')).trim();
    if (t.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return;
    if (l.confidence < (clean ? 45 : 35) && t.replace(/\s/g, '').length < 12) return;
    const bb = l.bbox;
    raw.push({ y0: bb.y0, y1: bb.y1, first: li === 0 && pi > 0, l, t, ws, bb });
  }));
  if (!raw.length) return [];
  const medH = median(raw.map(r => r.y1 - r.y0)) || 30;
  raw.forEach(r => {
    const ws = clean ? r.ws : (r.l.words || []).filter(w => w.text && w.text.trim()).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (!ws.length) { r.segs = [{ t: r.t, x0: r.bb.x0, x1: r.bb.x1 }]; return; }
    const segs = []; let cur = null;
    for (const w of ws) {
      if (cur && w.bbox.x0 - cur.x1 > medH * 2.5) { segs.push(cur); cur = null; }
      if (!cur) cur = { t: w.text, x0: w.bbox.x0, x1: w.bbox.x1 }; else { cur.t += ' ' + w.text; cur.x1 = w.bbox.x1; }
    }
    segs.push(cur); r.segs = segs;
  });
  return mergeRows(raw);
}

/* ===== OCR bằng AI (Gemini / Claude): đọc cả chữ viết tay và dựng lại bố cục ===== */
const AI_DEFAULTS = { gemini: 'gemini-flash-latest', claude: 'claude-sonnet-5-5' };
function aiPrompt(layout, kind) {
  if (kind === 'free') return 'Đây là ảnh trang ghi chép / bài giải viết tay (có thể kèm sơ đồ, mũi tên, bảng, công thức, phần tô sáng). Hãy chép lại TOÀN BỘ nội dung một cách chính xác, giữ nguyên ngôn ngữ gốc (Anh/Việt), số liệu, đơn vị, dấu thập phân và dấu ngăn cách hàng nghìn như tác giả viết. Quy tắc: (1) Đọc từ trên xuống dưới, mỗi dòng/phép tính là một dòng riêng (cách nhau bằng dòng trống). (2) Giữ nguyên ký hiệu (×, −, =, /, %, ~); phân số viết dạng a / b. (3) Sơ đồ (cây, luồng, mũi tên) không vẽ lại được: hãy diễn đạt thành bảng Markdown hoặc danh sách thụt lề, nêu đủ quan hệ "nguồn → đích", nhãn trên mũi tên (tỉ lệ %, chi phí…) và ghi chú đi kèm, đặt dưới một dòng tiêu đề **Sơ đồ**. (4) Chữ/số được tô sáng (highlight) bọc trong <mark>…</mark>. (5) Bảng có đường kẻ: chép thành <table border="1"> HTML — MỖI <tr> trên một dòng, không có dòng trống bên trong bảng; chép ĐỦ mọi hàng và mọi cột (kể cả ô trống, tuyệt đối không bỏ cột); ô gộp dùng rowspan/colspan; ô tiêu đề dùng <th>; số liệu giữ nguyên từng chữ số. (6) Chữ không đọc được ghi [?]. KHÔNG giải bài, KHÔNG bình luận, KHÔNG dùng code fence.';
  let p = 'Bạn là công cụ OCR cho văn bản hành chính tiếng Việt. Chép lại CHÍNH XÁC toàn bộ chữ trong ảnh, kể cả chữ viết tay, số hiệu, ngày tháng, ghi chú bên lề, chữ trong con dấu và chữ ký (nếu đọc được). Giữ nguyên tiếng Việt có dấu, KHÔNG dịch, KHÔNG sửa chính tả, KHÔNG thêm bình luận. Chữ không đọc được thì ghi [?]. Chữ viết tay đặt trong *…* khi cần phân biệt với chữ in. Chỉ trả về nội dung, không dùng code fence.\n';
  p += layout
    ? 'Dựng lại bố cục bằng Markdown kèm HTML tối giản: đoạn căn giữa → <p align="center">…</p> (xuống dòng bằng <br>); căn phải → <p align="right">; căn đều hai bên → <p align="justify">; đoạn thụt đầu dòng thêm data-indent="1" (ví dụ <p align="justify" data-indent="1">); chữ đậm <b>…</b>, nghiêng <i>…</i>. Phần đầu văn bản gồm hai khối đứng cạnh nhau (tên cơ quan | quốc hiệu, tiêu ngữ; hoặc "Số: …" | "Địa danh, ngày…"; hoặc "Nơi nhận" | chức danh người ký) phải dùng bảng không viền: <table data-plain="1" data-widths="45,55"><tbody><tr><td align="center"><b>…</b><br>…</td><td align="center">…</td></tr></tbody></table> (data-widths là % chiều rộng mỗi cột). Bảng có đường kẻ: chép thành <table border="1"> HTML — MỖI <tr> trên một dòng, không có dòng trống bên trong bảng; chép ĐỦ mọi hàng và mọi cột (kể cả ô trống, tuyệt đối không bỏ cột); ô gộp dùng rowspan/colspan; ô tiêu đề dùng <th>; số liệu giữ nguyên từng chữ số. Không dùng thêm thẻ nào khác. Khi ảnh có nhiều trang/ngắt trang rõ ràng, không cần đánh dấu.'
    : 'Định dạng đầu ra là Markdown thuần (tiêu đề #, **đậm**, danh sách, bảng Markdown). Không dùng HTML.';
  return p;
}
const AI_FALLBACK = { gemini: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash'], claude: ['claude-haiku-5-5', 'claude-sonnet-5-5'] };
const aiNote = m => { const st = $('#aiState'); if (st) { st.textContent = m; st.className = 'badge warn'; } };
function aiModelList(engine) { try { return JSON.parse(localStorage.getItem('dc_models_' + engine) || '[]'); } catch { return []; } }
function aiFallbacks(engine, cur) {
  const lst = aiModelList(engine).filter(m => /flash|haiku|sonnet/i.test(m) && !/image|tts|live|audio|embed|robot|vision/i.test(m));
  return [...new Set([...lst, ...AI_FALLBACK[engine]])].filter(m => m !== cur).slice(0, 3);
}
async function aiOnce(opts, model, prompt, b64, maxTok) {
  const key = opts.aiKey; let res, data;
  const RETRY = [429, 500, 502, 503, 504];
  for (let k = 0; ; k++) {
    if (opts.engine === 'gemini') {
      const parts = [{ text: prompt }]; if (b64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0, maxOutputTokens: Math.max(maxTok, 8192) } }),
      });
    } else {
      const content = []; if (b64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
      content.push({ type: 'text', text: prompt });
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: maxTok, messages: [{ role: 'user', content }] }),
      });
    }
    data = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = opts.engine === 'gemini' ? (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('') : (data.content || []).map(c => c.text || '').join('');
      return { ok: true, text };
    }
    if (RETRY.includes(res.status) && k < 3) { aiNote(`${model}: máy chủ quá tải (${res.status}), thử lại lần ${k + 1}…`); await sleep([2500, 6000, 12000][k]); continue; }
    return { ok: false, status: res.status, msg: data.error?.message || data.error?.status || 'không rõ' };
  }
}
async function aiCall(opts, prompt, b64, maxTok = 16000) {
  if (!opts.aiKey) throw new Error('Chưa nhập API key cho chế độ AI (khung "🤖 AI").');
  const first = opts.aiModel || AI_DEFAULTS[opts.engine], tried = [first];
  const queue = [first, ...aiFallbacks(opts.engine, first)];
  let last;
  for (const model of queue) {
    if (model !== first) aiNote(`Đang thử model dự phòng: ${model}…`);
    const r = await aiOnce(opts, model, prompt, b64, maxTok);
    if (r.ok) { if (model !== first) aiNote(`Đã dùng model dự phòng: ${model} (model "${first}" đang lỗi)`); else applyEngine(); return r.text; }
    last = { ...r, model };
    const switchable = [429, 500, 502, 503, 504, 404].includes(r.status) || (r.status === 403 && /model|no longer|not available|not found/i.test(r.msg)) || (r.status === 400 && /model/i.test(r.msg));
    if (!switchable) break;
  }
  const nm = opts.engine === 'gemini' ? 'Gemini' : 'Claude';
  const hint = [429, 500, 502, 503, 504].includes(last.status) ? ` → ${nm} đang quá tải hoặc hết lượt. App đã tự thử lại và thử model dự phòng nhưng chưa được: hãy đợi vài phút, hoặc bấm ↻ để chọn model khác.` : ([403, 404].includes(last.status) ? ' → Model này không dùng được với key của bạn: bấm ↻ để tải danh sách model dùng được.' : '');
  throw new Error(`${nm} lỗi ${last.status} (${last.model}): ${last.msg}${hint}`);
}
async function aiListModels(opts) {
  if (!opts.aiKey) throw new Error('Chưa có API key');
  let out = [];
  if (opts.engine === 'gemini') {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': opts.aiKey } });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`Gemini lỗi ${r.status}: ${d.error?.message || ''}`);
    out = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /^models\/gemini/.test(m.name)).map(m => m.name.replace(/^models\//, ''));
  } else {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': opts.aiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`Claude lỗi ${r.status}: ${d.error?.message || ''}`);
    out = (d.data || []).map(m => m.id);
  }
  return out.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}
const stripFence = t => t.trim().replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '').trim();
async function aiOcr(cv, opts) {
  const k = Math.min(1, 2200 / Math.max(cv.width, cv.height));
  const c2 = el('canvas'); c2.width = Math.round(cv.width * k); c2.height = Math.round(cv.height * k);
  c2.getContext('2d').drawImage(cv, 0, 0, c2.width, c2.height);
  const b64 = c2.toDataURL('image/jpeg', 0.88).split(',')[1];
  const md = stripFence(await aiCall(opts, aiPrompt(opts.layout, opts.kind), b64));
  return { md, conf: null };
}
/* Nhờ AI soát lỗi chính tả do OCR nhưng giữ nguyên toàn bộ thẻ định dạng */
async function aiPolish(md, opts) {
  const p = 'Dưới đây là văn bản tiếng Việt do OCR, có thể sai dấu/ký tự. Hãy sửa lỗi OCR (sai dấu, nhầm chữ, dính/tách chữ, số hiệu) dựa trên ngữ cảnh. GIỮ NGUYÊN mọi thẻ HTML/Markdown, cấu trúc đoạn và thứ tự; không thêm, không bớt, không diễn đạt lại. Chỗ không chắc giữ nguyên. Chỉ trả về văn bản đã sửa, không code fence.\n\n' + md;
  return stripFence(await aiCall(opts, p, null));
}


/* ===== Bảng: lưới + ô gộp (dùng cho Word, Excel, Markdown) ===== */
function tableGrid(t) {
  const trs = [...t.querySelectorAll('tr')], occ = [], cells = []; let nc = 0;
  trs.forEach((tr, i) => {
    occ[i] = occ[i] || []; let c = 0;
    [...tr.children].forEach(el => {
      if (!/^T[DH]$/.test(el.tagName)) return;
      while (occ[i][c]) c++;
      const rs = Math.max(1, parseInt(el.getAttribute('rowspan')) || 1), cs = Math.max(1, parseInt(el.getAttribute('colspan')) || 1);
      for (let a = 0; a < rs; a++) { occ[i + a] = occ[i + a] || []; for (let b = 0; b < cs; b++) occ[i + a][c + b] = true; }
      cells.push({ el, r: i, c, rs, cs }); c += cs; nc = Math.max(nc, c);
    });
  });
  return { cells, nc, nr: trs.length };
}
const wideCols = doc => Math.max(0, ...[...doc.querySelectorAll('table:not([data-plain])')].map(t => tableGrid(t).nc));
function runsFromEl(el, sz, bold) {
  const out = [];
  const walk = (n, st) => n.childNodes.forEach(c => {
    if (c.nodeType === 3) { const t = c.textContent.replace(/\s+/g, ' '); if (t.trim() || t === ' ') out.push(new docx.TextRun({ text: t, font: 'Times New Roman', size: sz, bold: st.b, italics: st.i, highlight: st.hl ? 'yellow' : undefined })); }
    else if (c.nodeType === 1) walk(c, { b: st.b || /^(B|STRONG)$/.test(c.tagName), i: st.i || /^(I|EM)$/.test(c.tagName), hl: st.hl || c.tagName === 'MARK' });
  });
  walk(el, { b: bold }); return out;
}
function tableDocx(t, o = {}) {
  const D = docx, g = tableGrid(t); if (!g.cells.length) return [];
  const nc = g.nc, total = o.textW || 9355;
  const sz = o.sz || (nc <= 6 ? 22 : nc <= 9 ? 20 : nc <= 14 ? 18 : nc <= 20 ? 16 : 14);
  let ws = (t.getAttribute('data-widths') || '').split(',').map(Number).filter(Boolean);
  if (ws.length !== nc) { ws = Array(nc).fill(3); g.cells.forEach(c => { if (c.cs === 1) ws[c.c] = Math.max(ws[c.c], Math.min(40, c.el.textContent.trim().length)); }); }
  const sum = ws.reduce((a, b) => a + b, 0), tw = ws.map(x => Math.max(260, Math.round(x / sum * total)));
  const bd = { style: D.BorderStyle.SINGLE, size: 4, color: '000000' };
  const AL = { left: D.AlignmentType.LEFT, center: D.AlignmentType.CENTER, right: D.AlignmentType.RIGHT, justify: D.AlignmentType.JUSTIFIED };
  const rows = [];
  for (let i = 0; i < g.nr; i++) {
    const cs = g.cells.filter(c => c.r === i); if (!cs.length) continue;
    rows.push(new D.TableRow({
      cantSplit: true, tableHeader: i < 3 && cs.every(c => c.el.tagName === 'TH'),
      children: cs.map(c => {
        const th = c.el.tagName === 'TH', al = c.el.getAttribute('align') || (th ? 'center' : '');
        const w = tw.slice(c.c, c.c + c.cs).reduce((a, b) => a + b, 0);
        const paras = c.el.innerHTML.split(/<br\s*\/?>/i).map(hh => { const d = document.createElement('div'); d.innerHTML = hh; return new D.Paragraph({ alignment: AL[al], spacing: { before: 0, after: 0 }, children: runsFromEl(d, sz, th) }); });
        return new D.TableCell({
          columnSpan: c.cs > 1 ? c.cs : undefined, rowSpan: c.rs > 1 ? c.rs : undefined, width: { size: w, type: D.WidthType.DXA },
          verticalAlign: D.VerticalAlign.CENTER, shading: th ? { type: D.ShadingType.CLEAR, fill: 'EDEDED' } : undefined,
          margins: { top: 30, bottom: 30, left: 50, right: 50 }, children: paras,
        });
      }),
    }));
  }
  return [new D.Table({ width: { size: tw.reduce((a, b) => a + b, 0), type: D.WidthType.DXA }, columnWidths: tw, borders: { top: bd, bottom: bd, left: bd, right: bd, insideHorizontal: bd, insideVertical: bd }, rows }), new D.Paragraph({ children: [] })];
}
function tableAoa(t) {
  const g = tableGrid(t), aoa = Array.from({ length: g.nr }, () => Array(g.nc).fill('')), merges = [];
  g.cells.forEach(c => {
    aoa[c.r][c.c] = c.el.textContent.replace(/\s+/g, ' ').trim();
    if (c.rs > 1 || c.cs > 1) merges.push({ s: { r: c.r, c: c.c }, e: { r: Math.min(g.nr - 1, c.r + c.rs - 1), c: c.c + c.cs - 1 } });
  });
  return { aoa, merges };
}
function gridToMd(t, texts) {
  const cells = t.cells.map((c, i) => ({ ...c, text: texts[i] || '' }));
  if (!cells.some(c => c.rs > 1 || c.cs > 1)) {
    const rows = Array.from({ length: t.nr }, () => Array(t.nc).fill(''));
    cells.forEach(c => { rows[c.r0][c.c0] = c.text; }); return rowsToMd(rows);
  }
  const total = t.X[t.X.length - 1] - t.X[0], ws = t.X.slice(1).map((x, i) => Math.max(1, Math.round((x - t.X[i]) / total * 100)));
  let hdr = 0;
  for (let r = 0; r < t.nr && hdr < 4; r++) { if (cells.filter(c => c.r0 === r).some(c => /^[\d.,]+$/.test(c.text.trim()))) break; hdr = r + 1; }
  hdr = Math.max(hdr, 1);
  const rows = [];
  for (let r = 0; r < t.nr; r++) {
    const rc = cells.filter(c => c.r0 === r).sort((a, b) => a.c0 - b.c0), tag = r < hdr ? 'th' : 'td';
    rows.push('<tr>' + rc.map(c => `<${tag}${c.rs > 1 ? ` rowspan="${c.rs}"` : ''}${c.cs > 1 ? ` colspan="${c.cs}"` : ''}>${esc(c.text)}</${tag}>`).join('') + '</tr>');
  }
  return `<table data-widths="${ws.join(',')}">\n${rows.join('\n')}\n</table>`;
}
async function ocrCells(cv, t, opts, done, total) {
  const worker = await getWorker(opts.lang), saved = ocr.onProgress; ocr.onProgress = null;
  await worker.setParameters({ tessedit_pageseg_mode: '6' });
  const g = cv.getContext('2d', { willReadFrequently: true }), texts = [];
  const clean = x => x.replace(/\s*\n\s*/g, ' ').replace(/^[|\[\]{}\\_—\s]+|[|\[\]{}\\_—\s]+$/g, '').trim();
  try {
    for (const [i, c] of t.cells.entries()) {
      saved && saved(0.3 + 0.7 * (done + i) / total);
      const ins = 3, x = Math.round(c.x0 + ins), y = Math.round(c.y0 + ins), w = Math.round(c.x1 - c.x0 - 2 * ins), h = Math.round(c.y1 - c.y0 - 2 * ins);
      if (w < 8 || h < 8) { texts.push(''); continue; }
      const d = g.getImageData(x, y, w, h).data; let ink = 0;
      for (let p = 0; p < d.length; p += 4) if (d[p] < 140) ink++;
      if (ink / (w * h) < 0.003) { texts.push(''); continue; }
      const k = h < 45 ? 3 : h < 90 ? 2 : 1, cc = el('canvas'); cc.width = (w + 20) * k; cc.height = (h + 20) * k;
      const cx = cc.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.fillStyle = '#fff'; cx.fillRect(0, 0, cc.width, cc.height); cx.drawImage(cv, x, y, w, h, 10 * k, 10 * k, w * k, h * k);
      const { data } = await worker.recognize(cc); let tx = clean(data.text || '');
      // ô nghi là số: OCR lại chỉ với bộ chữ số (chính xác hơn nhiều cho cột tiết, hệ số, tổng)
      const mostlyNum = tx && /\d/.test(tx) && tx.length <= 14 && tx.replace(/[\d\s.,|\/()%-]/g, '').length <= 2 && !/^[A-Za-zĐđ]{2,}\d+$/.test(tx);
      if (mostlyNum || (!tx && w < 130)) {
        await worker.setParameters({ tessedit_char_whitelist: '0123456789.,/-%()', tessedit_pageseg_mode: '7' });
        const r2 = await worker.recognize(cc); const t2 = clean(r2.data.text || '').replace(/\s+/g, '');
        await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '6' });
        if (t2 && (mostlyNum || r2.data.confidence > 82)) tx = t2;
      }
      texts.push(tx); cc.width = 0;
    }
  } finally { await worker.setParameters({ tessedit_pageseg_mode: '3' }); ocr.onProgress = saved; }
  return texts;
}
async function canvasPic(cv, maxDim = 1400, q = 0.72) {
  const k = Math.min(1, maxDim / Math.max(cv.width, cv.height)), c = el('canvas'); c.width = Math.round(cv.width * k); c.height = Math.round(cv.height * k);
  c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); c.width = 0;
  return { data: new Uint8Array(await blob.arrayBuffer()), w: Math.round(cv.width * k), h: Math.round(cv.height * k) };
}

/* Chỉ dùng AI để đọc cả ảnh khi: chọn chế độ "AI đọc toàn bộ" hoặc tài liệu viết tay (Tesseract không đọc được). Mặc định: Tesseract đọc, AI chỉ sửa. */
const useAiOcr = opts => opts.engine !== 'tess' && (opts.aiMode === 'full' || opts.kind === 'free');

async function ocrCanvas(cv, opts) {
  if (useAiOcr(opts)) return aiOcr(cv, opts);
  const tables = opts.tables ? TBL.detect(cv) : []; // dò khung bảng trên ảnh gốc (trước khi nhị phân hoá)
  if (opts.pre) preprocess(cv, opts.clean);
  const worker = await getWorker(opts.lang);
  let work = cv;
  if (tables.length) { // làm trắng vùng bảng để OCR phần chữ còn lại; bảng sẽ OCR theo từng ô
    work = el('canvas'); work.width = cv.width; work.height = cv.height;
    const g = work.getContext('2d'); g.drawImage(cv, 0, 0); g.fillStyle = '#fff';
    tables.forEach(t => g.fillRect(t.x0 - 6, t.y0 - 6, t.x1 - t.x0 + 12, t.y1 - t.y0 + 12));
  }
  const { data } = await worker.recognize(work);
  if (work !== cv) work.width = 0;
  const allParas = (data.blocks || []).length ? data.blocks.flatMap(b => b.paragraphs || []) : (data.paragraphs || []);
  const junkBlock = b => { // vùng Tesseract nhận là hình/nhiễu/đường kẻ VÀ nội dung đúng là rác (độ tin cậy thấp / ít chữ cái)
    if (!/IMAGE|NOISE|LINE/i.test(b.blocktype || '')) return false;
    const ws = (b.paragraphs || []).flatMap(p => (p.lines || []).flatMap(l => l.words || [])), txt = ws.map(w => w.text).join('');
    const letters = txt.replace(/[^\p{L}\p{N}]/gu, '').length, mean = ws.length ? ws.reduce((a, w) => a + w.confidence, 0) / ws.length : 0;
    return mean < 55 || letters < txt.length * 0.5 || letters < 6;
  };
  const paras = opts.clean && (data.blocks || []).length ? data.blocks.filter(b => !junkBlock(b)).flatMap(b => b.paragraphs || []) : allParas;
  let lines = ocrLines(paras, opts.clean);
  if (opts.clean) { // van an toàn: nếu lọc làm mất >15% chữ so với không lọc thì coi là lọc quá tay → giữ bản không lọc
    const cnt = ls => ls.reduce((a, l) => a + l.segs.reduce((b, sg) => b + sg.t.replace(/[^\p{L}\p{N}]/gu, '').length, 0), 0);
    const base = ocrLines(allParas, false);
    if (cnt(lines) < cnt(base) * 0.85) lines = base;
  }
  const lo = { rich: opts.layout, keepBr: opts.keepBr, boldCaps: true };
  const lay = ls => ls.length ? layoutToMd(ls, cv.width, lo) : '';
  let md;
  if (!tables.length) {
    if (lines.length) md = lay(lines);
    else md = (data.text || '').split(/\n\s*\n/).map(x => x.split('\n').map(s => s.trim()).filter(Boolean).join(' ')).filter(Boolean).join('\n\n');
  } else {
    const parts = []; let rest = lines, done = 0; const total = tables.reduce((a, t) => a + t.cells.length, 0);
    for (const t of tables) {
      const cy = l => (l.y0 + l.y1) / 2, before = rest.filter(l => cy(l) < t.y0); rest = rest.filter(l => cy(l) >= t.y0);
      parts.push(lay(before));
      parts.push(gridToMd(t, await ocrCells(cv, t, opts, done, total))); done += t.cells.length;
    }
    parts.push(lay(rest)); md = parts.filter(Boolean).join('\n\n');
  }
  return { md, conf: data.confidence, tables: tables.length };
}

/* ================= PDF ================= */
/* ===== PDF có lớp chữ → dòng có toạ độ, đậm/nghiêng (từ tên font) ===== */
async function pdfPageLines(page, tc) {
  try { await page.getOperatorList(); } catch { /* không bắt buộc */ }
  const [vx0, vy0, vx1, vy1] = page.view, W = vx1 - vx0, H = vy1 - vy0, cache = {};
  const fstyle = fn => {
    if (fn in cache) return cache[fn];
    let r = { b: false, i: false };
    try { const nm = page.commonObjs.get(fn)?.name || ''; r = { b: /bold|black|heavy|semibold/i.test(nm), i: /italic|oblique/i.test(nm) }; } catch { }
    return cache[fn] = r;
  };
  const its = tc.items.filter(i => i.str && i.str.trim()).map(i => {
    const sz = Math.hypot(i.transform[0], i.transform[1]) || i.height || 10, st = fstyle(i.fontName);
    return { s: i.str, x: i.transform[4] - vx0, base: H - (i.transform[5] - vy0), w: i.width, sz, b: st.b, i: st.i };
  });
  its.sort((a, b) => a.base - b.base || a.x - b.x);
  const groups = [];
  for (const it of its) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.base - it.base) <= Math.max(g.sz, it.sz) * 0.5) g.items.push(it);
    else groups.push({ base: it.base, sz: it.sz, items: [it] });
  }
  const hist = {}, lines = [];
  for (const g of groups) {
    g.items.sort((a, b) => a.x - b.x);
    const segs = []; let cur = null, end = null;
    for (const it of g.items) {
      const gap = end === null ? 0 : it.x - end;
      if (cur && gap > Math.max(it.sz * 3, W * 0.04)) { segs.push(cur); cur = null; }
      if (!cur) cur = { t: '', x0: it.x, x1: it.x, bc: 0, ic: 0, n: 0, sz: 0 };
      else if (gap > it.sz * 0.2 && !/\s$/.test(cur.t) && !/^\s/.test(it.s)) cur.t += ' ';
      cur.t += it.s; cur.x1 = it.x + it.w; end = cur.x1;
      const n = it.s.length; cur.n += n; cur.bc += it.b ? n : 0; cur.ic += it.i ? n : 0; cur.sz += it.sz * n;
    }
    segs.push(cur);
    segs.forEach(s => {
      s.t = s.t.trim(); s.b = s.bc / s.n > 0.6; s.i = s.ic / s.n > 0.6; s.sz = s.sz / s.n;
      const k = Math.round(s.sz); hist[k] = (hist[k] || 0) + s.t.length;
    });
    const sz = Math.max(...segs.map(s => s.sz));
    lines.push({ y0: g.base - sz * 0.85, y1: g.base + sz * 0.25, segs: segs.filter(s => s.t) });
  }
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
  return { lines: lines.filter(l => l.segs.length), body: top ? +top[0] : 10, W };
}

async function convertPdf(file, ctx) {
  const { opts, progress } = ctx;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const parts = [], pagePics = {}, ocrList = []; let ocrPages = 0, confSum = 0, confN = 0, lowPages = [], nTables = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    const base = (n - 1) / pdf.numPages, span = 1 / pdf.numPages;
    progress(base, `Trang ${n}/${pdf.numPages}`);
    const page = await pdf.getPage(n);
    let md = '';
    if (opts.ocrMode !== 'force') {
      const tc = await page.getTextContent();
      const pl = await pdfPageLines(page, tc);
      md = layoutToMd(pl.lines, pl.W, { rich: opts.layout, keepBr: opts.keepBr, body: pl.body });
    }
    const hasText = md.replace(/<[^>]+>|\s|[#\-]/g, '').length >= 25;
    if (opts.ocrMode === 'force' || (!hasText && opts.ocrMode === 'auto')) {
      progress(base, `Trang ${n}/${pdf.numPages}: đang OCR…`);
      const vp0 = page.getViewport({ scale: 1 });
      const scale = Math.min(4, Math.max(2, 3000 / Math.max(vp0.width, vp0.height)));
      const vp = page.getViewport({ scale });
      const cv = el('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      ocr.onProgress = f => progress(base + span * (0.15 + 0.85 * f), `Trang ${n}/${pdf.numPages}: OCR ${Math.round(f * 100)}%`);
      if (useAiOcr(opts)) progress(base + span * 0.2, `Trang ${n}/${pdf.numPages}: AI đang đọc…`);
      if (ocrPages < 30) pagePics[n] = await canvasPic(cv);
      const r = await ocrCanvas(cv, opts);
      ocr.onProgress = null; cv.width = cv.height = 0;
      md = r.md; ocrPages++; ocrList.push(n); nTables += r.tables || 0;
      if (r.conf != null) { confSum += r.conf; confN++; if (r.conf < 70) lowPages.push(n); }
    }
    page.cleanup();
    parts.push(`<!-- Trang ${n} -->\n\n${md}`.trim());
  }
  let info = `${pdf.numPages} trang`;
  if (ocrPages) info += ` · ${ocrPages} trang OCR` + (confN ? ` · độ tin cậy ~${Math.round(confSum / confN)}%` : ` (${opts.engine === 'gemini' ? 'Gemini' : 'Claude'})`);
  const warn = lowPages.length ? `Trang ${lowPages.join(', ')} OCR kém tin cậy – hãy soát lại (thử bật "Làm sạch ảnh", hoặc dùng chế độ AI).` : '';
  const text = parts.join('\n\n');
  const body = text.replace(/<!--.*?-->/g, '').trim();
  if (nTables) info += ` · ${nTables} bảng`;
  return { pagePics, ocrPages: ocrList, md: text, info, warn: body ? warn : 'Không trích được chữ nào. Thử chế độ "Luôn OCR mọi trang".' };
}

/* ================= Ảnh ================= */
async function convertImage(file, ctx) {
  const { opts, progress } = ctx;
  progress(0.02, 'Đang đọc ảnh…');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const m = Math.max(bmp.width, bmp.height);
  const k = m > 3600 ? 3600 / m : m < 1800 ? Math.min(2, 1800 / m) : 1;
  const cv = el('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
  let pic = null;
  {
    const k2 = Math.min(1, 1600 / m), c3 = el('canvas'); c3.width = Math.round(bmp.width * k2); c3.height = Math.round(bmp.height * k2);
    c3.getContext('2d').drawImage(bmp, 0, 0, c3.width, c3.height);
    const blob = await new Promise(r => c3.toBlob(r, 'image/jpeg', 0.85));
    pic = { data: new Uint8Array(await blob.arrayBuffer()), w: c3.width, h: c3.height };
  }
  bmp.close && bmp.close();
  ocr.onProgress = f => progress(0.1 + 0.9 * f, `OCR ${Math.round(f * 100)}%`);
  if (useAiOcr(opts)) progress(0.2, 'AI đang đọc…');
  const r = await ocrCanvas(cv, opts);
  ocr.onProgress = null; cv.width = cv.height = 0;
  const ai = r.conf == null;
  return {
    md: r.md,
    info: ai ? `Ảnh · OCR bằng AI (${opts.engine === 'gemini' ? 'Gemini' : 'Claude'})` : `Ảnh OCR · độ tin cậy ~${Math.round(r.conf)}%` + (r.tables ? ` · ${r.tables} bảng` : ''),
    warn: !r.md.trim() ? 'Không nhận dạng được chữ.' : (!ai && opts.kind === 'free' ? 'Ghi chú/sơ đồ viết tay: Tesseract không đọc được chữ viết tay – hãy chọn công cụ AI trong Tuỳ chọn.' : (!ai && r.conf < 70 ? 'OCR kém tin cậy – hãy soát lại kỹ (hoặc dùng chế độ AI).' : '')),
    pics: pic ? [pic] : null, isOcr: true,
  };
}
async function convertMany(files, ctx) {
  const parts = [], pics = []; let low = 0, errs = [];
  for (const [i, f] of files.entries()) {
    const sub = (fr, label) => ctx.progress((i + fr) / files.length, `Ảnh ${i + 1}/${files.length}${label ? ': ' + label : ''}`);
    const r = await convertImage(f, { ...ctx, progress: sub });
    parts.push(`<!-- Trang ${i + 1} -->\n\n${r.md}`.trim());
    if (r.warn) low++;
    if (r.pics) pics.push(...r.pics);
  }
  return { isOcr: true, pics: pics.length ? pics : null, md: parts.join('\n\n'), info: `${files.length} ảnh`, warn: low ? `${low} ảnh OCR kém tin cậy hoặc trống – hãy soát lại.` : '' };
}

/* ================= Office & khác ================= */
async function convertDocx(file) {
  const r = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const doc = new DOMParser().parseFromString(r.value.replace(/<img[^>]*>/g, ''), 'text/html');
  doc.querySelectorAll('table').forEach(t => {
    t.querySelectorAll('td,th').forEach(c => {
      c.innerHTML = [...c.querySelectorAll('p')].length ? [...c.querySelectorAll('p')].map(p => p.innerHTML).filter(Boolean).join('<br>') : c.innerHTML;
    });
    const first = t.querySelector('tr');
    if (first) [...first.children].forEach(c => { if (c.tagName === 'TD') { const h = doc.createElement('th'); h.innerHTML = c.innerHTML; c.replaceWith(h); } });
  });
  return { md: htmlToMd(doc.body.innerHTML), info: 'Word (ảnh nhúng được bỏ qua)' };
}
async function convertSheet(file, isCsv) {
  const wb = isCsv ? XLSX.read(await readText(file), { type: 'string', cellDates: true })
                   : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const out = wb.SheetNames.map(name => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
    const t = rowsToMd(rows);
    return isCsv && wb.SheetNames.length === 1 ? t : `## ${name}\n\n${t || '*(trống)*'}`;
  });
  return { md: out.join('\n\n'), info: `${wb.SheetNames.length} sheet` };
}
const xmlDoc = s => new DOMParser().parseFromString(s, 'application/xml');
function dirOf(p) { return p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : ''; }
function resolvePath(base, rel) {
  const parts = (dirOf(base) + rel).split('/'), st = [];
  for (const p of parts) { if (p === '..') st.pop(); else if (p && p !== '.') st.push(p); }
  return st.join('/');
}
async function convertPptx(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const num = s => +s.match(/(\d+)\.xml$/)[1];
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
  const paraText = p => {
    let t = '';
    p.childNodes.forEach(c => {
      if (c.nodeName === 'a:r' || c.nodeName === 'a:fld') t += (c.getElementsByTagName('a:t')[0]?.textContent || '');
      else if (c.nodeName === 'a:br') t += ' ';
    });
    return t.trim();
  };
  const out = [];
  for (const [i, path] of slides.entries()) {
    const doc = xmlDoc(await zip.file(path).async('string'));
    let title = '', body = [];
    const walk = node => {
      for (const c of node.children) {
        const nm = c.nodeName;
        if (nm === 'p:sp') {
          const ph = c.getElementsByTagName('p:ph')[0], type = ph?.getAttribute('type') || '';
          if (['sldNum', 'ftr', 'dt', 'hdr'].includes(type)) continue;
          const ps = [...c.getElementsByTagName('a:p')].map(p => ({
            t: paraText(p), lvl: +(p.getElementsByTagName('a:pPr')[0]?.getAttribute('lvl') || 0),
            bu: !!(p.getElementsByTagName('a:buChar')[0] || p.getElementsByTagName('a:buAutoNum')[0]),
          })).filter(p => p.t);
          if (!ps.length) continue;
          if (type === 'title' || type === 'ctrTitle') title = title || ps.map(p => p.t).join(' ');
          else if (type === 'subTitle') body.push(ps.map(p => p.t).join('\n\n'));
          else body.push(ps.map(p => (type === 'body' || p.bu) ? '  '.repeat(p.lvl) + '- ' + p.t : p.t).join(type === 'body' || ps.every(p => p.bu) ? '\n' : '\n\n'));
        } else if (nm === 'p:graphicFrame') {
          const tbl = c.getElementsByTagName('a:tbl')[0];
          if (tbl) body.push(rowsToMd([...tbl.getElementsByTagName('a:tr')].map(tr => [...tr.getElementsByTagName('a:tc')].map(tc => [...tc.getElementsByTagName('a:p')].map(paraText).filter(Boolean).join(' ')))));
        } else if (nm === 'p:grpSp') walk(c);
      }
    };
    walk(doc.getElementsByTagName('p:spTree')[0] || doc);
    let notes = '';
    const relsF = zip.file(path.replace('slides/', 'slides/_rels/') + '.rels');
    if (relsF) {
      const rels = xmlDoc(await relsF.async('string'));
      const r = [...rels.getElementsByTagName('Relationship')].find(x => /notesSlide/.test(x.getAttribute('Type') || ''));
      const nf = r && zip.file(resolvePath(path, r.getAttribute('Target')));
      if (nf) {
        const nd = xmlDoc(await nf.async('string'));
        notes = [...nd.getElementsByTagName('p:sp')].filter(sp => sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') === 'body')
          .flatMap(sp => [...sp.getElementsByTagName('a:p')].map(paraText)).filter(Boolean).join('\n');
      }
    }
    out.push(`<!-- Slide ${i + 1} -->\n\n## ${title || 'Slide ' + (i + 1)}\n\n${body.join('\n\n')}${notes ? `\n\n> **Ghi chú:** ${notes.replace(/\n/g, '\n> ')}` : ''}`.trim());
  }
  return { md: out.join('\n\n---\n\n'), info: `${slides.length} slide` };
}
async function convertEpub(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const cont = xmlDoc(await zip.file('META-INF/container.xml').async('string'));
  const opfPath = cont.getElementsByTagName('rootfile')[0].getAttribute('full-path');
  const opf = xmlDoc(await zip.file(opfPath).async('string'));
  const man = {};
  [...opf.getElementsByTagName('item')].forEach(i => man[i.getAttribute('id')] = i.getAttribute('href'));
  const title = opf.getElementsByTagName('dc:title')[0]?.textContent || '';
  const parts = [title ? `# ${title}` : ''];
  for (const ir of opf.getElementsByTagName('itemref')) {
    const href = man[ir.getAttribute('idref')]; if (!href) continue;
    const f = zip.file(decodeURIComponent(resolvePath(opfPath, href))); if (!f) continue;
    parts.push(htmlToMd(await f.async('string')));
  }
  return { md: parts.filter(Boolean).join('\n\n'), info: 'EPUB' };
}
async function convertZip(file, ctx) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(n)).slice(0, 200);
  const out = [], skipped = [];
  for (const [i, n] of names.entries()) {
    ctx.progress(i / names.length, `${i + 1}/${names.length}: ${n}`);
    const f = new File([await zip.files[n].async('blob')], n.split('/').pop());
    try {
      const r = await convertFile(f, { ...ctx, depth: (ctx.depth || 0) + 1, progress: () => {} });
      out.push(`# ${n}\n\n${r.md}`);
    } catch { skipped.push(n); }
  }
  return { md: out.join('\n\n---\n\n'), info: `${out.length} file`, warn: skipped.length ? `Bỏ qua ${skipped.length} file không hỗ trợ: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}` : '' };
}
async function convertXml(file, ext) {
  const txt = await readText(file);
  const doc = new DOMParser().parseFromString(txt, 'application/xml');
  const tag = n => doc.getElementsByTagName(n);
  const items = [...tag('item'), ...tag('entry')];
  if (items.length && (tag('rss')[0] || tag('feed')[0])) {
    const g = (it, n) => it.getElementsByTagName(n)[0];
    const head = (g(doc, 'title')?.textContent || '').trim();
    const md = items.map(it => {
      const t = g(it, 'title')?.textContent?.trim() || '(không tiêu đề)';
      const l = g(it, 'link'); const link = l?.getAttribute('href') || l?.textContent?.trim() || '';
      const d = g(it, 'description')?.textContent || g(it, 'content')?.textContent || g(it, 'summary')?.textContent || '';
      return `## ${link ? `[${t}](${link})` : t}\n\n${d ? htmlToMd(d) : ''}`;
    }).join('\n\n');
    return { md: (head ? `# ${head}\n\n` : '') + md, info: `${items.length} mục` };
  }
  return { md: '```xml\n' + txt.trim() + '\n```', info: 'XML' };
}
async function convertIpynb(file) {
  const nb = JSON.parse(await readText(file));
  const src = c => Array.isArray(c) ? c.join('') : (c || '');
  const lang = nb.metadata?.language_info?.name || 'python';
  const md = (nb.cells || []).map(c => {
    if (c.cell_type === 'markdown') return src(c.source);
    if (c.cell_type === 'code') {
      const outs = (c.outputs || []).map(o => src(o.text) || src(o.data?.['text/plain'])).filter(Boolean).join('\n');
      return '```' + lang + '\n' + src(c.source) + '\n```' + (outs ? '\n\nKết quả:\n\n```\n' + outs + '\n```' : '');
    }
    return src(c.source);
  }).join('\n\n');
  return { md, info: 'Notebook' };
}

/* ================= Dispatcher ================= */
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];
async function convertFile(file, ctx) {
  const ext = extOf(file.name);
  if (ext === 'pdf') return convertPdf(file, ctx);
  if (IMG_EXT.includes(ext) || (!ext && file.type.startsWith('image/'))) return convertImage(file, ctx);
  if (ext === 'docx') return convertDocx(file);
  if (['xlsx', 'xlsm', 'xls', 'ods'].includes(ext)) return convertSheet(file, false);
  if (['csv', 'tsv'].includes(ext)) return convertSheet(file, true);
  if (ext === 'pptx') return convertPptx(file);
  if (ext === 'epub') return convertEpub(file);
  if (ext === 'zip') { if ((ctx.depth || 0) > 1) throw new Error('zip lồng quá sâu'); return convertZip(file, ctx); }
  if (['html', 'htm', 'xhtml'].includes(ext)) return { md: htmlToMd(await readText(file)), info: 'HTML' };
  if (['xml', 'rss', 'atom'].includes(ext)) return convertXml(file, ext);
  if (ext === 'ipynb') return convertIpynb(file);
  if (ext === 'json') { const t = await readText(file); let p = t; try { p = JSON.stringify(JSON.parse(t), null, 2); } catch { } return { md: '```json\n' + p + '\n```', info: 'JSON' }; }
  if (['txt', 'md', 'markdown', 'log', 'text', 'rst', 'yml', 'yaml', 'ini'].includes(ext)) return { md: (await readText(file)).trim(), info: 'Văn bản' };
  if (['doc', 'ppt', 'rtf'].includes(ext)) throw new Error(`Định dạng .${ext} cũ chưa đọc được trực tiếp. Hãy mở bằng Word/PowerPoint rồi "Lưu thành" .docx/.pptx (hoặc xuất PDF) và thử lại.`);
  throw new Error(`Chưa hỗ trợ định dạng .${ext || '?'}`);
}

/* ================= Xuất file ================= */
function sanitize(doc) {
  doc.querySelectorAll('script,iframe,object,embed,link,meta,base,form').forEach(n => n.remove());
  doc.querySelectorAll('*').forEach(n => {
    [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name) || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    });
  });
}
function mdToDom(md) {
  const doc = new DOMParser().parseFromString(marked.parse(md, { gfm: true }), 'text/html');
  sanitize(doc); return doc;
}
const HTML_CSS = `body{font:16px/1.6 "Times New Roman",serif;max-width:820px;margin:24px auto;padding:0 16px;color:#111}
table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #999;padding:4px 8px;vertical-align:top}th{background:#f0f0f0}
table[data-plain]{width:100%}table[data-plain] td{border:0}[data-indent]{text-indent:1.27cm}
pre,code{background:#f4f4f4;font-family:Consolas,monospace}pre{padding:10px;overflow:auto}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:12px;color:#444}`;
function htmlString(md, title) {
  const doc = mdToDom(md);
  return `<!doctype html>\n<html lang="vi"><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>${HTML_CSS}</style></head><body>\n${doc.body.innerHTML}\n</body></html>`;
}
function domToText(root) {
  const walk = (n, inPre) => {
    if (n.nodeType === 3) return inPre ? n.textContent : n.textContent.replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const tag = n.tagName, kids = () => [...n.childNodes].map(c => walk(c, inPre || tag === 'PRE')).join('');
    if (/^H[1-6]$|^P$|^BLOCKQUOTE$/.test(tag)) return '\n\n' + kids().trim() + '\n\n';
    if (tag === 'PRE') return '\n\n' + n.textContent.replace(/\n$/, '') + '\n\n';
    if (tag === 'UL' || tag === 'OL') return '\n' + [...n.children].map((li, i) => (tag === 'OL' ? `${i + 1}. ` : '• ') + walk(li, false).trim().replace(/\n+/g, '\n   ')).join('\n') + '\n';
    if (tag === 'LI') return kids();
    if (tag === 'TR') return [...n.children].map(c => c.textContent.trim().replace(/\s+/g, ' ')).join('\t') + '\n';
    if (tag === 'TABLE') return '\n\n' + [...n.querySelectorAll('tr')].map(tr => walk(tr, false)).join('') + '\n';
    if (tag === 'BR') return '\n';
    if (tag === 'HR') return '\n\n----\n\n';
    return kids();
  };
  return walk(root, false).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function domTables(doc) {
  return [...doc.querySelectorAll('table')].map(t => [...t.querySelectorAll('tr')].map(tr => [...tr.children].map(c => c.textContent.trim())));
}

function picParas(pics) {
  const D = docx;
  return [new D.Paragraph({ children: [new D.PageBreak()] }), ...pics.map(p => {
    const k = Math.min(1, 600 / p.w, 880 / p.h);
    return new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.ImageRun({ data: p.data, transformation: { width: Math.round(p.w * k), height: Math.round(p.h * k) }, type: 'jpg' })] });
  })];
}
function buildDocx(md, pics) {
  const D = docx, doc = mdToDom(md);
  const LAND = wideCols(doc) >= 9, TEXTW = LAND ? 15704 : 9355;
  const FONT = 'Times New Roman', numConfigs = []; let olCount = 0;
  const run = (text, st) => new D.TextRun({
    text, bold: st.b, italics: st.i, strike: st.s, font: st.code ? 'Consolas' : undefined,
    color: st.link ? '0563C1' : undefined, underline: st.link ? {} : undefined, highlight: st.hl ? 'yellow' : undefined,
    shading: st.code ? { type: D.ShadingType.CLEAR, fill: 'EEEEEE' } : undefined,
  });
  const inline = (node, st = {}) => {
    const out = [];
    node.childNodes.forEach(c => {
      if (c.nodeType === 3) { const t = c.textContent.replace(/\s+/g, ' '); if (t) out.push(run(t, st)); }
      else if (c.nodeType === 1) {
        const tag = c.tagName;
        if (tag === 'BR') out.push(new D.TextRun({ break: 1 }));
        else if (tag === 'IMG' || tag === 'UL' || tag === 'OL' || tag === 'TABLE') { /* bỏ */ }
        else if (tag === 'A') {
          const kids = inline(c, { ...st, link: true }), href = c.getAttribute('href') || '';
          if (/^(https?:|mailto:)/i.test(href) && kids.length) out.push(new D.ExternalHyperlink({ children: kids, link: href }));
          else out.push(...kids);
        } else out.push(...inline(c, {
          ...st, b: st.b || tag === 'STRONG' || tag === 'B', i: st.i || tag === 'EM' || tag === 'I',
          s: st.s || tag === 'DEL' || tag === 'S', code: st.code || tag === 'CODE', hl: st.hl || tag === 'MARK',
        }));
      }
    });
    return out;
  };
  const trimRuns = r => r; // giữ nguyên
  const ALIGN = { left: D.AlignmentType.LEFT, center: D.AlignmentType.CENTER, right: D.AlignmentType.RIGHT, justify: D.AlignmentType.JUSTIFIED };
  const para = (node, extra = {}) => new D.Paragraph({
    children: inline(node), spacing: { after: 120 }, alignment: ALIGN[node.getAttribute('align')],
    ...extra, indent: { ...(extra.indent || {}), ...(node.hasAttribute('data-indent') ? { firstLine: 720 } : {}) },
  });
  const liRuns = li => {
    const out = [];
    li.childNodes.forEach(c => {
      if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) return;
      if (c.nodeType === 1 && c.tagName === 'P') { if (out.length) out.push(new D.TextRun({ break: 1 })); out.push(...inline(c)); }
      else { const w = doc.createElement('span'); w.append(c.cloneNode(true)); out.push(...inline(w)); }
    });
    return out;
  };
  const list = (ul, lvl) => {
    const ordered = ul.tagName === 'OL', ref = ordered ? 'ol' + (++olCount) : 'bullets', out = [];
    if (ordered) numConfigs.push({ reference: ref, levels: [{ level: 0, start: parseInt(ul.getAttribute('start')) || 1, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] });
    [...ul.children].filter(li => li.tagName === 'LI').forEach(li => {
      out.push(new D.Paragraph({ children: liRuns(li), numbering: { reference: ref, level: 0 }, indent: { left: 720 + 360 * lvl, hanging: 360 }, spacing: { after: 60 } }));
      li.childNodes.forEach(c => { if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) out.push(...list(c, lvl + 1)); });
    });
    return out;
  };
  const border = { style: D.BorderStyle.SINGLE, size: 4, color: '999999' };
  const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const table = t => {
    if (!t.hasAttribute('data-plain')) return tableDocx(t, { textW: TEXTW });
    const rows = [...t.querySelectorAll('tr')]; if (!rows.length) return [];
    const plain = t.hasAttribute('data-plain');
    const n = Math.max(...rows.map(r => r.children.length));
    const ws = (t.getAttribute('data-widths') || '').split(',').map(Number).filter(Boolean);
    const bd = plain ? none : border;
    return [new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      borders: { top: bd, bottom: bd, left: bd, right: bd, insideHorizontal: bd, insideVertical: bd },
      rows: rows.map(tr => new D.TableRow({
        tableHeader: !plain && !!tr.querySelector('th'),
        children: [...tr.children].map((c, i) => new D.TableCell({
          width: { size: plain && ws.length === n ? ws[i] : Math.floor(100 / n), type: D.WidthType.PERCENTAGE },
          shading: c.tagName === 'TH' ? { type: D.ShadingType.CLEAR, fill: 'EDEDED' } : undefined,
          borders: plain ? { top: none, bottom: none, left: none, right: none } : undefined,
          margins: { top: plain ? 0 : 40, bottom: plain ? 0 : 40, left: 80, right: 80 },
          children: [new D.Paragraph({ children: inline(c, c.tagName === 'TH' ? { b: true } : {}), alignment: ALIGN[c.getAttribute('align')], spacing: plain ? { after: 0 } : undefined })],
        })),
      })),
    }), new D.Paragraph({ children: [] })];
  };
  const HL = [null, D.HeadingLevel.HEADING_1, D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_3, D.HeadingLevel.HEADING_4, D.HeadingLevel.HEADING_5, D.HeadingLevel.HEADING_6];
  const blocks = (parent, ind = 0) => {
    const out = [];
    parent.childNodes.forEach(c => {
      if (c.nodeType === 8) { const m = c.textContent.match(/^\s*Trang\s+(\d+)/); if (m && +m[1] > 1) out.push(new D.Paragraph({ children: [new D.PageBreak()] })); return; }
      if (c.nodeType === 3) { if (c.textContent.trim()) out.push(new D.Paragraph({ children: [run(c.textContent.trim(), {})], indent: { left: ind } })); return; }
      if (c.nodeType !== 1) return;
      const tag = c.tagName;
      if (/^H[1-6]$/.test(tag)) out.push(new D.Paragraph({ heading: HL[+tag[1]], children: inline(c), indent: { left: ind } }));
      else if (tag === 'P') out.push(para(c, { indent: { left: ind } }));
      else if (tag === 'UL' || tag === 'OL') out.push(...list(c, 0));
      else if (tag === 'TABLE') out.push(...table(c));
      else if (tag === 'PRE') c.textContent.replace(/\n$/, '').split('\n').forEach(l => out.push(new D.Paragraph({ children: [new D.TextRun({ text: l, font: 'Consolas', size: 20 })], spacing: { after: 0 }, shading: { type: D.ShadingType.CLEAR, fill: 'F2F2F2' } })));
      else if (tag === 'BLOCKQUOTE') out.push(...blocks(c, ind + 540));
      else if (tag === 'HR') out.push(new D.Paragraph({ border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: '888888', space: 1 } }, children: [] }));
      else out.push(...blocks(c, ind));
    });
    return out;
  };
  const children = blocks(doc.body);
  if (pics && pics.length) children.push(...picParas(pics));
  const hs = (id, size) => ({ id, name: id.replace('Heading', 'Heading '), basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size, bold: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } });
  return new D.Document({
    creator: 'DocConverter',
    styles: {
      default: { document: { run: { font: FONT, size: 26 }, paragraph: { spacing: { line: 300 } } } },
      paragraphStyles: [hs('Heading1', 32), hs('Heading2', 30), hs('Heading3', 28), hs('Heading4', 26), hs('Heading5', 26), hs('Heading6', 26)],
    },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }, ...numConfigs] },
    sections: [{ properties: { page: LAND ? { size: { width: 11906, height: 16838, orientation: D.PageOrientation.LANDSCAPE }, margin: { top: 567, bottom: 567, left: 567, right: 567 } } : { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } } }, children: children.length ? children : [new D.Paragraph('')] }],
  });
}

const FORMATS = {
  md:   { ext: 'md',   mime: 'text/markdown' },
  mdraw: { ext: 'md',  mime: 'text/markdown' },
  txt:  { ext: 'txt',  mime: 'text/plain' },
  html: { ext: 'html', mime: 'text/html' },
  json: { ext: 'json', mime: 'application/json' },
  docx30: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  docx: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv:  { ext: 'csv',  mime: 'text/csv' },
};
async function exportBlob(md, fmt, name, pics) {
  const F = FORMATS[fmt];
  const mk = (data, mime = F.mime) => new Blob([data], { type: mime + ';charset=utf-8' });
  if (fmt === 'md') return mk(md);
  if (fmt === 'mdraw') return mk(toPlainMd(md));
  if (fmt === 'html') return mk(htmlString(md, name));
  if (fmt === 'txt') return mk(domToText(mdToDom(md).body));
  if (fmt === 'json') return mk(JSON.stringify({ name, convertedAt: new Date().toISOString(), markdown: md, text: domToText(mdToDom(md).body) }, null, 2));
  if (fmt === 'docx') return docx.Packer.toBlob(buildDocx(md, pics));
  if (fmt === 'docx30') return docx.Packer.toBlob(ND.build(md, ND.PRESETS[$('#ndSz').value] || ND.PRESETS['27'], pics));
  const dom = mdToDom(md);
  let tl = [...dom.querySelectorAll('table:not([data-plain])')]; if (!tl.length) tl = [...dom.querySelectorAll('table')];
  let tables = tl.map(tableAoa);
  if (!tables.length) tables = [{ aoa: domToText(dom.body).split('\n').map(l => [l]), merges: [] }];
  if (fmt === 'csv') {
    const csv = tables.map(t => XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(t.aoa))).join('\n\n');
    return new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  }
  const wb = XLSX.utils.book_new();
  tables.forEach((t, i) => { const ws = XLSX.utils.aoa_to_sheet(t.aoa); if (t.merges.length) ws['!merges'] = t.merges; XLSX.utils.book_append_sheet(wb, ws, 'Bảng ' + (i + 1)); });
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: F.mime });
}
function saveBlob(blob, filename) {
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}


/* ===== Chế độ xem/sửa "dễ đọc": thẻ HTML bố cục <-> ký hiệu ngắn gọn (chuyển đổi hai chiều) ===== */
const unesc = x => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const h2 = x => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>').replace(/\*([^*]+?)\*/g, '<i>$1</i>');
const inl2 = x => unesc(x.replace(/<\/?b>/g, '**').replace(/<\/?i>/g, '*'));
function toEdit(md) {
  const mk = { left: '<', center: '^', right: '>' };
  md = md.replace(/<table data-plain="1" data-widths="([\d,]+)"><tbody>([\s\S]*?)<\/tbody><\/table>/g, (m, w, body) => {
    const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<td align="(\w+)">([\s\S]*?)<\/td>/g)].map(c => (mk[c[1]] || '<') + inl2(c[2].replace(/<br\s*\/?>/g, ' ↵ '))));
    return '{bảng ' + w + '}\n' + rows.map(r => r.join(' ¦ ')).join('\n') + '\n{hết bảng}';
  });
  return md.replace(/<p((?: align="\w+")?(?: data-indent="1")?)>([\s\S]*?)<\/p>/g, (m, attrs, inner) => {
    const al = (attrs.match(/align="(\w+)"/) || [])[1], tk = [];
    if (al) tk.push({ center: 'giữa', right: 'phải', justify: 'đều', left: 'trái' }[al] || 'trái');
    if (/data-indent/.test(attrs)) tk.push('thụt');
    if (!tk.length) tk.push('p');
    return tk.map(t => `{${t}}`).join('') + ' ' + inl2(inner).replace(/<br\s*\/?>/g, '\n');
  });
}
function fromEdit(t) {
  const al = { '<': 'left', '^': 'center', '>': 'right' };
  t = t.replace(/\{bảng ([\d,]+)\}\n([\s\S]*?)\n\{hết bảng\}/g, (m, w, body) =>
    `<table data-plain="1" data-widths="${w}"><tbody>` + body.split('\n').map(r => '<tr>' + r.split(' ¦ ').map(c => {
      const a = al[c[0]]; return `<td align="${a || 'left'}">${h2(a ? c.slice(1) : c).replace(/ ↵ /g, '<br>')}</td>`;
    }).join('') + '</tr>').join('') + '</tbody></table>');
  const AL = { 'giữa': 'center', 'phải': 'right', 'đều': 'justify', 'trái': 'left' };
  return t.split(/\n{2,}/).map(b => {
    const m = b.match(/^((?:\{(?:giữa|phải|đều|trái|thụt|p)\})+)[ \t]?([\s\S]*)$/); if (!m) return b;
    const tk = [...m[1].matchAll(/\{(.+?)\}/g)].map(x => x[1]);
    const a = tk.map(x => AL[x]).find(Boolean);
    return `<p${a ? ` align="${a}"` : ''}${tk.includes('thụt') ? ' data-indent="1"' : ''}>${m[2].split('\n').map(h2).join('<br>')}</p>`;
  }).join('\n\n');
}

function toPlainMd(md) { // Markdown thuần: bỏ thẻ HTML bố cục, bảng đầu trang → các đoạn theo từng cột
  md = md.replace(/<table(?![^>]*data-plain)[\s\S]*?<\/table>/g, m => '\n\n' + rowsToMd(tableAoa(new DOMParser().parseFromString(m, 'text/html').querySelector('table')).aoa) + '\n\n');
  let e = toEdit(md);
  e = e.replace(/\{bảng [\d,]+\}\n([\s\S]*?)\n\{hết bảng\}/g, (m, body) => {
    const rows = body.split('\n').map(r => r.split(' ¦ ').map(c => c.replace(/^[<^>]/, '').replace(/ ↵ /g, '  \n').trim()));
    const nc = Math.max(...rows.map(r => r.length)), out = [];
    for (let k = 0; k < nc; k++) { const ls = rows.map(r => r[k]).filter(Boolean); if (ls.length) out.push(ls.join('  \n')); }
    return out.join('\n\n');
  });
  e = e.replace(/^(?:\{(?:giữa|phải|đều|trái|thụt|p)\})+ ?/gm, '').replace(/<mark>([\s\S]*?)<\/mark>/g, '==$1==');
  let pg = 0; e = e.replace(/<!--\s*Trang\s+\d+\s*-->\n*/g, () => (pg++ ? '\n---\n\n' : ''));
  return e.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* ================= UI ================= */
const items = []; let running = false, uid = 0;
const getOpts = () => ({
  ocrMode: $('#ocrMode').value, lang: $('#lang').value, pre: $('#pre').checked, keepBr: $('#keepBr').checked,
  tables: $('#tables').checked, aiMode: $('#aiMode').value, clean: $('#clean').checked, kind: $('#docKind').value, embed: $('#embed').checked, engine: $('#engine').value, layout: $('#layout').checked, aiKey: $('#aiKey').value.trim(), aiModel: $('#aiModel').value.trim(),
});
const curFmt = () => $('#fmt').value;

const isImg = f => IMG_EXT.includes(extOf(f.name)) || (f.type || '').startsWith('image/');
function makeItem(file, files, focus) {
  const it = { id: ++uid, file, files, srcFiles: files || (isImg(file) ? [file] : null), focus, status: 'wait', md: '', info: '', warn: '', error: '' };
  it.node = renderItem(it); items.push(it); $('#list').append(it.node);
}
function addFiles(files, o = {}) {
  files = [...files];
  const imgs = files.filter(isImg).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if ((o.merge || $('#merge').checked) && imgs.length >= 2) {
    makeItem({ name: o.name || `Gộp ${imgs.length} ảnh`, size: imgs.reduce((t, f) => t + f.size, 0) }, imgs, o.focus);
    files = files.filter(f => !isImg(f));
  }
  files.forEach(f => makeItem(f, null, o.focus));
  $('#bar').classList.remove('hidden');
  runQueue();
}

/* ===== Khung "Văn bản": chỉ chữ thuần; mọi sửa đổi được ánh xạ ngược vào bản có định dạng (it.md) ===== */
function plainMap(md) {
  let out = '', i = 0, inTable = 0, pipeLine = false, atLineStart = true; const map = [], n = md.length;
  const push = (ch, src, len) => { if (ch === '\n' && (out === '' || out.endsWith('\n\n'))) return; out += ch; map.push([src, len]); }; // gọn: tối đa 1 dòng trống liên tiếp
  while (i < n) {
    const c = md[i];
    if (c === '<') {
      if (md.startsWith('<!--', i)) { const e = md.indexOf('-->', i); i = e < 0 ? n : e + 3; continue; }
      const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/.exec(md.slice(i, i + 400));
      if (m) {
        const closing = !!m[1], tag = m[2].toLowerCase(), end = i + m[0].length;
        if (tag === 'table') inTable += closing ? -1 : 1;
        if (tag === 'br') push(pipeLine ? ' ' : '\n', -1, 0);
        else if (closing && (tag === 'td' || tag === 'th')) { if (!/^\s*<\/tr>/.test(md.slice(end, end + 12))) push('\t', -1, 0); }
        else if (closing && tag === 'tr') push('\n', -1, 0);
        i = end; continue;
      }
    }
    if (c === '&') { const m = /^&(amp|lt|gt|nbsp);/.exec(md.slice(i, i + 7)); if (m) { push({ amp: '&', lt: '<', gt: '>', nbsp: ' ' }[m[1]], i, m[0].length); i += m[0].length; atLineStart = false; continue; } }
    if (inTable && (c === '\n' || c === '\r')) { i++; continue; }
    if (c === '\n') { push('\n', i, 1); i++; atLineStart = true; pipeLine = false; continue; }
    if (atLineStart) {
      const rest = md.slice(i, i + 200); let m;
      if ((m = /^#{1,6}[ \t]+/.exec(rest))) { i += m[0].length; atLineStart = false; continue; }
      if (rest[0] === '|') {
        const le = md.indexOf('\n', i), line = md.slice(i, le < 0 ? n : le);
        if (/^\|[\s|:\-]+\|?\s*$/.test(line) && /-/.test(line)) { i += line.length + (le < 0 ? 0 : 1); continue; }
        pipeLine = true;
      }
    }
    atLineStart = false;
    if (c === '*' && md[i + 1] === '*') { i += 2; continue; }
    if (pipeLine && c === '|') {
      while (out.endsWith(' ') && map[map.length - 1][0] >= 0) { out = out.slice(0, -1); map.pop(); }
      const lead = out === '' || out.endsWith('\n'), tail = /^\|\s*(\n|$)/.test(md.slice(i, i + 60));
      if (!lead && !tail) push('\t', -1, 0);
      i++; while (md[i] === ' ') i++; continue;
    }
    if (pipeLine && c === '\\' && md[i + 1] === '|') { push('|', i, 2); i += 2; continue; }
    push(c, i, 1); i++;
  }
  return { text: out, map };
}
function applyPlainEdit(md, oldTxt, map, newTxt) {
  let a = 0; const L = Math.min(oldTxt.length, newTxt.length);
  while (a < L && oldTxt[a] === newTxt[a]) a++;
  let eo = oldTxt.length, en = newTxt.length;
  while (eo > a && en > a && oldTxt[eo - 1] === newTxt[en - 1]) { eo--; en--; }
  const ins = newTxt.slice(a, en), real = [];
  for (let k = a; k < eo; k++) if (map[k][0] >= 0) real.push(k);
  let start, end;
  if (real.length) { start = map[real[0]][0]; const l = map[real[real.length - 1]]; end = l[0] + l[1]; }
  else {
    const prev = a > 0 ? map[a - 1] : null, next = a < map.length ? map[a] : null, pc = a > 0 ? oldTxt[a - 1] : '\n';
    if (prev && prev[0] >= 0 && pc !== '\n' && pc !== '\t') start = end = prev[0] + prev[1];
    else if (next && next[0] >= 0) start = end = next[0];
    else if (prev && prev[0] >= 0) start = end = prev[0] + prev[1];
    else return eo > a ? md : null;
  }
  const cut = md.slice(start, end);
  if (/<\/?(t[dhr]|table|tbody|thead)\b|<!--/i.test(cut) || (/\n/.test(cut) && /^\s*\|/m.test(cut))) return null; // không sửa xuyên qua ô bảng
  let rep = ins.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (/\n/.test(rep)) rep = rep.replace(/\n+/g, md.lastIndexOf('<p', start) > md.lastIndexOf('</p>', start) ? '<br>' : '\n\n');
  return md.slice(0, start) + rep + md.slice(end);
}
function refreshTa(it) { it.plain = plainMap(it.md); it.ui.ta.value = it.plain.text; it.ui.taMd.value = toEdit(it.md); }
function onPlainInput(it) {
  const ta = it.ui.ta, caret = ta.selectionStart, old = it.plain;
  const nm = applyPlainEdit(it.md, old.text, old.map, ta.value);
  if (nm === null) { ta.value = old.text; try { ta.setSelectionRange(caret, caret); } catch { } flash(it, 'Không sửa xuyên qua nhiều ô bảng được – hãy sửa trong từng ô.'); return; }
  it.md = nm; it.plain = plainMap(nm);
  if (it.plain.text !== ta.value) { ta.value = it.plain.text; try { ta.setSelectionRange(caret, caret); } catch { } }
  it.ui.taMd.value = toEdit(it.md); refreshPreview(it); showNd(it);
}
function renderItem(it) {
  const ta = el('textarea', { class: 'src', spellcheck: 'false' });
  const taMd = el('textarea', { class: 'src hidden', spellcheck: 'false' });
  ta.addEventListener('input', () => onPlainInput(it));
  taMd.addEventListener('input', () => { it.md = fromEdit(taMd.value); it.plain = plainMap(it.md); ta.value = it.plain.text; refreshPreview(it); showNd(it); });
  const pv = el('iframe', { class: 'pv hidden', sandbox: '' });
  const tabTx = el('button', { onclick: () => tab('text') }, 'Văn bản (sửa được)');
  const tabPv = el('button', { class: 'on', onclick: () => tab('pv') }, 'Xem trước');
  const tabAdv = el('button', { onclick: () => tab('md') }, 'Markdown + bố cục');
  const tab = name => {
    tabTx.classList.toggle('on', name === 'text'); tabPv.classList.toggle('on', name === 'pv'); tabAdv.classList.toggle('on', name === 'md');
    ta.classList.toggle('hidden', name !== 'text'); taMd.classList.toggle('hidden', name !== 'md'); pv.classList.toggle('hidden', name !== 'pv');
    it.ui.hint.textContent = name === 'md' ? 'Ký hiệu bố cục: {giữa} {phải} {đều} = căn lề · {thụt} = thụt đầu dòng · {p} = đoạn nguyên văn · **đậm** · *nghiêng* · {bảng…} = bảng đầu trang không viền (ô bắt đầu bằng < ^ > = căn trái/giữa/phải, ¦ ngăn cột).' : 'Chỉ chữ thuần – định dạng (căn lề, bảng, in đậm…) vẫn được giữ khi tải Word/Markdown. Không sửa xuyên qua nhiều ô bảng; cần xem ký hiệu bố cục thì mở tab "Markdown + bố cục".';
    if (name === 'pv') refreshPreview(it, true);
  };
  it.ui = {
    badge: el('span', { class: 'badge' }, 'Chờ'),
    bar: el('i'), msg: el('div', { class: 'msg' }),
    prog: el('div', { class: 'prog' }),
    ta, taMd, pv, tab,
    dl30: el('button', { class: 'primary', onclick: () => download(it, 'docx30') }, '⬇ Word chuẩn thể thức'),
    dlRaw: el('button', { class: 'primary', onclick: () => download(it, 'docx') }, '⬇ Word gốc (raw)'),
    dl: el('button', { onclick: () => download(it, curFmt()) }, 'Tải xuống'),
    cpTxt: el('button', { class: 'primary copybtn', title: 'Sao chép toàn bộ văn bản (đúng như đang hiển thị ở tab Văn bản)', onclick: async e => { const b = e.currentTarget, old = b.textContent; await copyText(it.plain ? it.plain.text : plainMap(it.md).text); b.textContent = '✓ Đã sao chép'; setTimeout(() => { b.textContent = old; }, 1600); } }, '📋 Sao chép văn bản'),
    dlMdRaw: el('button', { class: 'dl', title: 'Markdown sạch, không có thẻ HTML', onclick: () => download(it, 'mdraw') }, '⬇ Tải .md thuần'),
    dlMdFmt: el('button', { class: 'dl', title: 'Markdown có thẻ HTML giữ bố cục (căn giữa, bảng, đậm…)', onclick: () => download(it, 'md') }, '⬇ Tải .md có format'),
    result: el('div', { class: 'hidden' }),
    nd: el('div', { class: 'msg nd hidden' }),
    dlSum: el('button', { onclick: () => makeSummary(it) }, '🎨 Tóm tắt trực quan'),
    dlRev: el('button', { onclick: () => reviewIt(it) }, '🔍 AI soát chỗ có thể lỗi'),
    dlFix: el('button', { onclick: () => polish(it) }, '✨ AI sửa lỗi OCR'),
    dlImg: el('button', { title: 'Lưu ảnh gốc vào thư viện ảnh (điện thoại) hoặc tải về (máy tính)', onclick: () => saveToPhotos(it.srcFiles) }, '💾 Lưu ảnh gốc'),
    review: el('div', { class: 'hidden' }),
    sum: el('div', { class: 'hidden' }),
    hint: el('div', { class: 'msg' }, 'Chỉ chữ thuần – định dạng (căn lề, bảng, in đậm…) vẫn được giữ khi tải Word/Markdown. Không sửa xuyên qua nhiều ô bảng; cần xem ký hiệu bố cục thì mở tab "Markdown + bố cục".'),
  };
  it.ui.prog.append(it.ui.bar);
  const quickPanel = el('section', { class: 'quick-panel quick-export' },
    el('h3', {}, '↓ Tải nhanh'),
    el('div', { class: 'quick-actions' }, it.ui.cpTxt, it.ui.dlMdRaw, it.ui.dlMdFmt));
  const viewPanel = el('section', { class: 'quick-panel quick-view' },
    el('h3', {}, '◉ Chế độ xem'),
    el('div', { class: 'tabs view-tabs' }, tabTx, tabPv, tabAdv));
  const documentPanel = el('main', { class: 'document-panel' },
    el('div', { class: 'document-canvas' }, ta, taMd, pv), it.ui.hint, it.ui.nd, it.ui.review, it.ui.sum);
  const sidebar = el('aside', { class: 'action-sidebar' },
    el('section', { class: 'side-section ai-section' },
      el('h3', {}, '✨ Xử lý & AI'),
      el('div', { class: 'side-actions' }, it.ui.dlSum, it.ui.dlFix, it.ui.dlRev)),
    el('section', { class: 'side-section manage-section' },
      el('h3', {}, '⚙ Chỉnh sửa & quản lý'),
      el('div', { class: 'side-actions' },
        ...(it.srcFiles ? [it.ui.dlImg] : []),
        el('button', { onclick: () => { it.status = 'wait'; it.error = ''; sync(it); runQueue(); } }, '↻ Chuyển lại'),
        el('button', { class: 'danger', onclick: () => { items.splice(items.indexOf(it), 1); it.node.remove(); summary(); } }, '⌫ Xoá'))));
  const exportPanel = el('section', { class: 'export-panel' },
    el('h3', {}, '↓ Xuất file'),
    el('div', { class: 'export-actions' },
      it.ui.dl30, it.ui.dlRaw, it.ui.dl,
      el('button', { onclick: async () => { await copyText(toPlainMd(it.md)); flash(it, 'Đã sao chép Markdown thuần'); } }, '▢ Sao chép Markdown')));
  it.ui.result.append(
    el('div', { class: 'item-toolbar' }, quickPanel, viewPanel),
    el('div', { class: 'workspace-grid' }, documentPanel, sidebar),
    exportPanel);
  tab('pv');
  return el('div', { class: 'card result-card' },
    el('div', { class: 'file-h' }, el('span', { class: 'name' }, it.file.name), el('span', { class: 'badge' }, fmtSize(it.file.size)), it.ui.badge),
    it.ui.prog, it.ui.msg, it.ui.result);
}
function flash(it, t) { const m = it.ui.msg, o = m.textContent, c = m.className; m.className = 'msg'; m.textContent = t; setTimeout(() => { m.textContent = o; m.className = c; }, 1500); }
function refreshPreview(it, now) {
  if (!now && it.ui.pv.classList.contains('hidden')) return;
  try { it.ui.pv.srcdoc = htmlString(it.md, it.file.name); } catch (e) { it.ui.pv.srcdoc = '<p>' + e.message + '</p>'; }
}
function sync(it) {
  const u = it.ui, s = it.status;
  u.badge.className = 'badge ' + (s === 'done' ? (it.warn ? 'warn' : 'ok') : s === 'error' ? 'err' : '');
  u.badge.textContent = { wait: 'Chờ', run: 'Đang xử lý', done: 'Xong', error: 'Lỗi' }[s];
  u.prog.classList.toggle('hidden', s !== 'run');
  u.result.classList.toggle('hidden', s !== 'done');
  if (s === 'done') {
    refreshTa(it); showNd(it); u.msg.className = 'msg' + (it.warn ? ' warn' : '');
    if (it.focus) { it.focus = false; it.node.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    u.msg.textContent = [it.info, it.warn].filter(Boolean).join(' — ');
  }
  if (s === 'error') { u.msg.className = 'msg err'; u.msg.textContent = it.error; }
  updateDlLabels(); summary();
}
function showNd(it) {
  const on = it.status === 'done' && it.ui.nd;
  it.ui.nd.classList.toggle('hidden', !on);
  if (on) { try { const M = ND.analyze(it.md); it.ui.nd.textContent = 'Nhận diện thể thức (cho nút Word chuẩn) → ' + ND.summary(M); it.ui.nd.className = 'msg nd' + (M.hasHead && M.missing.length ? ' warn' : ''); } catch (e) { it.ui.nd.textContent = 'Không phân tích được: ' + e.message; } }
}
function updateDlLabels() {
  const f = curFmt();
  items.forEach(it => { it.ui.dl.textContent = `Tải .${FORMATS[f].ext}`; showNd(it); });
  $('#dlAll').disabled = !items.some(i => i.status === 'done');
}
function summary() {
  const d = items.filter(i => i.status === 'done').length;
  $('#sum').textContent = items.length ? `${d}/${items.length} file đã xong` : '';
  if (!items.length) $('#bar').classList.add('hidden');
  updateDlLabels();
}
const outName = (it, f) => {
  const en = window.appI18n?.language === 'en';
  return `${baseName(it.file.name)}${f === 'docx30' ? (en ? ' - official format' : ' - chuan the thuc') : f === 'md' ? (en ? ' (formatted)' : ' (co format)') : ''}.${FORMATS[f].ext}`;
};
async function download(it, f) {
  const btns = [it.ui.dl30, it.ui.dlRaw, it.ui.dl, it.ui.dlMdRaw, it.ui.dlMdFmt];
  try {
    btns.forEach(b => b.disabled = true);
    saveBlob(await exportBlob(it.md, f, it.file.name, $('#embed').checked ? it.pics : null), outName(it, f));
  } catch (e) { alert('Không xuất được: ' + e.message); } finally { btns.forEach(b => b.disabled = false); }
}
async function runQueue() {
  if (running) return; running = true;
  try {
    for (;;) {
      const it = items.find(i => i.status === 'wait'); if (!it) break;
      it.status = 'run'; sync(it); it.ui.msg.className = 'msg'; it.ui.msg.textContent = 'Bắt đầu…';
      const progress = (f, label) => { it.ui.bar.style.width = Math.round(f * 100) + '%'; if (label) it.ui.msg.textContent = label; };
      await sleep(30);
      try {
        const ctx = { opts: getOpts(), progress };
        const r = it.files ? await convertMany(it.files, ctx) : await convertFile(it.file, ctx);
        it.pics = r.pics || null; it.pagePics = r.pagePics || null; it.ocrPages = r.ocrPages || null; it.md = (r.md || '').trim() + '\n'; it.info = r.info || ''; it.warn = r.warn || ''; it.status = 'done';
        if (!r.md.trim() && !it.warn) it.warn = 'Kết quả trống.';
        const o = ctx.opts;
        if (o.engine !== 'tess' && o.aiKey && !useAiOcr(o) && (r.isOcr || (r.ocrPages && r.ocrPages.length)) && r.md.trim()) {
          it.status = 'run'; sync(it); progress(1, 'Tesseract xong – AI đang sửa chỗ sai…');
          const n = await aiFixIt(it, o, (k, t) => { it.ui.msg.textContent = `AI đang đối chiếu & sửa lỗi trang ${k + 1}/${t}…`; });
          it.status = 'done'; if (n.applied) it.info += ` · AI đã sửa ${n.applied} chỗ`; if (n.error) it.warn = (it.warn ? it.warn + ' ' : '') + 'AI chưa sửa được (' + n.error.slice(0, 110) + ') – giữ kết quả Tesseract; bấm "✨ AI sửa lỗi OCR" để thử lại.';
        }
      } catch (e) { console.error(e); it.status = 'error'; it.error = e.message || String(e); }
      sync(it);
    }
  } finally { running = false; }
}

/* sự kiện */
const drop = $('#drop'), pick = $('#pick');
pick.onchange = () => { addFiles(pick.files); pick.value = ''; };
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
window.addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) addFiles(fs); });
$('#fmt').onchange = updateDlLabels;
$('#docKind').onchange = () => { if ($('#docKind').value === 'free') { $('#embed').checked = true; if ($('#engine').value === 'tess') alert('Ghi chú/sơ đồ viết tay cần công cụ AI (Gemini hoặc Claude). Hãy chọn trong mục Tuỳ chọn → Công cụ OCR.'); } };
$('#clear').onclick = () => { items.length = 0; $('#list').innerHTML = ''; summary(); };
$('#dlAll').onclick = async () => {
  const zip = new JSZip(), btn = $('#dlAll'), used = new Set();
  btn.disabled = true; btn.textContent = 'Đang nén…';
  try {
    for (const it of items.filter(i => i.status === 'done')) {
      for (const f of [...new Set(['docx', 'docx30', 'mdraw', 'md', curFmt()])]) {
        let n = outName(it, f), k = 1; const [b, e] = [n.replace(/\.[^.]+$/, ''), n.match(/\.[^.]+$/)[0]];
        if (used.has(n)) continue;
        while (used.has(n)) n = `${b} (${k++})${e}`;
        used.add(n); zip.file(n, await exportBlob(it.md, f, it.file.name, $('#embed').checked ? it.pics : null));
      }
    }
    saveBlob(await zip.generateAsync({ type: 'blob' }), 'converted.zip');
  } catch (e) { alert('Lỗi: ' + e.message); } finally { btn.textContent = 'Tải tất cả (.zip)'; btn.disabled = false; }
};
updateDlLabels();

/* ===== tiện ích UI mới: sao chép, AI soát lỗi, camera, lưu tuỳ chọn ===== */
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch { const a = el('textarea'); a.value = t; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); }
}
async function polish(it) {
  const o = getOpts();
  if (o.engine === 'tess' || !o.aiKey) { alert('Hãy chọn Gemini hoặc Claude và dán API key ở khung "🤖 AI".'); $('#aiCard').scrollIntoView({ behavior: 'smooth' }); return; }
  const btn = it.ui.dlFix; btn.disabled = true; const old = it.ui.msg.textContent; it.ui.msg.className = 'msg'; it.ui.msg.textContent = 'AI đang sửa lỗi…';
  const n = await aiFixIt(it, o, (k, t) => { it.ui.msg.textContent = `AI đang đối chiếu & sửa lỗi trang ${k + 1}/${t}…`; });
  btn.disabled = false;
  if (n.error) { it.ui.msg.className = 'msg err'; it.ui.msg.textContent = 'AI chưa sửa được: ' + n.error; setTimeout(() => { it.ui.msg.className = 'msg'; it.ui.msg.textContent = old; }, 6000); }
  else { it.ui.msg.className = 'msg'; it.ui.msg.textContent = n.applied ? `AI đã sửa ${n.applied} chỗ – xem danh sách bên dưới, có thể hoàn tác.` : 'AI không thấy chỗ nào cần sửa.'; }
}
const store = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };
function aiOpts() { const e = $('#engine').value; return { engine: e, aiKey: $('#aiKey').value.trim(), aiModel: $('#aiModel').value.trim() }; }
function applyEngineState() {
  const e = $('#engine').value, ai = e !== 'tess', st = $('#aiState'), name = { gemini: 'Gemini', claude: 'Claude' }[e];
  if (!ai) { st.textContent = 'Đang tắt – dùng Tesseract'; st.className = 'badge'; }
  else if ($('#aiKey').value.trim()) { st.textContent = name + ' · đã có key'; st.className = 'badge ok'; }
  else { st.textContent = name + ' · thiếu API key'; st.className = 'badge warn'; }
}
function applyEngine() {
  const e = $('#engine').value, ai = e !== 'tess';
  document.querySelectorAll('.aiF').forEach(x => x.classList.toggle('hidden', !ai));
  $('#aiOff').classList.toggle('hidden', ai); $('#langBox').classList.toggle('hidden', ai);
  if (ai) { $('#aiKey').value = store.get('dc_key_' + e); fillModels(e, aiModelList(e), store.get('dc_model_' + e)); }
  const st = $('#aiState'), name = { gemini: 'Gemini', claude: 'Claude' }[e];
  if (!ai) { st.textContent = 'Đang tắt – dùng Tesseract'; st.className = 'badge'; }
  else if ($('#aiKey').value.trim()) { st.textContent = name + ' · đã có key'; st.className = 'badge ok'; }
  else { st.textContent = name + ' · thiếu API key'; st.className = 'badge warn'; }
}
$('#engine').value = store.get('dc_engine') || 'tess';
$('#engine').onchange = () => { store.set('dc_engine', $('#engine').value); applyEngine(); if ($('#engine').value !== 'tess' && $('#aiKey').value.trim().length >= 20 && !aiModelList($('#engine').value).length) loadModels(true); };
$('#aiKey').oninput = () => { store.set('dc_key_' + $('#engine').value, $('#aiKey').value.trim()); const k = $('#aiKey').value.trim(); const sv = $('#aiModel').value; const st = $('#aiState'); applyEngineState(); clearTimeout(keyTimer); if (k.length >= 20) keyTimer = setTimeout(() => loadModels(true), 700); };
const bestModel = list => list.filter(m => /flash|haiku|sonnet/i.test(m) && !/lite|image|tts|live|audio|embed|robot|vision|preview|exp/i.test(m))[0]
  || list.filter(m => /flash|haiku|sonnet/i.test(m) && !/image|tts|live|audio|embed|robot|vision/i.test(m))[0] || list[0];
function fillModels(engine, list, selected) {
  const sel = $('#aiModel'), loaded = list.length > 0, best = bestModel(list);
  const base = loaded ? list : [...new Set([AI_DEFAULTS[engine], ...AI_FALLBACK[engine]])];
  const cur = selected && (loaded ? list.includes(selected) : true) ? selected : (best || base[0]);
  const opts = base.map(m => `<option value="${m}">${m}${m === best ? '  ⭐ khuyên dùng' : ''}</option>`);
  if (!loaded) opts.unshift('<option value="" disabled>— chưa tải danh sách: dán API key hoặc bấm ↻ —</option>');
  sel.innerHTML = opts.join(''); sel.value = cur; store.set('dc_model_' + engine, cur);
}
async function loadModels(silent) {
  const b = $('#aiList'), o = aiOpts(); if (!o.aiKey) { if (!silent) alert('Hãy dán API key trước.'); return; }
  b.disabled = true; b.textContent = '…';
  try {
    const list = await aiListModels(o); store.set('dc_models_' + o.engine, JSON.stringify(list));
    fillModels(o.engine, list, store.get('dc_model_' + o.engine));
    const st = $('#aiState'); st.textContent = `✓ Có ${list.length} model dùng được · đang chọn ${$('#aiModel').value}`; st.className = 'badge ok';
  } catch (e) { const st = $('#aiState'); st.textContent = '✗ ' + e.message.slice(0, 140); st.className = 'badge err'; }
  finally { b.disabled = false; b.textContent = '↻'; }
}
$('#aiList').onclick = () => loadModels(false);
let keyTimer = null;
$('#aiShow').onclick = () => { const k = $('#aiKey'); k.type = k.type === 'password' ? 'text' : 'password'; };
$('#aiTest').onclick = async () => {
  const b = $('#aiTest'), st = $('#aiState'); b.disabled = true; b.textContent = 'Đang thử…';
  try { const r = await aiCall(aiOpts(), 'Chỉ trả lời đúng một từ: OK', null); st.textContent = '✓ Key hoạt động (' + r.trim().slice(0, 12) + ')'; st.className = 'badge ok'; }
  catch (e) { st.textContent = '✗ ' + e.message.slice(0, 120); st.className = 'badge err'; }
  finally { b.disabled = false; b.textContent = 'Kiểm tra key'; }
};
$('#aiModel').onchange = () => { store.set('dc_model_' + $('#engine').value, $('#aiModel').value); applyEngine(); };
applyEngine();
$('#settings').open = innerWidth > 700;
$('#pickBtn').onclick = () => pick.click();

const cam = { stream: null, shots: [], url: null };
let camStamp = '';
/* Lưu ảnh: điện thoại → bảng chia sẻ (chọn "Lưu hình ảnh" để vào Ảnh); máy tính/không hỗ trợ → tải file về */
async function saveToPhotos(files) {
  if (!files || !files.length) return;
  try {
    if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, title: window.appI18n?.language === 'en' ? 'Scanned images' : 'Ảnh quét' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  files.forEach((f, i) => setTimeout(() => saveBlob(f, f.name || `scan-${i + 1}.jpg`), i * 350));
}
const updCam = () => {
  $('#camDone').disabled = !cam.shots.length; $('#camDone').textContent = cam.shots.length ? `Xong (${cam.shots.length})` : 'Xong';
  $('#camCnt').textContent = cam.shots.length ? `Đã chụp ${cam.shots.length} trang – chụp tiếp hoặc bấm Xong` : 'Đặt tài liệu vào khung, giữ máy thẳng và đủ sáng';
  const t = $('#camThumb'); t.classList.toggle('hidden', !cam.shots.length);
  if (cam.shots.length) { if (cam.url) URL.revokeObjectURL(cam.url); t.src = cam.url = URL.createObjectURL(cam.shots[cam.shots.length - 1]); }
};
async function openCam() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
  } catch { $('#camNative').click(); return; } // http (không phải https) hoặc bị từ chối → dùng camera hệ thống
  cam.shots = []; camStamp = new Date().toTimeString().slice(0, 5).replace(':', ''); try { $('#camSave').checked = localStorage.getItem('dc_camsave') !== '0'; } catch { } updCam();
  const v = $('#camVideo'); v.srcObject = cam.stream; $('#cam').classList.remove('hidden');
  try { await v.play(); } catch { }
}
function closeCam() { cam.stream?.getTracks().forEach(t => t.stop()); cam.stream = null; $('#camVideo').srcObject = null; $('#cam').classList.add('hidden'); }
async function shoot() {
  const v = $('#camVideo'); if (!v.videoWidth) return;
  const cv = el('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight; cv.getContext('2d').drawImage(v, 0, 0);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
  cam.shots.push(new File([blob], `scan-${camStamp}-${String(cam.shots.length + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));
  const f = $('#camFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); updCam();
}
function doneCam() {
  const shots = cam.shots.slice(), keep = $('#camSave').checked; try { localStorage.setItem('dc_camsave', keep ? '1' : '0'); } catch { }
  if (keep && shots.length) saveToPhotos(shots); // gọi ngay trong lần chạm để trình duyệt cho phép mở bảng chia sẻ
  closeCam(); if (!shots.length) return;
  const en = window.appI18n?.language === 'en';
  const t = new Date().toLocaleTimeString(en ? 'en-US' : 'vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (shots.length === 1) addFiles([new File([shots[0]], `${en ? 'Camera scan' : 'Quét camera'} ${t}.jpg`, { type: 'image/jpeg' })], { focus: true });
  else addFiles(shots, { merge: true, name: `${en ? 'Camera scan' : 'Quét camera'} ${t} (${shots.length} ${en ? 'pages' : 'trang'})`, focus: true });
}
$('#camBtn').onclick = openCam; $('#camClose').onclick = closeCam; $('#camShot').onclick = shoot; $('#camDone').onclick = doneCam;
$('#camNative').onchange = e => { addFiles(e.target.files, { focus: true }); e.target.value = ''; };

/* ===== Tóm tắt trực quan bằng AI: dựng lại nội dung thành trang HTML có thẻ, số liệu, sơ đồ SVG ===== */
function summaryPrompt(hasImg) {
  return 'Bạn là chuyên gia thiết kế thông tin (infographic). Từ NỘI DUNG đã chuyển đổi dưới đây' + (hasImg ? ' (kèm ảnh gốc để bạn đối chiếu bố cục và sơ đồ)' : '') +
    ', hãy tạo MỘT trang HTML tự chứa giúp người đọc hiểu nhanh nội dung. Yêu cầu: (1) Tiêu đề + 2–3 câu tóm tắt ngắn. (2) Khối "Điểm chính" dạng thẻ. (3) Số liệu then chốt dạng thẻ số lớn (kèm nhãn, đơn vị). (4) Nếu có quy trình, luồng, quan hệ, phân bổ, công thức hoặc sơ đồ trong tài liệu: VẼ LẠI bằng SVG nội tuyến (hộp, mũi tên có nhãn, cột/biểu đồ đơn giản), rõ ràng, chữ đủ lớn. (5) Bảng gọn cho dữ liệu dạng bảng; timeline cho mốc thời gian; mục "Việc cần làm" / "Lưu ý" nếu có. (6) Giữ NGUYÊN số liệu, tên riêng, không bịa; chỗ không chắc ghi [?]. (7) Viết bằng ngôn ngữ của tài liệu (mặc định tiếng Việt). (8) Phong cách: nền sáng, bo góc, màu nhã (tối đa 4 màu nhấn), bố cục rộng tối đa 920px, hiển thị tốt trên điện thoại. RÀNG BUỘC KỸ THUẬT: chỉ HTML + CSS trong <style> + SVG nội tuyến; KHÔNG script, KHÔNG ảnh/phông/CSS từ bên ngoài, KHÔNG liên kết ngoài. Chỉ trả về mã HTML bắt đầu bằng <!doctype html>, không giải thích, không code fence.';
}
function cleanSummaryHtml(raw) {
  let t = stripFence(raw); const i = t.search(/<!doctype html|<html/i); if (i > 0) t = t.slice(i);
  const doc = new DOMParser().parseFromString(t, 'text/html'); sanitize(doc);
  doc.querySelectorAll('img,video,audio,source,a[href^="http"]').forEach(n => n.tagName === 'A' ? n.removeAttribute('href') : n.remove());
  doc.querySelectorAll('style').forEach(st => { st.textContent = st.textContent.replace(/@import[^;]+;?/g, '').replace(/url\((?!['"]?data:)[^)]*\)/g, 'none'); });
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}
async function makeSummary(it) {
  const o = aiOpts();
  if (o.engine === 'tess' || !o.aiKey) { alert('Tính năng này cần AI: chọn Gemini hoặc Claude và dán API key ở khung "🤖 AI" phía trên.'); $('#aiCard').scrollIntoView({ behavior: 'smooth' }); return; }
  const box = it.ui.sum, btn = it.ui.dlSum; btn.disabled = true; btn.textContent = '🎨 AI đang thiết kế…';
  box.className = 'msg'; box.textContent = 'AI đang dựng trang tóm tắt (30–90 giây)…';
  try {
    const text = toPlainMd(it.md).slice(0, 40000);
    const pic = it.pics && it.pics[0]; let b64 = null;
    if (pic) { let bin = ''; for (let i = 0; i < pic.data.length; i += 8192) bin += String.fromCharCode(...pic.data.subarray(i, i + 8192)); b64 = btoa(bin); }
    const html = cleanSummaryHtml(await aiCall(o, summaryPrompt(!!b64) + '\n\n=== NỘI DUNG ===\n' + text, b64, 16000));
    it.summaryHtml = html;
    box.className = ''; box.innerHTML = '';
    const fr = el('iframe', { class: 'sum', sandbox: '' }); fr.srcdoc = html;
    const url = () => URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    box.append(
      el('div', { class: 'acts' },
        el('button', { class: 'primary', onclick: () => saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${baseName(it.file.name)} - ${window.appI18n?.language === 'en' ? 'summary' : 'tom tat'}.html`) }, '⬇ Tải trang tóm tắt (.html)'),
        el('button', { onclick: () => window.open(url(), '_blank') }, 'Mở tab mới / In → PDF'),
        el('button', { onclick: () => makeSummary(it) }, 'Làm lại')),
      fr);
  } catch (e) { box.className = 'msg err'; box.textContent = 'Không tạo được: ' + e.message; }
  finally { btn.disabled = false; btn.textContent = '🎨 Tóm tắt trực quan'; }
}

/* ===== AI đối chiếu ảnh gốc ↔ văn bản OCR, chỉ ra chỗ có khả năng lỗi ===== */
function reviewPrompt(hasImg) {
  return 'Bạn là người kiểm tra chất lượng OCR cho văn bản tiếng Việt. ' + (hasImg ? 'Hãy đối chiếu ẢNH GỐC với VĂN BẢN OCR bên dưới. ' : 'Không có ảnh gốc; hãy dựa vào ngữ cảnh và tính toán. ') +
    'Liệt kê các chỗ CÓ KHẢ NĂNG SAI hoặc đáng ngờ: ký tự/dấu bị nhầm (0/O, 1/l/I, 5/S, 8/B, dấu thanh), chữ bị dính hoặc tách, số liệu và đơn vị, mã số/số hiệu, ngày tháng, tên riêng, dòng hoặc ô bị thiếu/thừa, bảng lệch cột hoặc gộp nhầm ô, số liệu không khớp tiêu đề cột, các tổng/phép cộng trừ không khớp (hãy tự cộng kiểm tra), chữ viết tay có thể đọc sai. Không liệt kê chỗ đã đúng. ' +
    'Chỉ trả về DUY NHẤT một mảng JSON (tối đa 40 phần tử), mỗi phần tử dạng {"where":"trích NGUYÊN VĂN ≤60 ký tự từ văn bản OCR để định vị","problem":"mô tả ngắn","suggest":"phiên bản đúng của đúng đoạn where (để rỗng nếu không chắc)","level":"cao|vừa|thấp"}. Nếu không phát hiện gì trả về []. Không giải thích thêm, không code fence.';
}
function splitPages(md) {
  const re = /<!--\s*Trang\s+(\d+)\s*-->/g, marks = [...md.matchAll(re)];
  if (!marks.length) return [{ n: 1, md }];
  return marks.map((m, i) => ({ n: +m[1], md: md.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).trim() }));
}
const toB64 = u8 => { let b = ''; for (let i = 0; i < u8.length; i += 8192) b += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(b); };
async function reviewIt(it) {
  const o = aiOpts();
  if (o.engine === 'tess' || !o.aiKey) { alert('Tính năng này cần AI: chọn Gemini hoặc Claude và dán API key ở khung "🤖 AI" phía trên.'); $('#aiCard').scrollIntoView({ behavior: 'smooth' }); return; }
  const box = it.ui.review, btn = it.ui.dlRev; btn.disabled = true; box.className = 'msg'; box.textContent = 'AI đang đối chiếu…';
  const issues = [], pages = splitPages(it.md), lim = pages.slice(0, 12), errs = [];
  try {
    for (const [k, pg] of lim.entries()) {
      box.textContent = `AI đang đối chiếu trang ${k + 1}/${lim.length}…`;
      const pic = (it.pagePics && it.pagePics[pg.n]) || (it.pics && it.pics[pg.n - 1]);
      try {
        const raw = await aiCall(o, reviewPrompt(!!pic) + '\n\n=== VĂN BẢN OCR ===\n' + toEdit(pg.md).slice(0, 30000), pic ? toB64(pic.data) : null, 8000);
        const a = raw.indexOf('['), b = raw.lastIndexOf(']');
        (JSON.parse(raw.slice(a, b + 1)) || []).forEach(x => x && x.where && issues.push({ ...x, page: pg.n }));
      } catch (e) { errs.push(`trang ${pg.n}: ${e.message.slice(0, 80)}`); }
    }
    box.className = ''; box.innerHTML = '';
    const rank = { 'cao': 0, 'vừa': 1, 'thấp': 2 }; issues.sort((x, y) => (rank[x.level] ?? 3) - (rank[y.level] ?? 3));
    box.append(el('div', { class: 'msg' + (issues.length ? ' warn' : '') }, issues.length ? `AI nghi ngờ ${issues.length} chỗ${pages.length > lim.length ? ` (mới kiểm ${lim.length}/${pages.length} trang)` : ''} – bấm "Tới chỗ" để xem, "Áp dụng" để sửa:` : 'AI không phát hiện chỗ đáng ngờ.' + (errs.length ? ' (có lỗi: ' + errs.join('; ') + ')' : '')));
    issues.forEach(is => {
      const row = el('div', { class: 'rv' });
      const go = () => {
        it.ui.tab('md'); const ta = it.ui.taMd; let i = ta.value.indexOf(is.where); if (i < 0) i = ta.value.indexOf(is.where.slice(0, 25));
        if (i < 0) { alert('Không tìm thấy đoạn này trong văn bản (có thể đã sửa).'); return; }
        ta.focus(); ta.setSelectionRange(i, i + is.where.length);
        const ln = ta.value.slice(0, i).split('\n').length; ta.scrollTop = Math.max(0, (ln - 4) * 21); ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      const apply = () => {
        const ta = it.ui.taMd, i = ta.value.indexOf(is.where); if (i < 0) { alert('Không tìm thấy đoạn này (có thể đã sửa).'); return; }
        ta.value = ta.value.slice(0, i) + is.suggest + ta.value.slice(i + is.where.length); it.md = fromEdit(ta.value); refreshTa(it); refreshPreview(it); showNd(it); row.classList.add('done');
      };
      row.append(
        el('div', {}, el('span', { class: 'badge ' + (is.level === 'cao' ? 'err' : is.level === 'vừa' ? 'warn' : '') }, is.level || '?'), ` Tr.${is.page} · ${is.problem || ''}`),
        el('div', {}, el('code', {}, is.where), is.suggest ? ' → ' : '', is.suggest ? el('code', {}, is.suggest) : ''),
        el('div', { class: 'r2' }, el('button', { onclick: go }, 'Tới chỗ'), is.suggest ? el('button', { class: 'primary', onclick: apply }, 'Áp dụng') : ''));
      box.append(row);
    });
  } catch (e) { box.className = 'msg err'; box.textContent = 'Không kiểm tra được: ' + e.message; }
  finally { btn.disabled = false; }
}

/* ===== Tesseract đọc trước → AI chỉ trả về DANH SÁCH SỬA (ít token) rồi app tự áp dụng ===== */
function fixPrompt(hasImg) {
  return 'Bạn là bộ sửa lỗi OCR cho văn bản tiếng Việt. ' + (hasImg ? 'Hãy đối chiếu ẢNH GỐC với VĂN BẢN OCR (do Tesseract đọc) bên dưới. ' : 'Không có ảnh gốc; chỉ sửa những lỗi hiển nhiên theo ngữ cảnh. ') +
    'CHỈ trả về một mảng JSON các chỗ cần sửa, mỗi phần tử {"where":"trích NGUYÊN VĂN đoạn sai (≤80 ký tự, đủ dài để không trùng chỗ khác)","fix":"đúng đoạn đó sau khi sửa theo ảnh"}. ' +
    'Chỉ nêu chỗ CHẮC CHẮN sai: ký tự/dấu bị nhầm, số liệu, mã số/mã lớp, tên riêng, ngày tháng, chữ dính/tách, ô bảng sai hoặc thiếu chữ. KHÔNG sửa văn phong, KHÔNG thêm bớt nội dung. Nếu một đoạn OCR là RÁC do chữ ký, con dấu, hình vẽ, logo, đường kẻ hoặc vùng không phải chữ (không có chữ tương ứng trong ảnh) thì xoá nó (fix để rỗng), KHÔNG đụng vào cấu trúc: giữ nguyên mọi ký hiệu {…}, thẻ HTML, dấu ¦ ↵ và dấu **. "where" phải xuất hiện NGUYÊN VĂN trong văn bản OCR. Nếu văn bản OCR bị THIẾU hẳn một dòng/đoạn so với ảnh, dùng where = dòng liền trước chỗ thiếu và fix = dòng đó + xuống dòng + phần còn thiếu. Tối đa 80 mục. Không có lỗi thì trả []. Không giải thích, không code fence.';
}
function parseJsonArray(raw) { try { const a = raw.indexOf('['), b = raw.lastIndexOf(']'); const v = JSON.parse(raw.slice(a, b + 1)); return Array.isArray(v) ? v : []; } catch { return []; } }
async function aiFixIt(it, o, onProg) {
  const marks = /<!--\s*Trang\s+\d+\s*-->/.test(it.md), pages = splitPages(it.md), changes = [], out = []; let error = '', stop = false;
  it.mdBeforeAI = it.mdBeforeAI || it.md;
  for (const [k, pg] of pages.entries()) {
    const isOcr = it.ocrPages ? it.ocrPages.includes(pg.n) : true;
    if (stop || !isOcr || !pg.md.trim()) { out.push(pg); continue; }
    onProg && onProg(k, pages.length);
    const pic = (it.pagePics && it.pagePics[pg.n]) || (it.pics && it.pics[pg.n - 1]);
    let txt = toEdit(pg.md), n0 = changes.length;
    try {
      const raw = await aiCall(o, fixPrompt(!!pic) + '\n\n=== VĂN BẢN OCR ===\n' + txt.slice(0, 30000), pic ? toB64(pic.data) : null, 6000);
      for (const c of parseJsonArray(raw)) {
        if (!c || typeof c.where !== 'string' || typeof c.fix !== 'string' || !c.where || c.fix === c.where) continue;
        const i = txt.indexOf(c.where); if (i < 0) continue;
        txt = txt.slice(0, i) + c.fix + txt.slice(i + c.where.length); changes.push({ page: pg.n, where: c.where, fix: c.fix });
      }
      out.push(changes.length > n0 ? { n: pg.n, md: fromEdit(txt) } : pg);
    } catch (e) { error = e.message; stop = true; out.push(pg); }
  }
  if (changes.length) {
    it.md = (marks ? out.map(p => `<!-- Trang ${p.n} -->\n\n${p.md}`).join('\n\n') : out[0].md).trim() + '\n';
    refreshTa(it); refreshPreview(it); showNd(it);
  }
  it.fixLog = [...(it.fixLog || []), ...changes]; renderFixLog(it);
  return { applied: changes.length, error };
}
function renderFixLog(it) {
  const box = it.ui.review; box.className = ''; box.innerHTML = '';
  if (!it.fixLog || !it.fixLog.length) { box.className = 'hidden'; return; }
  box.append(el('div', { class: 'msg' }, `AI đã sửa ${it.fixLog.length} chỗ (Tesseract → AI). Xem lại cho chắc:`),
    el('div', { class: 'acts' }, el('button', { onclick: () => { it.md = it.mdBeforeAI; it.fixLog = []; it.mdBeforeAI = null; refreshTa(it); refreshPreview(it); showNd(it); renderFixLog(it); } }, '↩ Hoàn tác tất cả sửa của AI')));
  it.fixLog.forEach(c => box.append(el('div', { class: 'rv' }, el('div', {}, `Tr.${c.page} · `, el('code', {}, c.where), ' → ', el('code', {}, c.fix)))));
}
