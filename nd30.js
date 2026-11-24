/* Chuẩn hoá thể thức văn bản hành chính (NĐ 30/2020/NĐ-CP) – thông số lấy từ bộ mẫu V-Format:
   A4, lề T/D 2cm, trái 3cm, phải 1.5cm; Times New Roman; bảng đầu trang 2 cột (3685|5669 twips),
   khối Nơi nhận | Chữ ký (4252|5102), số trang căn giữa ở đầu trang (trừ trang 1). */
'use strict';
const ND = (() => {
  const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase();
  const upperVN = t => { const l = t.replace(/[^\p{L}]/gu, ''); return l.length >= 2 && l === l.toUpperCase() && l !== l.toLowerCase(); };
  const TYPES = ['QUYET DINH', 'NGHI QUYET', 'CHI THI', 'THONG BAO', 'BAO CAO', 'BIEN BAN', 'TO TRINH', 'KE HOACH', 'CHUONG TRINH', 'HUONG DAN',
    'QUY CHE', 'QUY DINH', 'THONG TU', 'NGHI DINH', 'GIAY MOI', 'GIAY GIOI THIEU', 'GIAY NGHI PHEP', 'PHIEU GUI', 'PHIEU CHUYEN', 'PHIEU BAO',
    'DE AN', 'DU AN', 'CONG DIEN', 'THONG CAO', 'KET LUAN', 'HOP DONG', 'THOA THUAN', 'BAN GHI NHO', 'BAN CAM KET', 'DANH SACH', 'THU CONG',
    'SAO Y', 'SAO LUC', 'TRICH SAO', 'LENH', 'TUYEN BO', 'DIEU LE', 'PHUONG AN', 'DE NGHI', 'CONG VAN', 'BAN SAO Y'];
  const TYPE_NAME = { 'QUYET DINH': 'QUYẾT ĐỊNH', 'NGHI QUYET': 'NGHỊ QUYẾT', 'CHI THI': 'CHỈ THỊ', 'THONG BAO': 'THÔNG BÁO', 'BAO CAO': 'BÁO CÁO', 'BIEN BAN': 'BIÊN BẢN', 'TO TRINH': 'TỜ TRÌNH', 'KE HOACH': 'KẾ HOẠCH', 'CHUONG TRINH': 'CHƯƠNG TRÌNH', 'HUONG DAN': 'HƯỚNG DẪN', 'QUY CHE': 'QUY CHẾ', 'QUY DINH': 'QUY ĐỊNH', 'THONG TU': 'THÔNG TƯ', 'NGHI DINH': 'NGHỊ ĐỊNH', 'GIAY MOI': 'GIẤY MỜI', 'GIAY GIOI THIEU': 'GIẤY GIỚI THIỆU', 'GIAY NGHI PHEP': 'GIẤY NGHỈ PHÉP', 'PHIEU GUI': 'PHIẾU GỬI', 'PHIEU CHUYEN': 'PHIẾU CHUYỂN', 'PHIEU BAO': 'PHIẾU BÁO', 'DE AN': 'ĐỀ ÁN', 'DU AN': 'DỰ ÁN', 'CONG DIEN': 'CÔNG ĐIỆN', 'THONG CAO': 'THÔNG CÁO', 'KET LUAN': 'KẾT LUẬN', 'HOP DONG': 'HỢP ĐỒNG', 'THOA THUAN': 'THỎA THUẬN', 'BAN GHI NHO': 'BẢN GHI NHỚ', 'BAN CAM KET': 'BẢN CAM KẾT', 'DANH SACH': 'DANH SÁCH', 'THU CONG': 'THƯ CÔNG', 'SAO Y': 'SAO Y', 'SAO LUC': 'SAO LỤC', 'TRICH SAO': 'TRÍCH SAO', 'LENH': 'LỆNH', 'TUYEN BO': 'TUYÊN BỐ', 'DIEU LE': 'ĐIỀU LỆ', 'PHUONG AN': 'PHƯƠNG ÁN', 'DE NGHI': 'ĐỀ NGHỊ', 'CONG VAN': 'CÔNG VĂN', 'BAN SAO Y': 'BẢN SAO Y' };
  const typeName = U => TYPE_NAME[U] || U;
  const LEGAL = ['QUYET DINH', 'NGHI QUYET', 'THONG TU', 'NGHI DINH', 'LENH', 'QUY CHE', 'QUY DINH'];
  const SEP = /^[\s\-–—_=─━.|·•*~]{3,}$/;
  const SIGPFX = /^(TM|TL|KT|Q|TUQ)\s*[.\/]/i;
  const BODYSTART = /^(Kính gửi|Căn cứ|Thực hiện|Theo|Nhằm|Để|Triển khai|Xét|Điều\s+\d|Chương|[IVX]+[.)]\s|\d+[.)]\s|[-–•])/i;

  /* ---------- 1. Tách DOM thành danh sách "dòng" ---------- */
  function allIn(el, re) { // mọi chữ trong el đều nằm trong thẻ khớp re (b/strong, i/em)
    let ok = true, any = false;
    const walk = (n, inside) => {
      if (n.nodeType === 3) { if (n.textContent.trim()) { any = true; if (!inside) ok = false; } return; }
      if (n.nodeType !== 1) return;
      const ins = inside || re.test(n.tagName);
      n.childNodes.forEach(c => walk(c, ins));
    };
    walk(el, false); return any && ok;
  }
  function items(doc) {
    const out = [];
    const push = (el, align) => {
      const t = el.textContent.replace(/\s+/g, ' ').trim(); if (!t) return;
      out.push({ t, el, align: align || '', b: allIn(el, /^(B|STRONG)$/), i: allIn(el, /^(I|EM)$/) });
    };
    const addBlock = (node, align) => {
      if (/<br/i.test(node.innerHTML)) node.innerHTML.split(/<br\s*\/?>/i).forEach(h => { const d = node.ownerDocument.createElement('div'); d.innerHTML = h; push(d, align); });
      else push(node, align);
    };
    const walk = parent => parent.childNodes.forEach(c => {
      if (c.nodeType === 3) { if (c.textContent.trim()) { const d = parent.ownerDocument.createElement('div'); d.textContent = c.textContent; push(d); } return; }
      if (c.nodeType !== 1) return;
      const tg = c.tagName, al = c.getAttribute('align') || '';
      if (/^H[1-6]$|^P$/.test(tg)) addBlock(c, al);
      else if (tg === 'UL' || tg === 'OL') {
        let n = parseInt(c.getAttribute('start')) || 1;
        [...c.children].forEach(li => {
          const d = li.ownerDocument.createElement('div'); d.innerHTML = li.innerHTML.replace(/<(ul|ol)[\s\S]*$/i, '');
          const mk = tg === 'OL' ? (n++) + '. ' : '- '; d.insertBefore(d.ownerDocument.createTextNode(mk), d.firstChild); push(d);
          li.querySelectorAll(':scope > ul, :scope > ol').forEach(sub => walk({ childNodes: [sub], ownerDocument: li.ownerDocument }));
        });
      } else if (tg === 'PRE') c.textContent.split('\n').forEach(l => { const d = c.ownerDocument.createElement('div'); d.textContent = l; push(d); });
      else if (tg === 'TABLE') {
        if (c.hasAttribute('data-plain')) {
          const rows = [...c.querySelectorAll('tr')].map(tr => [...tr.children]); const nc = Math.max(0, ...rows.map(r => r.length));
          for (let k = 0; k < nc; k++) rows.forEach(r => { if (r[k]) addBlock(r[k], r[k].getAttribute('align') || ''); });
        } else out.push({ kind: 'table', el: c, t: '' });
      } else if (tg === 'HR') { /* bỏ */ } else walk(c);
    });
    walk(doc.body);
    return out;
  }

  /* ---------- 2. Nhận diện thành phần ---------- */
  const baseCh = c => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase();
  function findIn(t, re) { // tìm re (trên chữ không dấu) trong t, trả về [start,end) theo t gốc
    let s = '', map = [];
    for (let i = 0; i < t.length; i++) for (const ch of baseCh(t[i])) { s += ch; map.push(i); }
    const m = re.exec(s); if (!m) return null;
    return [map[m.index], map[m.index + m[0].length - 1] + 1];
  }
  const SPLITS = [/CONG\s+HOA\s+XA\s+HOI\s+CHU\s+NGHIA\s+VIET\s+NA./, /DOC\s+LAP\s*\S{0,3}\s*TU\s+DO\s*\S{0,3}\s*HANH\s+PHUC/];
  function expand(L) { // tách các cụm chuẩn bị dính chung một dòng (do OCR gộp cột)
    const out = [];
    L.forEach((it, idx) => {
      if (it.kind || idx > 25) { out.push(it); return; }
      let parts = [it.t];
      for (const re of SPLITS) parts = parts.flatMap(p => { const r = findIn(p, re); if (!r || (r[0] === 0 && r[1] >= p.length - 1)) return [p]; return [p.slice(0, r[0]), p.slice(r[0], r[1]), p.slice(r[1])]; });
      parts = parts.flatMap(p => { const m = p.match(/^(.*?)(\p{Lu}[\p{L} ]{1,20},\s*ngày\s+\S{1,5}\s+tháng\s+\S{1,5}\s+năm\s+\d{4})(.*)$/u); return m ? [m[1], m[2], m[3]] : [p]; });
      parts = parts.flatMap(p => { const m = p.match(/^(.*?)\s(V\/?v\b.*)$/i); return m && m[1].trim() ? [m[1], m[2]] : [p]; });
      parts = parts.map(p => p.trim()).filter(Boolean);
      if (parts.length <= 1) out.push(it); else parts.forEach(p => out.push({ ...it, t: p }));
    });
    return out;
  }
  function analyze(md) {
    const doc = mdToDom(md), L = expand(items(doc));
    const M = { agencies: [], so: '', vv: '', date: '', qh: false, tn: false, type: '', title: [], pre: [], body: [], noi: [], sig: [], missing: [] };
    let i = 0, seen = false, typeFound = false;
    const u = t => strip(t);
    // ---- phần đầu
    for (; i < L.length; i++) {
      const it = L[i]; if (it.kind) break;
      let t = it.t, U = u(t);
      if (SEP.test(t) || (t.replace(/[^\p{L}\p{N}]/gu, '').length < 3 && !typeFound)) { continue; } // gạch ngang / nhiễu OCR
      // dòng dính liền "Số: … Hà Nội, ngày …"
      const m2 = t.match(/^(S[ốo]\s*:.*?)\s+(\p{Lu}[\p{L}\s]{1,24},?\s*ngày.*)$/u);
      if (m2) { M.so = m2[1].trim(); M.date = m2[2].trim(); seen = true; continue; }
      const isQh = /CONG HOA XA|HOI CHU NGHIA|CHU NGHIA VIET N/.test(U), isTn = /DOC LAP|TU DO\b.*HANH PHUC|HANH PHUC$/.test(U);
      if (isQh || isTn) { if (isQh) M.qh = true; if (isTn) M.tn = true; seen = true; continue; }
      if (/NGAY\s+\S{1,5}\s+THANG\s+\S{1,5}\s+NAM/.test(U) && t.length < 80) { M.date = t; seen = true; continue; }
      if (/^SO\s*[:.]/.test(U) && t.length < 60) { M.so = t; seen = true; continue; }
      if (/^V\s*[\/I1]?\s*V\b/.test(U) && !/^VAN\b/.test(U)) { M.vv = t; seen = true; continue; }
      if (M.vv && !M.title.length && !BODYSTART.test(t) && !/[.:]$/.test(M.vv) && t.length < 100 && !typeFound && !upperVN(t)) { M.vv += ' ' + t; continue; }
      if (TYPES.includes(U.replace(/[^A-Z ]/g, '').trim()) && t.length <= 32) { M.type = U.replace(/[^A-Z ]/g, '').trim(); typeFound = true; i++; break; }
      if (upperVN(t) && t.length <= 70 && !typeFound && (seen || i < 6) && !/[.:;]$/.test(t)) { M.agencies.push(t); continue; }
      break;
    }
    if (!seen && !typeFound) { M.agencies = []; i = 0; M.vv = ''; }
    // ---- tên loại / trích yếu
    if (typeFound) {
      let k = 0;
      for (; i < L.length && k < 3; i++, k++) {
        const it = L[i]; if (it.kind) break; const t = it.t;
        if (SEP.test(t)) { k--; continue; }
        const first = k === 0, prevT = M.title[M.title.length - 1] || '';
        const isTitle = /^(Về việc|V\/v|Về)\b/i.test(t) || (first && (it.align === 'center' || it.b) && !BODYSTART.test(t) && !upperVN(t)) ||
          (!first && !/[.:]$/.test(prevT) && t.length < 110 && (it.align === 'center' || it.b || /^[a-zà-ỹ]/.test(t)) && !BODYSTART.test(t));
        if (!isTitle) break; M.title.push(t);
      }
    }
    // ---- đóng khối: nơi nhận & chữ ký
    let end = L.length;
    const noiIdx = L.findIndex((x, k) => k >= i && !x.kind && /^\W{0,3}NOI\s*NHAN\s*[:;]?/.test(u(x.t)));
    const isSigLine = x => !x.kind && (SIGPFX.test(x.t) || (upperVN(x.t) && x.t.length <= 60) || (x.t.length <= 40 && !/[.;:,]$/.test(x.t) && x.t.split(' ').length <= 6 && /^\p{Lu}/u.test(x.t)));
    if (noiIdx >= 0) {
      let j = noiIdx; const first = '';
      if (first) M.noi.push(first.replace(/^[-–•]\s*/, '- '));
      for (j = noiIdx + 1; j < L.length; j++) {
        const x = L[j]; if (x.kind) break; const U = u(x.t), prev = M.noi[M.noi.length - 1] || '';
        if (/^[-–•*]\s?/.test(x.t) || /^NHU TREN|^LUU\s*[:;.]/.test(U) || /^\(.*\)$/.test(x.t)) M.noi.push(x.t.replace(/^[-–•*]\s*/, '- '));
        else if (prev && !/[;.]$/.test(prev) && /^[a-zà-ỹ(]/.test(x.t) && !SIGPFX.test(x.t)) M.noi[M.noi.length - 1] += ' ' + x.t;
        else break;
      }
      M.sig = L.slice(j).filter(x => !x.kind).map(x => x.t);
      end = noiIdx;
      if (!M.sig.length) { // chữ ký nằm trước "Nơi nhận"
        let k = noiIdx - 1; const tmp = [];
        while (k >= i && tmp.length < 6 && isSigLine(L[k]) && !/[.]\/?\.?$/.test(L[k].t.replace(/\.\/\.$/, '')) ) { tmp.unshift(L[k].t); k--; }
        if (tmp.length) { M.sig = tmp; end = k + 1; }
      }
    } else {
      let k = L.length - 1; const tmp = [];
      while (k >= i && tmp.length < 6 && isSigLine(L[k]) && !/\.$/.test(L[k].t.replace(/\.\/\.$/, '')) ) { tmp.unshift(L[k].t); k--; }
      if (tmp.length >= 2 && tmp.some(t => upperVN(t) || SIGPFX.test(t))) { M.sig = tmp; end = k + 1; }
    }
    {
      const isItem = t => /^[-–•*]\s?/.test(t) || /^(Như trên|Lưu\s*[:;.])/i.test(t) || /\((để|b\/c|đ\/b)/i.test(t);
      const keep = [], mv = [];
      M.sig.forEach(t => (isItem(t) ? mv : keep).push(t));
      if (mv.length) { M.noi.push(...mv.map(t => t.replace(/^[-–•*]\s*/, '- '))); M.sig = keep; }
    }
    M.body = L.slice(i, end);
    // ---- báo cáo thiếu sót
    const hasHead = M.qh || M.tn || M.so || M.date || typeFound;
    M.hasHead = hasHead;
    if (hasHead) {
      if (!M.qh) M.missing.push('Quốc hiệu'); if (!M.tn) M.missing.push('Tiêu ngữ'); if (!M.agencies.length) M.missing.push('Cơ quan ban hành');
      if (!M.so) M.missing.push('Số, ký hiệu'); if (!M.date) M.missing.push('Ngày tháng');
    }
    return M;
  }

  function summary(M) {
    if (!M.hasHead) return 'Không thấy phần đầu văn bản (quốc hiệu, số, ngày…) – chỉ áp dụng lề, font, cỡ chữ, thụt dòng và số trang.';
    const p = [];
    p.push(M.type ? 'Loại: ' + typeName(M.type) : (M.vv ? 'Công văn' : 'Loại: (không rõ)'));
    if (M.agencies.length) p.push('Cơ quan: ' + M.agencies.join(' / '));
    if (M.so) p.push(M.so); if (M.date) p.push(M.date);
    if (M.title.length) p.push('Trích yếu: ' + M.title.join(' ')); else if (M.vv) p.push(M.vv);
    p.push(M.noi.length ? `Nơi nhận: ${M.noi.length} mục` : 'Không thấy "Nơi nhận"');
    p.push(M.sig.length ? 'Người ký: ' + M.sig.join(' · ') : 'Không thấy chữ ký');
    return p.join('  |  ') + (M.missing.length ? `  ⚠ Thiếu: ${M.missing.join(', ')}` : '');
  }

  /* ---------- 3. Dựng .docx theo mẫu ---------- */
  function build(md, P, pics) {
    const D = docx, M = analyze(md), F = 'Times New Roman';
    const LAND = Math.max(0, ...M.body.filter(x => x.kind === 'table').map(x => tableGrid(x.el).nc)) >= 9;
    const A = D.AlignmentType, DXA = D.WidthType.DXA;
    const rn = (text, o = {}) => new D.TextRun({ text, font: F, size: o.sz, bold: o.b, italics: o.i, highlight: o.hl ? 'yellow' : undefined });
    const pr = (runs, o = {}) => new D.Paragraph({
      alignment: o.jc, children: runs, keepNext: o.keepNext,
      spacing: { before: o.before ?? 0, after: o.after ?? 0, line: o.line, },
      indent: (o.firstLine || o.left) ? { firstLine: o.firstLine, left: o.left } : undefined,
    });
    const line = (t, o) => pr([rn(t, o)], o);
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const nb = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
    const cell = (w, ch) => new D.TableCell({ width: { size: w, type: DXA }, borders: { top: none, bottom: none, left: none, right: none }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: ch.length ? ch : [pr([])] });
    const tbl2 = (w1, w2, c1, c2) => new D.Table({ width: { size: w1 + w2, type: DXA }, columnWidths: [w1, w2], borders: nb, rows: [new D.TableRow({ cantSplit: true, children: [cell(w1, c1), cell(w2, c2)] })] });
    const ch = [];
    const BODY = P.sz, LINE = P.line, AFTER = P.after;

    if (M.hasHead) {
      const left = [], right = [], ag = M.agencies;
      ag.forEach((a, k) => left.push(line(a, { sz: 26, b: k === ag.length - 1, jc: A.CENTER, line: 276 })));
      if (ag.length) left.push(line('———————', { sz: 20, b: true, jc: A.CENTER, after: 80 }));
      if (M.so) left.push(line(M.so, { sz: 26, jc: A.CENTER }));
      if (M.vv && !M.type) left.push(line(M.vv, { sz: 25, jc: A.CENTER, before: 40 }));
      right.push(line('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { sz: 25, b: true, jc: A.CENTER }));
      right.push(line('Độc lập - Tự do - Hạnh phúc', { sz: 27, b: true, jc: A.CENTER, after: 40 }));
      right.push(line('———————————————', { sz: 22, b: true, jc: A.CENTER, after: 80 }));
      if (M.date) right.push(line(M.date, { sz: 28, i: true, jc: A.CENTER }));
      ch.push(tbl2(3685, 5669, left, right));
      ch.push(pr([], { after: 120 }));
      if (M.type) {
        ch.push(line(typeName(M.type), { sz: 28, b: true, jc: A.CENTER, before: 160, after: 40, keepNext: true }));
        M.title.forEach((t, k) => ch.push(line(t, { sz: P.titleSz, b: true, jc: A.CENTER, after: k === M.title.length - 1 ? 40 : 0, keepNext: true })));
        ch.push(line('————————', { sz: 20, b: true, jc: A.CENTER, after: 120 }));
      }
    }
    // ---- thân văn bản
    const legal = LEGAL.includes(M.type);
    const runsOf = (el, base) => {
      const parts = [];
      const walk = (n, st) => n.childNodes.forEach(c => {
        if (c.nodeType === 3) { const t = c.textContent.replace(/\s+/g, ' '); if (t) parts.push({ t, st }); }
        else if (c.nodeType === 1 && !/^(TABLE|UL|OL|IMG)$/.test(c.tagName)) walk(c, { ...st, b: st.b || /^(B|STRONG)$/.test(c.tagName), i: st.i || /^(I|EM)$/.test(c.tagName), hl: st.hl || c.tagName === 'MARK' });
      });
      walk(el, base);
      if (parts.length) { parts[0].t = parts[0].t.replace(/^\s+/, ''); parts[parts.length - 1].t = parts[parts.length - 1].t.replace(/\s+$/, ''); }
      return parts.filter(p => p.t).map(p => rn(p.t, { sz: BODY, b: p.st.b, i: p.st.i, hl: p.st.hl }));
    };
    const bodyP = (it, o = {}) => pr(o.runs || runsOf(it.el, { b: o.b ?? it.b, i: o.i ?? it.i }),
      { jc: o.jc ?? A.JUSTIFIED, firstLine: o.firstLine ?? 720, before: o.before ?? 0, after: o.after ?? AFTER, line: LINE, keepNext: o.keepNext });
    let prevHead = false;
    for (let k = 0; k < M.body.length; k++) {
      const it = M.body[k]; prevHead = false;
      if (it.kind === 'table') { ch.push(...tableDocx(it.el, { textW: LAND ? 15704 : 9355 })); continue; }
      const t = it.t, U = strip(t);
      if (/^CHUONG\s+([IVXLC]+|\d+)\b/.test(U)) {
        ch.push(line(t, { sz: BODY, b: true, jc: A.CENTER, before: 120, after: 0, keepNext: true, line: LINE }));
        const nx = M.body[k + 1]; if (nx && !nx.kind && !BODYSTART.test(nx.t) && nx.t.length < 100) { ch.push(line(nx.t, { sz: BODY, b: true, jc: A.CENTER, after: AFTER, line: LINE })); k++; }
      } else if (/^(QUYET DINH|NGHI QUYET|QUYET NGHI)\s*:$/.test(U)) ch.push(line(t, { sz: BODY, b: true, jc: A.CENTER, before: 120, after: AFTER, line: LINE, keepNext: true }));
      else if (/^DIEU\s+\d+[.:]/.test(U)) {
        const whole = t.length <= 120 && !/[.;:,]$/.test(t);
        if (whole) ch.push(bodyP(it, { b: true, before: 80, keepNext: true }));
        else { const m = t.match(/^(Điều\s+\d+[.:])\s*(.*)$/i); ch.push(pr([rn(m[1] + ' ', { sz: BODY, b: true }), rn(m[2], { sz: BODY })], { jc: A.JUSTIFIED, firstLine: 720, after: AFTER, line: LINE })); }
      } else if (/^([IVX]{1,4}|[A-Z])[.)]\s+/.test(t) && (upperVN(t.replace(/^\S+\s+/, '')) || t.length < 80 && !/[.;:,]$/.test(t))) {
        ch.push(bodyP(it, { b: true, firstLine: 0, before: 120, after: 80, keepNext: true })); prevHead = true;
      } else if (/^\d+\.\s+/.test(t) && t.length < 90 && !/[.;:,]$/.test(t)) ch.push(bodyP(it, { b: true, keepNext: true }));
      else if (legal && /^(Căn cứ|Xét |Theo đề nghị|Theo đề xuất)/i.test(t)) ch.push(bodyP(it, { i: true }));
      else if (/^Kính gửi\s*:/i.test(t)) ch.push(bodyP(it, { firstLine: 720, before: 60 }));
      else ch.push(bodyP(it));
    }

    // ---- nơi nhận | chữ ký
    if (M.noi.length || M.sig.length) {
      const l = [], r = [];
      if (M.noi.length) {
        l.push(line('Nơi nhận:', { sz: 24, b: true, i: true, after: 40, keepNext: true }));
        M.noi.forEach((t, k) => l.push(pr([rn(t, { sz: 22 })], { left: 113, after: k === M.noi.length - 1 ? 0 : 20, line: 264 })));
      }
      if (M.sig.length) {
        const name = (!upperVN(M.sig[M.sig.length - 1]) && !SIGPFX.test(M.sig[M.sig.length - 1]) && M.sig.length > 1) ? M.sig[M.sig.length - 1] : '';
        const roles = name ? M.sig.slice(0, -1) : M.sig;
        roles.forEach((t, k) => r.push(line(t, { sz: 27, b: true, jc: A.CENTER, after: k === roles.length - 1 ? 20 : 0, keepNext: true })));
        r.push(pr([], { before: 720, after: 0, jc: A.CENTER, keepNext: true }));
        if (name) r.push(line(name, { sz: 27, b: true, jc: A.CENTER }));
      }
      ch.push(pr([], { after: 40 }));
      ch.push(tbl2(4252, 5102, l, r));
    }
    if (!ch.length) ch.push(pr([]));
    if (pics && pics.length) ch.push(...picParas(pics));

    const hdr = new D.Header({ children: [new D.Paragraph({ alignment: A.CENTER, spacing: { before: 0, after: 0 }, children: [new D.TextRun({ children: [D.PageNumber.CURRENT], font: F, size: 28 })] })] });
    return new D.Document({
      creator: 'DocConverter', title: M.title.join(' ') || M.type,
      styles: { default: { document: { run: { font: F, size: BODY } } } },
      sections: [{
        properties: { titlePage: true, page: LAND ? { size: { width: 11906, height: 16838, orientation: D.PageOrientation.LANDSCAPE }, margin: { top: 567, bottom: 567, left: 567, right: 567, header: 300, footer: 300 } } : { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 850, header: 567, footer: 720 } } },
        headers: { default: hdr, first: new D.Header({ children: [new D.Paragraph({ children: [] })] }) },
        children: ch,
      }],
    });
  }

  function bordered(t, sz) { // bảng dữ liệu thật: giữ đường kẻ, font TNR
    const D = docx, rows = [...t.querySelectorAll('tr')]; if (!rows.length) return [];
    const b = { style: D.BorderStyle.SINGLE, size: 4, color: '000000' }, n = Math.max(...rows.map(r => r.children.length));
    return [new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE }, borders: { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b },
      rows: rows.map(tr => new D.TableRow({ tableHeader: !!tr.querySelector('th'), children: [...tr.children].map(c => new D.TableCell({
        width: { size: Math.floor(100 / n), type: D.WidthType.PERCENTAGE }, margins: { top: 40, bottom: 40, left: 80, right: 80 },
        children: [new D.Paragraph({ alignment: c.tagName === 'TH' ? D.AlignmentType.CENTER : undefined, children: [new D.TextRun({ text: c.textContent.replace(/\s+/g, ' ').trim(), font: 'Times New Roman', size: sz, bold: c.tagName === 'TH' })] })],
      })) })),
    }), new D.Paragraph({ children: [] })];
  }

  const PRESETS = {
    '27': { sz: 27, line: 324, after: 80, titleSz: 27 },   // mẫu Báo cáo / Biên bản
    '28': { sz: 28, line: 276, after: 120, titleSz: 28 },  // mẫu Chỉ thị
    '26': { sz: 26, line: 288, after: 100, titleSz: 26 },
  };
  return { analyze, summary, build, PRESETS };
})();
