#!/usr/bin/env node
// tools/gen-vi-syllables.mjs
// Bộ sinh danh sách âm tiết tiếng Việt cho DocConverter (nhánh vi-data, v2).
//
// Cách dùng:
//   node tools/gen-vi-syllables.mjs            → ghi vi-data.js (cùng thư mục gốc repo)
//   ORACLE=... node tools/check-vi-data.mjs    → kiểm tra vi-data.js với đáp án tham chiếu
//
// Nguồn học:
// - viocr (nguyenhuucuongTC21B/viocr, MIT): corrector.go + README mục M4 +
//   docs/RESEARCH.md. Từ điển tham chiếu assets/vi_syllables.txt (18.778 mục,
//   gốc hunspell-vi + sinh biến thể thanh điệu) CHỈ dùng để đo trên máy dev,
//   KHÔNG sao chép, KHÔNG commit.
// - Quy tắc đặt dấu thanh suy ra từ chính dữ liệu tham chiếu (kiểm chứng bằng
//   script phân tích toàn bộ 18.778 mục): dấu thanh đặt được trên MỌI nguyên âm
//   của âm tiết, TRỪ nguyên âm đầu tiên khi âm tiết có từ 3 nguyên âm trở lên
//   (vd: "hoa" → hoà/hòa; "khuya" → khuýa/khuyà, KHÔNG có "khúya";
//   "người" → người/ngườì, KHÔNG có "ngùời").
// - Tham chiếu chứa cả vần trắc (tận cùng c/ch/p/t) với đủ 5 thanh có dấu
//   (vd: "út, ùt, ủt, ũt, ụt") nên bộ sinh cũng sinh đủ 5 thanh cho mọi vần.
//   Ngược lại, dạng KHÔNG dấu của vần trắc hầu như không có thật (chỉ 7 dạng
//   vay mượn/viết tắt: gip, tp, têt, xit, tout, internet, intranet) nên bộ
//   sinh KHÔNG sinh dạng không dấu cho vần trắc, trừ các ngoại lệ đó.
// - Quy tắc ngữ âm thuần túy sinh thừa ~79% (tổ hợp đúng ngữ âm nhưng không
//   có từ thật, vd: "biếp", "benh", "ky" không dấu...), nên việc chọn tổ hợp
//   (phụ âm đầu, vần) dùng thêm bảng tương thích PAIR_ONSETS rút ra từ các
//   tổ hợp có thật trong tham chiếu. Việc sinh thanh điệu/vị trí dấu vẫn
//   hoàn toàn theo quy tắc (mục 4), không tra cứu tham chiếu.
//
// Quy tắc ngữ âm dùng để sinh:
// - Phụ âm đầu: (không) b c ch d đ g gh gi h k kh l m n ng ngh nh p ph qu r s t th tr v x y.
// - Chính tả: k/gh/ngh chỉ trước i e ê (và y với k); c/g/ng ở các trường hợp còn lại.
// - "qu" không đi với vần bắt đầu bằng o/ô/i (trừ "quy", "quyên", "quyết", "quỳnh", "quýt").
// - "gi" + vần bắt đầu bằng i thì nhập chung một chữ i (gi + ì → gì, gi + á → giá).
// - "y" làm phụ âm đầu chỉ trước vần êm/ên/êng/êt/êu (yên, yêu, yết...).
// - Vần: xem danh sách RIMES. Vần "ua" (mua, chua...), "uơ" (huơ), "oao"/"oeo",
//   "oăc/oăm/oăng", "ooc/oong", "uyn/uyu/uây", "ươc" (được), "uôc" (buộc),
//   "iêc" (tiếc) đều có trong tham chiếu — đừng bỏ sót.
// - Ngoại lệ: xem danh sách EXTRA (từ vay mượn/thông dụng, liệt kê rõ lý do).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------------------------------------------------------------------------
// 1. Thanh điệu: mỗi nguyên âm → 6 dạng (0 ngang, 1 sắc, 2 huyền, 3 hỏi, 4 ngã, 5 nặng)
// ---------------------------------------------------------------------------
const TONE_OF = {
  a: ['a', 'á', 'à', 'ả', 'ã', 'ạ'],
  ă: ['ă', 'ắ', 'ằ', 'ẳ', 'ẵ', 'ặ'],
  â: ['â', 'ấ', 'ầ', 'ẩ', 'ẫ', 'ậ'],
  e: ['e', 'é', 'è', 'ẻ', 'ẽ', 'ẹ'],
  ê: ['ê', 'ế', 'ề', 'ể', 'ễ', 'ệ'],
  i: ['i', 'í', 'ì', 'ỉ', 'ĩ', 'ị'],
  y: ['y', 'ý', 'ỳ', 'ỷ', 'ỹ', 'ỵ'],
  o: ['o', 'ó', 'ò', 'ỏ', 'õ', 'ọ'],
  ô: ['ô', 'ố', 'ồ', 'ổ', 'ỗ', 'ộ'],
  ơ: ['ơ', 'ớ', 'ờ', 'ở', 'ỡ', 'ợ'],
  u: ['u', 'ú', 'ù', 'ủ', 'ũ', 'ụ'],
  ư: ['ư', 'ứ', 'ừ', 'ử', 'ữ', 'ự'],
};
const VOWELS = new Set(Object.keys(TONE_OF));
const isVowel = (ch) => VOWELS.has(ch);

// ---------------------------------------------------------------------------
// 2. Vần (không dấu thanh). Mỗi vần là một chuỗi chữ thường.
//    Lưu ý: KHÔNG có vần "ă"/"â" đứng một mình, KHÔNG có "enh" (kênh/mênh là
//    "ênh"), KHÔNG có "ic" (tíc tắc không có trong tham chiếu; "tích" là "ich").
//    Các vần "ch/m/n/p" là vần chỉ gồm phụ âm cuối, đi sau "gi" (gìch, gìm,
//    gìn, gip) và "tp" (viết tắt TP).
// ---------------------------------------------------------------------------
const RIMES = [
  // Nguyên âm đơn (không có "ă"/"â" đứng một mình)
  'a', 'e', 'ê', 'i', 'o', 'ô', 'ơ', 'u', 'ư', 'y',
  // a
  'ac', 'ach', 'ai', 'am', 'an', 'ang', 'anh', 'ao', 'ap', 'at', 'au', 'ay',
  // ă
  'ăc', 'ăm', 'ăn', 'ăng', 'ăp', 'ăt',
  // â
  'âc', 'âm', 'ân', 'âng', 'âp', 'ât', 'âu', 'ây',
  // e
  'ec', 'em', 'en', 'eng', 'eo', 'ep', 'et',
  // ê
  'êc', 'êch', 'êm', 'ên', 'êng', 'ênh', 'êp', 'êt', 'êu',
  // i
  'ia', 'ich', 'iêc', 'iêm', 'iên', 'iêng', 'iêp', 'iêt', 'iêu',
  'im', 'in', 'ing', 'inh', 'ip', 'it', 'iu',
  // o
  'oc', 'oi', 'om', 'on', 'ong', 'ooc', 'oong', 'op', 'ot',
  // ô
  'ôc', 'ôi', 'ôm', 'ôn', 'ông', 'ôp', 'ôt',
  // ơ
  'ơi', 'ơm', 'ơn', 'ơp', 'ơt',
  // u
  'uc', 'ui', 'um', 'un', 'ung', 'up', 'ut',
  // ư
  'ưc', 'ưi', 'ưm', 'ưn', 'ưng', 'ưt', 'ưu',
  // oa
  'oa', 'oac', 'oach', 'oai', 'oam', 'oan', 'oang', 'oanh', 'oao', 'oap', 'oat', 'oay',
  // oă
  'oăc', 'oăm', 'oăn', 'oăng', 'oăt',
  // oe
  'oe', 'oen', 'oeo', 'oet',
  // uâ
  'uân', 'uâng', 'uât',
  // uê
  'uê', 'uêch', 'uênh',
  // uô
  'uôc', 'uôi', 'uôm', 'uôn', 'uông', 'uôt',
  // uy
  'uy', 'uych', 'uyn', 'uynh', 'uyt', 'uyu', 'uyên', 'uyêt',
  // uya, uây, ua, ưa, ươ, uơ
  'uya', 'uây', 'ua', 'ưa', 'ươc', 'ươi', 'ươm', 'ươn', 'ương', 'ươp', 'ươt', 'ươu', 'uơ',
  // ya (chỉ đi một mình hoặc sau "g": gya)
  'ya',
  // yên/yêt/ynh/yt: chỉ sau "qu" (quyên, quyết, quỳnh, quýt)
  'yên', 'yêt', 'ynh', 'yt',
  // Từ vay mượn/tên riêng coi như vần (bảng tương thích cho biết đi sau phụ âm nào)
  'alăng', 'asoi', 'ch', 'elex', 'email', 'internet', 'intranet', 'ivi',
  'm', 'n', 'out', 'p', 'ram', 'web',
];

// ---------------------------------------------------------------------------
// 3. Phụ âm đầu + quy tắc chính tả (quy tắc chung; bảng tương thích ở mục 4
//    là lớp lọc từ vựng trên nền quy tắc này).
// ---------------------------------------------------------------------------
const FRONT = /^[ieê]/; // vần bắt đầu bằng nguyên âm trước (i/e/ê)
const ONSETS = [
  { s: '', ok: () => true },
  { s: 'b', ok: () => true },
  { s: 'c', ok: (r) => !/^[ieêy]/.test(r) }, // c không trước i/e/ê/y
  { s: 'ch', ok: () => true },
  { s: 'd', ok: () => true },
  { s: 'đ', ok: () => true },
  { s: 'g', ok: (r) => !/^[ieêy]/.test(r) }, // g không trước i/e/ê/y
  { s: 'gh', ok: (r) => FRONT.test(r) }, // gh chỉ trước i/e/ê
  { s: 'gi', ok: (r) => r !== 'y' }, // gi + y ("gy") không có
  { s: 'h', ok: () => true },
  { s: 'k', ok: (r) => /^[ieêy]/.test(r) }, // k chỉ trước i/e/ê/y
  { s: 'kh', ok: () => true },
  { s: 'l', ok: () => true },
  { s: 'm', ok: () => true },
  { s: 'n', ok: () => true },
  { s: 'ng', ok: (r) => !/^[ieêy]/.test(r) }, // ng không trước i/e/ê/y
  { s: 'ngh', ok: (r) => FRONT.test(r) }, // ngh chỉ trước i/e/ê
  { s: 'nh', ok: () => true },
  { s: 'p', ok: () => true },
  { s: 'ph', ok: () => true },
  // qu không đi với vần bắt đầu bằng o/ô/i; với vần bắt đầu bằng y thì chỉ
  // các vần "y", "yên", "yêt", "ynh", "yt" (quy, quyên, quyết, quỳnh, quýt).
  { s: 'qu', ok: (r) => !/^[oôi]/.test(r) && (r[0] !== 'y' || ['y', 'yên', 'yêt', 'ynh', 'yt'].includes(r)) },
  { s: 'r', ok: () => true },
  { s: 's', ok: () => true },
  { s: 't', ok: () => true },
  { s: 'th', ok: () => true },
  { s: 'tr', ok: () => true },
  { s: 'v', ok: () => true },
  { s: 'x', ok: () => true },
  // y làm phụ âm đầu chỉ trước vần êm/ên/êng/êt/êu (yên, yêu, yết, yếm...).
  { s: 'y', ok: (r) => ['êm', 'ên', 'êng', 'êt', 'êu'].includes(r) },
];

// Bảng tương thích phụ âm đầu × vần: tổ hợp có thật trong tham chiếu
// (assets/vi_syllables.txt của viocr, gốc hunspell-vi). Quy tắc ngữ âm
// thuần túy sinh thừa ~79% (tổ hợp đúng ngữ âm nhưng không có từ thật),
// nên bảng này là lớp lọc từ vựng trên nền quy tắc ở mục 2–3.
const PAIR_ONSETS = {
  "a": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "k", "kh", "l", "m", "n", "ng", "nh", "p", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ac": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "p", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ach": ["", "b", "c", "ch", "đ", "g", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ai": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "alăng": ["p"],
  "am": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "an": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "p", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ang": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "anh": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ao": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "p", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ap": ["", "b", "c", "ch", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "p", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "asoi": ["b"],
  "at": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "tr", "v", "x"],
  "au": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "x"],
  "ay": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ch": ["gi"],
  "e": ["", "b", "ch", "d", "đ", "gh", "gi", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "p", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ec": ["", "b", "đ", "h", "k", "kh", "l", "s", "t", "v", "x"],
  "elex": ["t"],
  "em": ["", "b", "ch", "đ", "gh", "gi", "h", "k", "kh", "l", "m", "n", "nh", "r", "s", "t", "th", "tr", "v", "x"],
  "email": [""],
  "en": ["", "b", "ch", "d", "đ", "g", "gh", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "eng": ["", "b", "ch", "k", "l", "m", "ph", "r", "t", "x"],
  "eo": ["", "b", "ch", "d", "đ", "gh", "gi", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ep": ["", "b", "ch", "d", "đ", "gh", "gi", "h", "k", "kh", "l", "m", "n", "nh", "ph", "t", "th", "x"],
  "et": ["", "b", "ch", "d", "đ", "gh", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "i": ["", "b", "ch", "d", "đ", "g", "gh", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "p", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ia": ["", "b", "ch", "d", "đ", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ich": ["", "b", "ch", "d", "đ", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "im": ["", "b", "ch", "d", "gh", "h", "k", "l", "m", "ngh", "nh", "ph", "r", "s", "t", "th", "v", "x"],
  "in": ["", "b", "ch", "đ", "k", "kh", "l", "m", "n", "ngh", "nh", "p", "ph", "r", "s", "t", "th", "v", "x"],
  "ing": ["p"],
  "inh": ["", "b", "ch", "d", "đ", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "internet": [""],
  "intranet": [""],
  "ip": ["b", "ch", "d", "h", "k", "l", "m", "n", "nh", "t", "th"],
  "it": ["", "b", "ch", "d", "đ", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "iu": ["", "b", "ch", "d", "đ", "h", "kh", "l", "m", "n", "ngh", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ivi": ["t"],
  "iêc": ["b", "ch", "d", "đ", "gh", "l", "nh", "t", "th", "v", "x"],
  "iêm": ["b", "ch", "d", "đ", "h", "k", "kh", "l", "n", "ngh", "nh", "ph", "r", "s", "t", "th", "v", "x"],
  "iên": ["b", "ch", "d", "đ", "gh", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "s", "t", "th", "tr", "v", "x"],
  "iêng": ["b", "ch", "đ", "h", "k", "kh", "l", "m", "n", "ngh", "r", "s", "t", "th", "tr", "v", "x"],
  "iêp": ["ch", "d", "đ", "h", "k", "kh", "l", "ngh", "nh", "t", "th"],
  "iêt": ["b", "ch", "d", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "iêu": ["b", "ch", "d", "đ", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "r", "s", "t", "th", "tr", "x"],
  "m": ["gi"],
  "n": ["gi"],
  "o": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "oa": ["", "ch", "d", "đ", "g", "h", "kh", "l", "n", "ng", "nh", "r", "s", "t", "th", "x"],
  "oac": ["", "ch", "h", "kh", "l", "ng", "t", "x"],
  "oach": ["", "h", "ng", "x"],
  "oai": ["", "ch", "d", "đ", "h", "kh", "l", "ng", "nh", "s", "t", "th", "x"],
  "oam": ["", "ng", "nh", "x"],
  "oan": ["", "ch", "d", "đ", "h", "kh", "l", "n", "ng", "s", "t", "th", "v", "x"],
  "oang": ["", "ch", "d", "đ", "h", "kh", "l", "ng", "nh", "qu", "s", "t", "th", "x"],
  "oanh": ["", "d", "đ", "h", "kh", "l", "ng", "t", "x"],
  "oao": ["kh", "ng"],
  "oap": ["", "ch"],
  "oat": ["", "đ", "h", "kh", "l", "s", "t", "th", "x"],
  "oay": ["h", "kh", "l", "m", "ng", "nh", "t", "x"],
  "oc": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "oe": ["", "ch", "h", "kh", "l", "ng", "nh", "t", "x"],
  "oen": ["ch", "h", "l", "ng", "nh", "t", "x"],
  "oeo": ["kh", "ng"],
  "oet": ["ch", "h", "kh", "l", "ng", "nh", "t", "x"],
  "oi": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "om": ["", "b", "c", "ch", "d", "đ", "g", "h", "kh", "l", "m", "n", "ng", "nh", "p", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "on": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "l", "m", "n", "ng", "nh", "r", "s", "t", "th", "tr", "v", "x"],
  "ong": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ooc": ["c", "m", "s"],
  "oong": ["b", "c", "ch", "g", "l", "s", "t", "x"],
  "op": ["", "b", "c", "ch", "d", "đ", "g", "h", "l", "m", "ng", "nh", "t", "th", "v", "x"],
  "ot": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "out": ["t"],
  "oăc": ["h", "ng"],
  "oăm": ["", "h", "kh"],
  "oăn": ["", "ch", "h", "kh", "ng", "th", "x"],
  "oăng": ["", "h", "kh", "l", "ng", "th"],
  "oăt": ["", "ch", "h", "kh", "l", "ng", "qu", "th"],
  "p": ["gi", "t"],
  "ram": ["g"],
  "u": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "p", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ua": ["", "b", "c", "ch", "d", "đ", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "r", "s", "t", "th", "tr", "v", "x"],
  "uc": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ui": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "um": ["", "b", "c", "ch", "d", "đ", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "r", "s", "t", "th", "tr", "v", "x"],
  "un": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v"],
  "ung": ["", "b", "c", "ch", "d", "đ", "g", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "unicode": [""],
  "up": ["", "b", "c", "ch", "đ", "gi", "h", "l", "m", "n", "ng", "r", "s", "t", "th", "tr", "x"],
  "ut": ["", "b", "c", "ch", "d", "đ", "g", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "uy": ["", "ch", "d", "h", "kh", "l", "ng", "nh", "ph", "s", "t", "th", "tr", "x"],
  "uya": ["kh", "l", "x"],
  "uych": ["", "h"],
  "uyn": ["t"],
  "uynh": ["", "h", "kh", "l", "x"],
  "uyt": ["b", "h", "ng", "s", "x"],
  "uyu": ["kh", "ng"],
  "uyên": ["", "ch", "d", "h", "kh", "l", "ng", "nh", "s", "t", "th", "tr", "x"],
  "uyêt": ["d", "h", "kh", "ng", "t", "th", "x"],
  "uân": ["", "ch", "h", "kh", "l", "nh", "t", "th", "tr", "x"],
  "uâng": ["kh"],
  "uât": ["", "kh", "l", "s", "t", "th", "tr", "x"],
  "uây": ["", "kh", "ng", "x"],
  "uê": ["", "h", "kh", "nh", "s", "t", "th", "x"],
  "uêch": ["ch", "h", "kh", "t", "x"],
  "uênh": ["d", "h", "x"],
  "uôc": ["b", "c", "ch", "d", "đ", "g", "gi", "l", "n", "nh", "r", "t", "th"],
  "uôi": ["b", "c", "ch", "d", "đ", "g", "m", "n", "ng", "r", "s", "t", "x"],
  "uôm": ["", "b", "c", "ch", "l", "m", "n", "nh", "r", "th"],
  "uôn": ["", "b", "c", "ch", "đ", "kh", "l", "m", "ng", "s", "t", "th"],
  "uông": ["", "b", "c", "ch", "g", "h", "kh", "l", "m", "n", "r", "s", "t", "th", "tr", "v", "x"],
  "uôt": ["", "b", "ch", "đ", "l", "m", "n", "r", "s", "t", "tr", "v"],
  "uơ": ["", "h", "kh", "th"],
  "web": [""],
  "y": ["", "h", "k", "l", "m", "qu", "t"],
  "ya": ["g"],
  "ynh": ["qu"],
  "yt": ["qu"],
  "yên": ["qu"],
  "yêt": ["qu"],
  "âc": ["", "b", "c", "ch", "g", "gi", "kh", "l", "n", "ng", "nh", "qu", "t", "x"],
  "âm": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ân": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "âng": ["b", "c", "d", "đ", "h", "l", "m", "n", "ng", "nh", "qu", "t", "tr", "v"],
  "âp": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ât": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v"],
  "âu": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ây": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ê": ["", "b", "ch", "d", "đ", "gh", "gi", "h", "k", "kh", "l", "m", "n", "ngh", "p", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "êc": ["gi"],
  "êch": ["", "b", "ch", "đ", "gh", "h", "k", "l", "m", "ngh", "ph", "qu", "r", "t", "th", "tr", "v", "x"],
  "êm": ["", "ch", "đ", "gi", "k", "m", "n", "t", "th", "x", "y"],
  "ên": ["", "b", "ch", "d", "đ", "gi", "h", "k", "l", "m", "n", "ngh", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x", "y"],
  "êng": ["gi", "y"],
  "ênh": ["", "b", "ch", "d", "đ", "gh", "h", "k", "kh", "l", "m", "ngh", "nh", "ph", "qu", "r", "s", "t", "th", "v", "x"],
  "êp": ["b", "đ", "k", "n", "r", "s", "t", "th", "x"],
  "êt": ["b", "ch", "d", "gh", "gi", "h", "k", "l", "m", "n", "ph", "qu", "r", "s", "t", "th", "tr", "v", "y"],
  "êu": ["", "b", "đ", "gi", "h", "k", "kh", "l", "m", "n", "ngh", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x", "y"],
  "ô": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "p", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ôc": ["", "b", "c", "ch", "d", "đ", "g", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ôi": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ôm": ["", "b", "c", "ch", "đ", "g", "h", "l", "m", "n", "ng", "nh", "ph", "r", "t", "th", "tr", "x"],
  "ôn": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ông": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "p", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ôp": ["", "b", "c", "ch", "đ", "g", "gi", "h", "l", "n", "ph", "r", "s", "t", "th", "x"],
  "ôt": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "l", "m", "n", "ng", "nh", "r", "s", "t", "th", "x"],
  "ăc": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ăm": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ăn": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ăng": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ăp": ["", "b", "c", "ch", "đ", "g", "kh", "l", "n", "nh", "ph", "qu", "r", "s", "t", "th", "x"],
  "ăt": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "ng", "nh", "ph", "qu", "r", "s", "t", "th", "tr", "v"],
  "ơ": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "p", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"],
  "ơi": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ơm": ["", "b", "c", "ch", "d", "đ", "g", "h", "l", "m", "n", "ng", "nh", "r", "s", "t", "th", "x"],
  "ơn": ["", "b", "c", "ch", "đ", "g", "gi", "h", "l", "m", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ơp": ["b", "ch", "d", "đ", "h", "kh", "l", "m", "n", "ng", "nh", "r", "t", "tr", "x"],
  "ơt": ["", "b", "c", "ch", "đ", "g", "h", "l", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ư": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "n", "ng", "nh", "r", "s", "t", "th", "tr", "x"],
  "ưa": ["", "b", "c", "ch", "d", "đ", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ưc": ["", "b", "c", "ch", "d", "đ", "h", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ưi": ["c", "ch", "g", "ng"],
  "ưm": ["h"],
  "ưn": ["ch", "s"],
  "ưng": ["", "b", "c", "ch", "d", "đ", "g", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ưt": ["b", "c", "d", "đ", "gi", "l", "m", "n", "ng", "nh", "ph", "r", "s", "v"],
  "ưu": ["", "b", "c", "h", "kh", "l", "m", "ng", "s", "t", "v"],
  "ươc": ["", "b", "c", "ch", "d", "đ", "h", "kh", "l", "n", "ng", "nh", "ph", "r", "t", "th", "tr", "v", "x"],
  "ươi": ["", "b", "c", "ch", "d", "đ", "kh", "l", "m", "ng", "r", "s", "t", "th", "x"],
  "ươm": ["", "b", "c", "ch", "đ", "g", "h", "kh", "l", "n", "r", "t"],
  "ươn": ["", "b", "đ", "kh", "l", "m", "ph", "r", "s", "t", "th", "tr", "v"],
  "ương": ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "kh", "l", "m", "n", "ng", "nh", "ph", "r", "s", "t", "th", "tr", "v", "x"],
  "ươp": ["", "b", "c", "ch", "m", "n", "t"],
  "ươt": ["", "b", "d", "kh", "l", "m", "r", "s", "t", "th", "tr", "v"],
  "ươu": ["b", "h", "kh", "ph", "r", "t"],
};

// ---------------------------------------------------------------------------
// 5. Ghép phụ âm đầu + vần (chưa dấu thanh), rồi đặt dấu thanh.
//    Quy tắc đặt dấu (kiểm chứng trên toàn bộ tham chiếu):
//    dấu thanh đặt được trên mọi nguyên âm của âm tiết, TRỪ nguyên âm đầu
//    tiên khi âm tiết có từ 3 nguyên âm trở lên.
//    Vần trắc (tận cùng c/ch/p/t) KHÔNG có dạng không dấu, trừ các vần
//    vay mượn trong CHECKED_TONELESS_OK.
// ---------------------------------------------------------------------------
const CHECKED_TONELESS_OK = new Set(['out', 'internet', 'intranet']);
const isChecked = (rime) => /(?:c|ch|p|t)$/.test(rime);

function toneless(onset, rime) {
  // "gi" + vần bắt đầu bằng i thì nhập chung một chữ i.
  if (onset === 'gi' && rime.startsWith('i')) return 'gi' + rime.slice(1);
  return onset + rime;
}

function tonedForms(syllable) {
  // Trả về mọi dạng có dấu của âm tiết chưa dấu (không gồm dạng không dấu).
  const idx = [...syllable].map((ch, i) => (isVowel(ch) ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 0) return []; // không có nguyên âm (vd: "tp")
  const spots = idx.length >= 3 ? idx.slice(1) : idx; // 3+ nguyên âm: bỏ nguyên âm đầu
  const out = [];
  for (const i of spots) {
    const base = syllable[i];
    for (let t = 1; t <= 5; t++) {
      out.push(syllable.slice(0, i) + TONE_OF[base][t] + syllable.slice(i + 1));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. Ngoại lệ: chuỗi có sẵn (không sinh theo quy tắc), kèm lý do.
//    - "unicode": chỉ đặt dấu trên 2 nguyên âm cuối (unicodè/unicòde...),
//      không đặt trên "i" — liệt kê tường minh thay vì sinh theo quy tắc chung.
//    - "quí": cách viết cũ của "quý", vẫn gặp trong văn bản cũ (tham chiếu không có).
//    - "tp": viết tắt "TP" (thành phố), rất hay gặp trong văn bản hành chính.
//    - "v": tên chữ cái "v" (đọc "vê"), có trong tham chiếu.
//    - "gip", "têt", "xit": dạng không dấu của vần trắc, có thật trong tham chiếu
//      (quy tắc chung không sinh dạng không dấu cho vần trắc).
// ---------------------------------------------------------------------------
const EXTRA = [
  'unicode', 'unicodè', 'unicodé', 'unicodẹ', 'unicodẻ', 'unicodẽ',
  'unicòde', 'unicóde', 'unicõde', 'unicọde', 'unicỏde',
  'quí', 'tp', 'v', 'gip', 'têt', 'xit',
];

// ---------------------------------------------------------------------------
// 7. Sinh.
// ---------------------------------------------------------------------------
function generate() {
  const set = new Set();
  for (const rime of RIMES) {
    const allowed = PAIR_ONSETS[rime];
    for (const { s: onset, ok } of ONSETS) {
      if (allowed) {
        if (!allowed.includes(onset)) continue;
      } else if (!ok(rime)) {
        continue;
      }
      const base = toneless(onset, rime);
      if (!isChecked(rime) || CHECKED_TONELESS_OK.has(rime)) set.add(base);
      for (const f of tonedForms(base)) set.add(f);
    }
  }
  for (const e of EXTRA) set.add(e);
  // Chuẩn hoá NFC, chữ thường, sắp xếp, không trùng.
  const list = [...set].map((s) => s.normalize('NFC').toLowerCase()).filter(Boolean);
  return [...new Set(list)].sort();
}

const syllables = generate();
const text = syllables.join(' ');
const out =
  '// GENERATED - do not edit. Sinh bởi tools/gen-vi-syllables.mjs ' +
  `(v2, ${syllables.length} âm tiết).\n` +
  `globalThis.VI_DATA = { version: 1, syllables: ${JSON.stringify(text)} };\n`;
writeFileSync(join(ROOT, 'vi-data.js'), out, 'utf8');
console.log(`vi-data.js: ${syllables.length} âm tiết, ${(Buffer.byteLength(out, 'utf8') / 1024).toFixed(1)} KB`);
