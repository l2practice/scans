#!/usr/bin/env node
// tools/check-vi-freq.mjs
// Kiểm tra vi-freq.js (danh sách tần suất âm tiết cho DocConverter).
//
// Cách dùng:
//   node tools/check-vi-freq.mjs
//
// Kiểm tra:
// - Mọi khóa đều là âm tiết hợp lệ trong vi-data.js; điểm là số nguyên >= 1.
// - Kích thước < 250 KB.
// - Assert bắt lỗi mất dấu: với mỗi âm tiết có dấu trong MUST_HAVE_TONE,
//   dạng không dấu của nó phải có điểm THẤP HƠN (kể cả khi dạng không dấu
//   không có trong danh sách thì coi như điểm 0). Ví dụ "Dan" (16/triệu)
//   phải thấp hơn "dán" (21), "dân" (1660), "dàn" (66) thì app mới gắn cờ
//   và gợi ý được.

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
await import(join(ROOT, 'vi-freq.js'));
await import(join(ROOT, 'vi-data.js'));

const freqStr = globalThis.VI_FREQ.freq;
const freq = new Map();
for (const tok of freqStr.split(' ').filter(Boolean)) {
  const i = tok.lastIndexOf(':');
  freq.set(tok.slice(0, i), Number(tok.slice(i + 1)));
}
const syllables = new Set(globalThis.VI_DATA.syllables.split(' ').filter(Boolean));

const sizeKB = statSync(join(ROOT, 'vi-freq.js')).size / 1024;
console.log(`vi-freq.js : ${freq.size} âm tiết, ${sizeKB.toFixed(1)} KB`);
console.log(`vi-data.js: ${syllables.size} âm tiết`);

let failed = false;
// 1. Mọi khóa đều là âm tiết hợp lệ; điểm là số nguyên >= 1.
const badKeys = [...freq.keys()].filter((k) => !syllables.has(k));
if (badKeys.length) {
  console.log(`\nASSERT LỖI: khóa không phải âm tiết hợp lệ: ${badKeys.slice(0, 20).join(' ')}`);
  failed = true;
}
const badScores = [...freq.entries()].filter(([, v]) => !Number.isInteger(v) || v < 1);
if (badScores.length) {
  console.log(`\nASSERT LỖI: điểm không hợp lệ: ${badScores.slice(0, 10).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  failed = true;
}
if (sizeKB >= 250) {
  console.log(`\nASSERT LỖI: file ${sizeKB.toFixed(1)} KB, vượt giới hạn 250 KB`);
  failed = true;
}

// 2. Bỏ dấu thanh (giữ nguyên chất nguyên âm: ê/ơ/ă/â...), để suy ra dạng không dấu.
const TONE_OF = {
  a: ['a', 'á', 'à', 'ả', 'ã', 'ạ'], ă: ['ă', 'ắ', 'ằ', 'ẳ', 'ẵ', 'ặ'],
  â: ['â', 'ấ', 'ầ', 'ẩ', 'ẫ', 'ậ'], e: ['e', 'é', 'è', 'ẻ', 'ẽ', 'ẹ'],
  ê: ['ê', 'ế', 'ề', 'ể', 'ễ', 'ệ'], i: ['i', 'í', 'ì', 'ỉ', 'ĩ', 'ị'],
  y: ['y', 'ý', 'ỳ', 'ỷ', 'ỹ', 'ỵ'], o: ['o', 'ó', 'ò', 'ỏ', 'õ', 'ọ'],
  ô: ['ô', 'ố', 'ồ', 'ổ', 'ỗ', 'ộ'], ơ: ['ơ', 'ớ', 'ờ', 'ở', 'ỡ', 'ợ'],
  u: ['u', 'ú', 'ù', 'ủ', 'ũ', 'ụ'], ư: ['ư', 'ứ', 'ừ', 'ử', 'ữ', 'ự'],
};
const STRIP = {};
for (const [base, forms] of Object.entries(TONE_OF)) {
  for (const f of forms) STRIP[f] = base;
}
const stripTone = (s) => [...s].map((ch) => STRIP[ch] || ch).join('');

// 3. Assert bắt lỗi mất dấu: dạng có dấu phải "nặng ký" hơn dạng không dấu.
const MUST_HAVE_TONE = [
  'dán', 'dân', 'dàn', 'dạy', 'dòng', 'trường', 'tiếng', 'quyền', 'hóa',
  'phố', 'kế', 'hoạch', 'ngoại', 'ngữ', 'dương', 'đường', 'nghèo',
  'sách', 'phương', 'việt', 'người', 'được',
];
// (Bỏ "giảng": dạng không dấu "giang" là từ Hán-Việt có thật ("giang sơn",
// "Trường Giang") và còn thường gặp hơn (245 > 95). Bỏ "dẫn": bỏ dấu của
// nó ra "dân" — một từ có thật và thường gặp hơn (1660 > 550). Cả hai đều
// là giới hạn thật của phương pháp tần suất: khi dạng mất dấu trùng một từ
// có thật và thường gặp, chỉ ngữ cảnh mới phân biệt được.)
const weak = [];
for (const w of MUST_HAVE_TONE) {
  const bare = stripTone(w);
  const sTone = freq.get(w);
  const sBare = freq.get(bare) || 0;
  if (sTone === undefined) {
    weak.push(`${w} (không có trong danh sách)`);
  } else if (bare !== w && sTone <= sBare) {
    weak.push(`${w}:${sTone} không hơn ${bare}:${sBare}`);
  }
}
if (weak.length) {
  console.log(`\nASSERT LỖI: các dạng có dấu không "nặng ký" hơn dạng không dấu:\n  ${weak.join('\n  ')}`);
  failed = true;
} else {
  console.log(`\nAssert bắt lỗi mất dấu: đạt (${MUST_HAVE_TONE.length} âm tiết có dấu đều nặng ký hơn dạng không dấu).`);
}

// 4. Trường hợp mẫu "Dan": in ra bảng xếp hạng để đối chiếu bằng mắt.
const base = 'dan';
const variants = [...syllables]
  .filter((s) => stripTone(s) === base && freq.has(s))
  .sort((a, b) => freq.get(b) - freq.get(a));
console.log(`\nBiến thể của "${base}" theo tần suất: ${variants.map((v) => `${v}:${freq.get(v)}`).join(', ')}`);

if (failed) {
  console.log('\nKHÔNG ĐẠT.');
  process.exit(1);
}
console.log('\nĐẠT: vi-freq.js hợp lệ.');
