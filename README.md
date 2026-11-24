# DocConverter

Web-app chuyển tài liệu → Markdown / Word / HTML / TXT / JSON / Excel / CSV, có OCR tiếng Việt cho PDF scan & ảnh chụp.
Chạy 100% trong trình duyệt (không server, không gửi file đi đâu). Thư viện đã được nhúng sẵn trong `libs/` nên chạy được offline.

## Chạy thử
```bash
cd doc-converter && python3 -m http.server 8000   # rồi mở http://localhost:8000
```
(Không mở bằng file:// vì trình duyệt chặn Web Worker.)

## Deploy GitHub Pages
Đẩy cả thư mục lên repo → Settings → Pages → chọn branch/root.

## Hỗ trợ
PDF (chữ + scan/ảnh), ảnh (jpg/png/webp/bmp/gif), docx, xlsx/xls/ods/csv/tsv, pptx, html, epub, zip (đệ quy), xml/rss, json, ipynb, txt/md.
Chưa hỗ trợ: .doc/.ppt/.rtf cũ (hãy Lưu thành .docx/.pptx), audio.



## Hai dạng Word
Mỗi file có 2 nút: **Word chuẩn thể thức** (theo bộ mẫu V-Format/NĐ 30) và **Word gốc (raw)** (giữ bố cục như nhận dạng được). Nút "Tải tất cả (.zip)" chứa cả hai.

## Ghi chú / sơ đồ viết tay
Chọn "Loại tài liệu: Ghi chú / bài giải / sơ đồ viết tay" + công cụ AI (Gemini/Claude). Sơ đồ được diễn đạt thành bảng/danh sách, phần tô vàng giữ nguyên highlight, và có thể chèn ảnh gốc vào cuối file Word.

## Markdown: 2 dạng
- **.md thuần**: Markdown sạch, không có thẻ HTML (bảng đầu trang tách thành các đoạn theo cột).
- **.md có format**: có thẻ HTML nhỏ (căn giữa, bảng không viền, đậm…) để dựng lại bố cục.

## AI (khung "🤖 AI" ngay dưới ô kéo thả)
Chọn Gemini/Claude, dán API key, bấm "Kiểm tra key". Dùng cho: OCR chính xác + chữ viết tay, "✨ AI soát lỗi", và "🎨 Tóm tắt trực quan" (trang HTML có thẻ, số liệu, sơ đồ SVG).

## Bảng (nhiều cột, ô gộp)
- Tesseract: tự dò khung kẻ (tables.js), OCR từng ô, nhận diện ô gộp (rowspan/colspan). Bảng rộng (≥9 cột) tự xuất Word khổ ngang. Excel giữ ô gộp.
- AI: chép bảng thành HTML có rowspan/colspan (chính xác hơn nhiều với bảng lớn/ảnh mờ).

## 🔍 AI soát chỗ có thể lỗi
Đối chiếu ảnh gốc ↔ văn bản, liệt kê chỗ đáng ngờ (nhầm ký tự, số liệu, tổng không khớp, bảng lệch cột...). Mỗi mục có "Tới chỗ" và "Áp dụng".

## Cách dùng AI tiết kiệm token
Mặc định ("Tesseract đọc trước, AI chỉ sửa chỗ sai"): Tesseract OCR cả file (nhanh, miễn phí), sau đó AI nhận ảnh + văn bản và chỉ trả về danh sách chỗ cần sửa (JSON nhỏ), app tự áp dụng và liệt kê để bạn xem/hoàn tác. Chọn "AI đọc toàn bộ" nếu cần đọc chữ viết tay (tài liệu viết tay luôn dùng AI đọc toàn bộ).

## Khung "Văn bản (sửa được)" và lọc chữ rác
- Tab "Văn bản" chỉ hiển thị chữ thuần (không ký hiệu); sửa ở đây được ánh xạ ngược vào bản có định dạng nên Word/Markdown có format vẫn giữ căn lề, bảng, in đậm. Ký hiệu bố cục nằm ở tab "Markdown + bố cục".
- "Lọc chữ rác ở vùng không phải chữ": bỏ vùng Tesseract nhận là hình/nhiễu/đường kẻ, từ có độ tin cậy thấp, ký hiệu lẻ; loại mực xanh và dấu đỏ khi làm sạch ảnh; AI sửa lỗi cũng xoá đoạn rác.
