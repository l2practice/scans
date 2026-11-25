#!/usr/bin/env node
// Đóng dấu ?v=<hash nội dung> cho mọi <script src="..."> cục bộ trong index.html, để trình duyệt không giữ bản JS cũ (GitHub Pages cache 10 phút).
// Chạy: node tools/stamp-versions.mjs   (nên chạy trước mỗi lần commit có sửa file .js)
import fs from 'node:fs'; import crypto from 'node:crypto';
const html = fs.readFileSync('index.html', 'utf8');
const out = html.replace(/<script src="([^"?]+\.js)(\?v=[^"]*)?"><\/script>/g, (m, f) => {
  if (!fs.existsSync(f) || f.startsWith('libs/')) return m;
  const h = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8);
  return `<script src="${f}?v=${h}"></script>`;
});
if (out !== html) { fs.writeFileSync('index.html', out); console.log('Đã cập nhật phiên bản script trong index.html'); } else console.log('Không đổi');
