#!/usr/bin/env python3
# tools/gen-vi-freq.py
# Sinh danh sách tần suất âm tiết tiếng Việt cho DocConverter (nhánh vi-freq).
#
# Cách dùng (cần Python + gói wordfreq, cài 1 lần):
#   pip install wordfreq
#   python3 tools/gen-vi-freq.py        → ghi vi-freq.js (cùng thư mục gốc repo)
#   node tools/check-vi-freq.mjs        → kiểm tra vi-freq.js
#
# Nguồn tần suất:
# - wordfreq (rspeer/wordfreq, MIT) — danh sách tần suất từ tiếng Việt ("vi"),
#   xây từ Wikipedia + OpenSubtitles + các nguồn khác. Hàm get_frequency_dict
#   trả về tần suất tương đối của mỗi từ (tổng ≈ 1). Chỉ giữ lại các mục là
#   âm tiết hợp lệ trong vi-data.js (lọc bỏ số, tên riêng nước ngoài, từ
#   không phải âm tiết) — còn 4.647/19.101 âm tiết, chiếm 94,5% khối lượng
#   tần suất của danh sách gốc.
# - Đã thử nguồn Wikipedia-only (VocabFreq middle tier, top-100k) nhưng
#   "dan" (tên riêng nước ngoài) còn cao hơn "dán" trong nguồn đó, nên
#   wordfreq — nơi "dán" xếp trên "dan" — phù hợp hơn cho việc bắt lỗi
#   mất dấu.
#
# Định dạng đầu ra (vi-freq.js, GENERATED):
#   globalThis.VI_FREQ = { version: 1, freq: "là:18200 và:14800 ... dân:1660 dán:21 dan:16 ..." };
# - freq là một chuỗi, mỗi mục "âm tiết:điểm" cách nhau bằng một dấu cách,
#   xếp theo điểm giảm dần. Điểm = số lần xuất hiện trên 1 triệu token
#   (làm tròn, số nguyên >= 1). App tra điểm của từng biến thể có dấu của
#   một token không dấu để xếp hạng ứng viên sửa lỗi.
# - Ví dụ "Dan": dàn:66, dán:21, dan:16 — token không dấu "dan" không phải
#   ứng viên đứng đầu, nên app gắn cờ và gợi ý "dàn"/"dán" (ngữ cảnh sẽ
#   chọn "dán"). Lưu ý: "dan" vẫn có điểm 16/triệu (chủ yếu do tên riêng
#   nước ngoài "Dan"), nên tần suất chỉ xếp hạng ứng viên, không kết luận
#   một mình.
#
# Giấy phép: dữ liệu wordfreq dẫn xuất từ Wikipedia (CC BY-SA) và các
# nguồn khác; xem ghi chú trong file wordfreq. Chỉ commit file vi-freq.js
# đã rút gọn, không commit toàn bộ danh sách gốc.

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def load_vi_data() -> set:
    text = (ROOT / "vi-data.js").read_text(encoding="utf-8")
    m = re.search(r'syllables:\s*"([^"]*)"', text)
    if not m:
        raise SystemExit("không đọc được vi-data.js")
    return set(nfc(s) for s in m.group(1).split() if s)


def main() -> None:
    try:
        import wordfreq
    except ImportError:
        raise SystemExit("chưa có gói wordfreq — chạy: pip install wordfreq")
    vi = load_vi_data()
    freq = wordfreq.get_frequency_dict("vi")
    # Chỉ giữ âm tiết hợp lệ trong vi-data; điểm = số lần / 1 triệu token.
    scored = {}
    for word, f in freq.items():
        w = nfc(word.strip().lower())
        if w in vi:
            score = int(round(f * 1_000_000))
            if score >= 1:
                scored[w] = score
    # Xếp theo điểm giảm dần, rồi theo tên để ổn định.
    items = sorted(scored.items(), key=lambda kv: (-kv[1], kv[0]))
    body = " ".join(f"{w}:{s}" for w, s in items)
    out = (
        "// GENERATED - do not edit. "
        f"Sinh bởi tools/gen-vi-freq.py (wordfreq vi, {len(items)} âm tiết).\n"
        f"globalThis.VI_FREQ = {{ version: 1, freq: {json.dumps(body, ensure_ascii=False)} }};\n"
    )
    (ROOT / "vi-freq.js").write_text(out, encoding="utf-8")
    size_kb = len(out.encode("utf-8")) / 1024
    print(f"vi-freq.js: {len(items)} âm tiết, {size_kb:.1f} KB")
    print(f"điểm cao nhất: {items[0][0]}:{items[0][1]} | thấp nhất: {items[-1][0]}:{items[-1][1]}")


if __name__ == "__main__":
    main()
