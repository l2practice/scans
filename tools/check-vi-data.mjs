#!/usr/bin/env node
// tools/check-vi-data.mjs
// Kiểm tra vi-data.js so với đáp án tham chiếu (assets/vi_syllables.txt của viocr).
//
// Cách dùng:
//   ORACLE=/đường/dẫn/vi_syllables.txt node tools/check-vi-data.mjs
//
// In ra: số mục của bạn, độ phủ so với tham chiếu, số mục thừa, 50 mục thiếu
// và 50 mục thừa đầu tiên. Thoát mã 1 nếu rớt nghiệm thu hoặc rớt assert.
//
// Nghiệm thu: độ phủ >= 99,5% các mục tham chiếu (so sánh không phân biệt
// hoa/thường, vì tập của bạn là chữ thường); số mục thừa <= 25% so với tham chiếu.
// Lưu ý: file tham chiếu chỉ dùng để đo trên máy dev, KHÔNG commit.
//
// Assert cứng: ~80 âm tiết chắc chắn đúng phải CÓ trong tập;
// ~20 chuỗi chắc chắn SAI phải KHÔNG có trong tập.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
await import(join(ROOT, 'vi-data.js'));
const mine = new Set(globalThis.VI_DATA.syllables.split(' ').filter(Boolean));

const oraclePath = process.env.ORACLE;
if (!oraclePath) {
  console.error('Thiếu biến ORACLE. Chạy: ORACLE=/đường/dẫn/vi_syllables.txt node tools/check-vi-data.mjs');
  process.exit(2);
}
const oracle = new Set(
  readFileSync(oraclePath, 'utf8')
    .split('\n')
    .map((s) => s.trim().toLowerCase().normalize('NFC'))
    .filter(Boolean),
);

const missing = [...oracle].filter((s) => !mine.has(s)).sort();
const extra = [...mine].filter((s) => !oracle.has(s)).sort();
const coverage = ((oracle.size - missing.length) / oracle.size) * 100;
const extraPct = (extra.length / oracle.size) * 100;

console.log(`Tập của bạn : ${mine.size} mục`);
console.log(`Tham chiếu  : ${oracle.size} mục (đã lowercase + khử trùng)`);
console.log(`Độ phủ      : ${coverage.toFixed(2)}% (thiếu ${missing.length} mục)`);
console.log(`Mục thừa    : ${extra.length} mục (${extraPct.toFixed(2)}% so với tham chiếu)`);
console.log(`\n50 mục thiếu đầu tiên:\n  ${missing.slice(0, 50).join(' ')}`);
console.log(`\n50 mục thừa đầu tiên:\n  ${extra.slice(0, 50).join(' ')}`);

// ---------------------------------------------------------------------------
// Assert cứng.
// ---------------------------------------------------------------------------
const MUST_HAVE = [
  // Từ nhiệm vụ (viết thường).
  'tiếng', 'việt', 'người', 'được', 'nghiêng', 'quyển', 'giường', 'khuya',
  'thuở', 'nghèo', 'trường', 'đồng', 'nẵng', 'hoặc', 'xin', 'chào', 'phố',
  'kế', 'hoạch', 'phương', 'pháp', 'giảng', 'dạy', 'ngoại', 'ngữ',
  // Thêm: từ hành chính/thường gặp + biến thể cũ/mới.
  'hà', 'nội', 'hồ', 'chí', 'minh', 'cộng', 'hòa', 'hoà', 'xã', 'hội', 'chủ',
  'nghĩa', 'việt', 'nam', 'độc', 'lập', 'tự', 'do', 'hạnh', 'phúc', 'văn',
  'bản', 'hành', 'chính', 'công', 'quyết', 'định', 'thông', 'tư', 'nghị',
  'chỉ', 'thị', 'báo', 'cáo', 'biên', 'kiểm', 'tra', 'giám', 'sát', 'hoạt',
  'động', 'học', 'sinh', 'viên', 'khoa', 'trường', 'đại', 'thành',
  'thuý', 'thúy', 'ủy', 'uỷ', 'quý', 'quí', 'gì', 'ghi', 'ơi', 'ê',
  'quyên', 'quyền', 'quyết', 'quỳnh', 'quýt', 'yên', 'yêu', 'yết',
  'mưa', 'mìa', 'mía', 'toà', 'tòa', 'hòa', 'hoà',
];
const MUST_NOT_HAVE = [
  // Chuỗi vô nghĩa / đặt dấu sai / chính tả sai (từ nhiệm vụ + mở rộng).
  'nguời', 'đưọc', 'xưoc', 'thuơng', 'trưòng', 'nguòi', 'đươc', 'xươc',
  // (Bỏ "ka" khỏi danh sách sai: "ka" CÓ trong đáp án tham chiếu — tên chữ cái
  // K / từ vay mượn — nên nó là âm tiết hợp lệ, không phải chuỗi sai.)
  'thuòng', 'quyề', 'giì', 'gii', 'ngia', 'gha', 'ngha', 'qoa',
  'caa', 'băc', 'ngươc',
];

let failed = false;
const missingValid = MUST_HAVE.filter((s) => !mine.has(s));
if (missingValid.length) {
  console.log(`\nASSERT LỖI: thiếu âm tiết đúng: ${missingValid.join(' ')}`);
  failed = true;
}
const presentInvalid = MUST_NOT_HAVE.filter((s) => mine.has(s));
if (presentInvalid.length) {
  console.log(`\nASSERT LỖI: chứa chuỗi sai: ${presentInvalid.join(' ')}`);
  failed = true;
}
if (coverage < 99.5) {
  console.log(`\nNGHIỆM THU LỖI: độ phủ ${coverage.toFixed(2)}% < 99,5%`);
  failed = true;
}
if (extraPct > 25) {
  console.log(`\nNGHIỆM THU LỖI: mục thừa ${extraPct.toFixed(2)}% > 25%`);
  failed = true;
}
if (!failed) console.log('\nĐẠT: độ phủ, mục thừa và assert đều đạt.');
process.exit(failed ? 1 : 0);
