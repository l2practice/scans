/* UI translations only. OCR text, filenames, and document previews are left untouched. */
(() => {
  const viToEn = {
    'Chủ đề':'Theme','Ngôn ngữ':'Language','Giao diện và ngôn ngữ':'Theme and language','Sáng':'Light','Tối':'Dark',
    'Chuyển PDF, Word, Excel, PowerPoint, HTML, EPUB, ZIP, ảnh… sang Markdown / Word / HTML / TXT / JSON / Excel. PDF scan hoặc ảnh chụp công văn sẽ tự OCR (tiếng Việt). Xử lý ngay trong trình duyệt.':'Convert PDF, Word, Excel, PowerPoint, HTML, EPUB, ZIP, and images to Markdown, Word, HTML, TXT, JSON, or Excel. Scanned PDFs and document photos are OCR-processed in your browser.',
    'Kéo thả file vào đây':'Drop files here','pdf · docx · xlsx/xls/csv · pptx · html · epub · zip · json/xml/ipynb · txt/md · jpg/png/webp…':'pdf · docx · xlsx/xls/csv · pptx · html · epub · zip · json/xml/ipynb · txt/md · jpg/png/webp…','Có thể chọn nhiều file / nhiều ảnh cùng lúc.':'Select multiple files or images at once.',
    '📷 Quét bằng camera':'📷 Scan with camera','📁 Chọn file':'📁 Choose files',
    '🤖 AI – chính xác hơn, đọc được chữ viết tay, tóm tắt trực quan':'🤖 AI – higher accuracy, handwriting recognition, visual summaries','Đang tắt':'Off',
    'Công cụ OCR & AI':'OCR & AI engine','Tesseract (offline, miễn phí, chỉ chữ in)':'Tesseract (offline, free, printed text only)','Cách dùng AI':'AI mode','Tesseract đọc trước, AI chỉ sửa chỗ sai (nhanh, tiết kiệm token) ⭐':'Tesseract reads first; AI fixes errors only (fast, fewer tokens) ⭐','AI đọc toàn bộ ảnh (chậm, tốn token; tốt nhất cho chữ viết tay)':'AI reads the entire image (slower, more tokens; best for handwriting)','Dán API key vào đây':'Paste your API key','Hiện/ẩn key':'Show or hide key','Chọn model AI (tự tải danh sách khi có key)':'Choose an AI model (list loads when a key is available)','Tải lại danh sách model':'Reload model list','Kiểm tra key':'Test key',
    'Lấy key:':'Get a key:','(có gói miễn phí) ·':'(free tier available) ·','Key chỉ lưu trong trình duyệt này và gửi thẳng tới nhà cung cấp. Khi dùng AI, ảnh/văn bản được gửi lên máy chủ của họ – đừng dùng cho văn bản mật.':'Your key is stored only in this browser and sent directly to the provider. When using AI, images and text are sent to their servers. Do not use this with confidential documents.',
    'Chưa bật AI: app dùng Tesseract (chỉ chữ in). Chọn Gemini hoặc Claude rồi dán API key để đọc chữ viết tay, OCR chính xác hơn và dùng nút “Tóm tắt trực quan”.':'AI is off: the app uses Tesseract for printed text. Choose Gemini or Claude and add an API key for handwriting recognition, more accurate OCR, and visual summaries.',
    'Tuỳ chọn':'Options','Định dạng khác (ngoài 2 nút Word)':'Other output formats (besides the two Word options)','Markdown thuần (.md)':'Plain Markdown (.md)','Markdown có format (.md)':'Formatted Markdown (.md)','Văn bản thuần (.txt)':'Plain text (.txt)','HTML (.html)':'HTML (.html)','JSON (.json)':'JSON (.json)','Excel – các bảng (.xlsx)':'Excel – tables (.xlsx)','CSV – các bảng (.csv)':'CSV – tables (.csv)',
    'Cỡ chữ nội dung (Word chuẩn thể thức)':'Body font size (official Word format)','13,5 pt · giãn dòng 1,35 (mẫu Báo cáo, Biên bản)':'13.5 pt · 1.35 line spacing (report and minutes template)','14 pt · giãn dòng 1,15 (mẫu Chỉ thị)':'14 pt · 1.15 line spacing (directive template)','13 pt · giãn dòng 1,2':'13 pt · 1.2 line spacing',
    'Loại tài liệu':'Document type','Văn bản hành chính (công văn, quyết định…)':'Official document (letters, decisions…)','Ghi chú / bài giải / sơ đồ viết tay':'Notes / handwritten work / diagrams','Chế độ PDF':'PDF mode','Tự động (trang không có chữ → OCR)':'Automatic (OCR pages without text)','Luôn OCR mọi trang':'Always OCR every page','Không OCR (chỉ lấy lớp chữ có sẵn)':'No OCR (extract existing text only)','Ngôn ngữ OCR (Tesseract)':'OCR language (Tesseract)','Tiếng Việt + English':'Vietnamese + English','Tiếng Việt':'Vietnamese',
    'Giữ bố cục văn bản hành chính':'Preserve official document layout','Căn giữa/phải/đều, thụt đầu dòng, bảng 2 cột quốc hiệu – cơ quan, in đậm, ngắt trang. Tắt nếu muốn Markdown thuần.':'Preserves alignment, indentation, two-column header tables, bold text, and page breaks. Turn off for plain Markdown.','Lọc chữ rác ở vùng không phải chữ':'Remove OCR noise from non-text areas','Bỏ chữ ký, con dấu, hình, đường kẻ bị đọc nhầm thành chữ; khi làm sạch ảnh cũng loại mực xanh và dấu đỏ.':'Removes signatures, stamps, images, and lines misread as text. Image cleanup also removes blue ink and red stamps.','Dò bảng có đường kẻ (Tesseract)':'Detect ruled tables (Tesseract)','Tự tìm khung bảng, OCR từng ô, nhận diện ô gộp. Bảng lớn nên dùng AI.':'Finds table borders, OCRs each cell, and detects merged cells. AI works better for large tables.','Làm sạch ảnh trước khi OCR':'Clean images before OCR','Khử bóng, tăng tương phản, loại dấu đỏ (Tesseract).':'Removes shadows, increases contrast, and removes red stamps (Tesseract).','Giữ nguyên ngắt dòng':'Keep line breaks','Tắt thì các dòng được gộp thành đoạn.':'Turn off to combine lines into paragraphs.','Chèn ảnh gốc vào cuối file Word':'Append original images to the Word file','Hữu ích với sơ đồ, hình vẽ, chữ viết tay (giữ lại bản gốc để đối chiếu).':'Useful for diagrams, drawings, and handwriting; keeps the original for comparison.','Gộp các ảnh được chọn thành 1 tài liệu':'Combine selected images into one document','Mỗi ảnh là một trang (sắp theo tên file).':'Each image becomes a page, sorted by filename.',
    'Xoá danh sách':'Clear list','Tải tất cả (.zip)':'Download all (.zip)','Lần OCR đầu tiên sẽ nạp mô hình (chạy offline sau đó). Kết quả OCR luôn cần đọc soát lại: sửa trực tiếp trong khung văn bản trước khi tải xuống.':'The OCR model downloads the first time and works offline afterward. Always review OCR results and edit them in the text box before downloading.',
    'Đặt tài liệu vào khung, giữ máy thẳng và đủ sáng':'Place the document in the frame; hold your device steady in good light.','💾 Lưu ảnh vào thư viện máy khi bấm Xong':'💾 Save images to your library when you tap Done','Huỷ':'Cancel','Chụp':'Capture','Xong':'Done','Biểu tượng quét tài liệu':'Document scanning logo',
    'Văn bản (sửa được)':'Text (editable)','Xem trước':'Preview','Markdown + bố cục':'Markdown + layout','⬇ Word chuẩn thể thức':'⬇ Official Word format','⬇ Word gốc (raw)':'⬇ Original Word (raw)','Tải xuống':'Download','Sao chép toàn bộ văn bản (đúng như đang hiển thị ở tab Văn bản)':'Copy all text as shown in the Text tab','✓ Đã sao chép':'✓ Copied','📋 Sao chép văn bản':'📋 Copy text','Markdown sạch, không có thẻ HTML':'Plain Markdown without HTML tags','⬇ .md thuần':'⬇ Plain .md','Markdown có thẻ HTML giữ bố cục (căn giữa, bảng, đậm…)':'Markdown with HTML to preserve layout (alignment, tables, bold…)','⬇ .md có format':'⬇ Formatted .md','🎨 Tóm tắt trực quan':'🎨 Visual summary','🔍 AI soát chỗ có thể lỗi':'🔍 Review possible OCR errors','✨ AI sửa lỗi OCR':'✨ Fix OCR errors','Lưu ảnh gốc vào thư viện ảnh (điện thoại) hoặc tải về (máy tính)':'Save the original image to your phone library or download it on a computer','💾 Lưu ảnh gốc':'💾 Save original image','Sao chép Markdown':'Copy Markdown','Đã sao chép Markdown thuần':'Plain Markdown copied','Chuyển lại':'Retry','Xoá':'Delete',
    'Chỉ chữ thuần – định dạng (căn lề, bảng, in đậm…) vẫn được giữ khi tải Word/Markdown. Không sửa xuyên qua nhiều ô bảng; cần xem ký hiệu bố cục thì mở tab "Markdown + bố cục".':'Plain text only. Formatting (alignment, tables, bold, etc.) is preserved in Word and Markdown downloads. Edit table cells individually. Open the “Markdown + layout” tab to view layout markers.',
    'Ký hiệu bố cục: {giữa} {phải} {đều} = căn lề · {thụt} = thụt đầu dòng · {p} = đoạn nguyên văn · **đậm** · *nghiêng* · {bảng…} = bảng đầu trang không viền (ô bắt đầu bằng < ^ > = căn trái/giữa/phải, ¦ ngăn cột).':'Layout markers: {giữa} {phải} {đều} = alignment · {thụt} = indent · {p} = verbatim paragraph · **bold** · *italic* · {bảng…} = borderless header table (< ^ > align left/center/right; ¦ separates columns).',
    'Chờ':'Waiting','Đang xử lý':'Processing','Lỗi':'Error','Bắt đầu…':'Starting…','Kết quả trống.':'Empty result.','Không trích được chữ nào. Thử chế độ "Luôn OCR mọi trang".':'No text found. Try “Always OCR every page”.','Không nhận dạng được chữ.':'No text recognized.','Word (ảnh nhúng được bỏ qua)':'Word (embedded images skipped)','Văn bản':'Text','Ảnh quét':'Scanned image','Tải trang tóm tắt (.html)':'Download summary page (.html)','Mở tab mới / In → PDF':'Open in new tab / Print → PDF','Làm lại':'Regenerate','Tới chỗ':'Go to text','Áp dụng':'Apply','Hoàn tác tất cả sửa của AI':'Undo all AI fixes','Không tìm thấy đoạn này trong văn bản (có thể đã sửa).':'Could not find this text (it may have been edited).','Không tìm thấy đoạn này (có thể đã sửa).':'Could not find this text (it may have been edited).',
    'Đang nén…':'Compressing…','Đang thử…':'Testing…','AI đang sửa lỗi…':'AI is fixing errors…','AI đang đối chiếu…':'AI is reviewing…','AI đang thiết kế…':'AI is designing…','AI đang dựng trang tóm tắt (30–90 giây)…':'AI is creating the summary page (30–90 seconds)…','AI không phát hiện chỗ đáng ngờ.':'AI found no suspicious text.','Không tạo được: ':'Could not create: ','Không kiểm tra được: ':'Could not review: ','Không xuất được: ':'Could not export: ','Lỗi: ':'Error: ','Hãy dán API key trước.':'Paste an API key first.','Hãy chọn Gemini hoặc Claude và dán API key ở khung "🤖 AI".':'Choose Gemini or Claude and paste an API key in the “🤖 AI” section.','Tính năng này cần AI: chọn Gemini hoặc Claude và dán API key ở khung "🤖 AI" phía trên.':'This feature requires AI: choose Gemini or Claude and paste an API key in the AI section above.','Ghi chú/sơ đồ viết tay cần công cụ AI (Gemini hoặc Claude). Hãy chọn trong mục Tuỳ chọn → Công cụ OCR.':'Handwritten notes and diagrams require Gemini or Claude. Choose an AI engine in Options → OCR & AI engine.','Chưa có API key':'No API key provided','Đang tắt – dùng Tesseract':'Off – using Tesseract',' · đã có key':' · API key set',' · thiếu API key':' · API key missing','⭐ khuyên dùng':'⭐ recommended','— chưa tải danh sách: dán API key hoặc bấm ↻ —':'— Model list not loaded: paste an API key or tap ↻ —','✓ Key hoạt động (':'✓ API key works (','Nhận diện thể thức (cho nút Word chuẩn) → ':'Document format detected (for official Word export) → ','Không phân tích được: ':'Could not analyze: ','Ảnh · OCR bằng AI (':'Image · AI OCR (','Ảnh OCR · độ tin cậy ~':'Image OCR · confidence ~',' · độ tin cậy ~':' · confidence ~',' · bảng':' · tables',' trang OCR':' OCR pages',' bảng':' tables',' · ':' · '
  };
  const enToVi = Object.fromEntries(Object.entries(viToEn).map(([vi, en]) => [en, vi]));
  const dynamic = [
    [/^(\d+)\/(\d+) file đã xong$/,(_,d,t)=>`${d}/${t} files completed`],
    [/^Tải \.(.+)$/,(_,ext)=>`Download .${ext}`],
    [/^(\d+) ảnh$/,(_,n)=>`${n} images`],
    [/^(\d+) file$/,(_,n)=>`${n} files`],
    [/^(\d+) mục$/,(_,n)=>`${n} items`],
    [/^Ảnh · OCR bằng AI \((Gemini|Claude)\)$/,(_,name)=>`Image · AI OCR (${name})`],
    [/^(.+) · OCR bằng AI \((Gemini|Claude)\)$/,(_,type,name)=>`${type === 'Ảnh' ? 'Image' : type} · AI OCR (${name})`],
    [/^Ảnh OCR · độ tin cậy ~([\d.]+)%$/,(_,n)=>`Image OCR · confidence ~${n}%`],
    [/^Ảnh OCR · độ tin cậy ~([\d.]+)% · (\d+) bảng$/,(_,n,t)=>`Image OCR · confidence ~${n}% · ${t} tables`],
    [/^(Gemini|Claude) · đã có key$/ ,(_,name)=>`${name} · API key set`],
    [/^(Gemini|Claude) · thiếu API key$/ ,(_,name)=>`${name} · API key missing`],
    [/^(Gemini|Claude) lỗi (\d+)(:.*)$/,(_,name,status,rest)=>`${name} error ${status}${rest}`],
    [/^Không xuất được: (.+)$/,(_,message)=>`Could not export: ${message}`],
    [/^AI chưa sửa được: (.+)$/,(_,message)=>`AI could not fix the text: ${message}`],
    [/^AI chưa sửa được \((.+)\) – giữ kết quả Tesseract; bấm "✨ AI sửa lỗi OCR" để thử lại\.$/,(_,message)=>`AI could not fix the text (${message}). The Tesseract result was kept; tap “✨ Fix OCR errors” to try again.`],
    [/^Không tạo được: (.+)$/,(_,message)=>`Could not create: ${message}`],
    [/^Không kiểm tra được: (.+)$/,(_,message)=>`Could not review: ${message}`],
    [/^(\d+) trang OCR · độ tin cậy ~([\d.]+)% \((Gemini|Claude)\)$/,(_,pages,n,engine)=>`${pages} OCR pages · confidence ~${n}% (${engine})`],
    [/^(\d+) trang OCR · độ tin cậy ~([\d.]+)%$/,(_,pages,n)=>`${pages} OCR pages · confidence ~${n}%`],
    [/^Trang (.+) OCR kém tin cậy – hãy soát lại \(thử bật "Làm sạch ảnh", hoặc dùng chế độ AI\)\.$/,(_,pages)=>`Pages ${pages} had low OCR confidence – review them (try “Clean images before OCR” or use AI).`],
    [/^(\d+) ảnh OCR kém tin cậy hoặc trống – hãy soát lại\.$/,(_,n)=>`${n} images had low OCR confidence or were empty – please review them.`],
    [/^OCR kém tin cậy – hãy soát lại kỹ \(hoặc dùng chế độ AI\)\.$/,'Low OCR confidence – review the text carefully or try AI.'],
    [/^Định dạng \.([a-z]+) cũ chưa đọc được trực tiếp\. Hãy mở bằng Word\/PowerPoint rồi "Lưu thành" \.docx\/\.pptx \(hoặc xuất PDF\) và thử lại\.$/,(_,ext)=>`Legacy .${ext} files cannot be read directly. Open the file in Word or PowerPoint, save it as .docx or .pptx (or export as PDF), then try again.`],
    [/^Chưa hỗ trợ định dạng \.([a-z?]+)$/ ,(_,ext)=>`Unsupported format: .${ext}`],
    [/^zip lồng quá sâu$/i,'ZIP files are nested too deeply.'],
    [/^AI chưa sửa được \((.+)\) – giữ kết quả Tesseract; bấm "✨ AI sửa lỗi OCR" để thử lại\.$/,(_,message)=>`AI could not fix the text (${message}). The Tesseract result was kept; tap “✨ Fix OCR errors” to try again.`],
    [/^Ghi chú\/sơ đồ viết tay: Tesseract không đọc được chữ viết tay – hãy chọn công cụ AI trong Tuỳ chọn\.$/,'Handwritten notes and diagrams: Tesseract cannot read handwriting. Choose an AI engine in Options.'],
    [/^Trang (\d+)\/(\d+): đang OCR…$/,(_,n,t)=>`Page ${n}/${t}: OCR in progress…`],
    [/^Trang (\d+)\/(\d+): AI đang đọc…$/,(_,n,t)=>`Page ${n}/${t}: AI is reading…`],
    [/^AI đang đối chiếu & sửa lỗi trang (\d+)\/(\d+)…$/,(_,n,t)=>`AI is checking and fixing page ${n}/${t}…`],
    [/^AI đang đối chiếu trang (\d+)\/(\d+)…$/,(_,n,t)=>`AI is reviewing page ${n}/${t}…`],
    [/^AI đang đối chiếu…$/,'AI is reviewing…'],
    [/^AI không thấy chỗ nào cần sửa\.$/,'AI found no errors to fix.'],
    [/^Đã chụp (\d+) trang – chụp tiếp hoặc bấm Xong$/,(_,n)=>`${n} page(s) captured – keep scanning or tap Done`],
    [/^Xong \((\d+)\)$/,(_,n)=>`Done (${n})`],
    [/^✓ Có (\d+) model dùng được · đang chọn (.+)$/,(_,n,m)=>`✓ ${n} usable models · selected ${m}`],
    [/^(.+)  ⭐ khuyên dùng$/,(_,name)=>`${name}  ⭐ recommended`],
    [/^✓ Key hoạt động \((.+)\)$/,(_,value)=>`✓ API key works (${value})`],
    [/^(.+): máy chủ quá tải \((\d+)\), thử lại lần (\d+)…$/,(_,model,status,n)=>`${model}: server is busy (${status}); retry ${n}…`],
    [/^Đang thử model dự phòng: (.+)…$/,(_,model)=>`Trying backup model: ${model}…`],
    [/^Đã dùng model dự phòng: (.+) \(model "(.+)" đang lỗi\)$/,(_,model,first)=>`Using backup model: ${model} (model “${first}” failed)`],
    [/^Ảnh (\d+)\/(\d+)(.*)$/,(_,n,total,rest)=>`Image ${n}/${total}${rest}`],
    [/^AI nghi ngờ (\d+) chỗ(.*) – bấm "Tới chỗ" để xem, "Áp dụng" để sửa:$/,(_,n,p)=>`AI flagged ${n} item(s)${p.replace(' (mới kiểm ',' (checked ').replace(' trang)',' pages)')} – select “Go to text” to review or “Apply” to fix:`],
    [/^Gộp (\d+) ảnh$/,(_,n)=>`Combined ${n} images`],
    [/^Quét camera (.+) \((\d+) trang\)$/,(_,time,n)=>`Camera scan ${time} (${n} pages)`],
    [/^Quét camera (.+)$/,(_,time)=>`Camera scan ${time}`],
    [/^AI đã sửa (\d+) chỗ – xem danh sách bên dưới, có thể hoàn tác\.$/,(_,n)=>`AI fixed ${n} item(s) – review the list below or undo the changes.`],
    [/^AI đã sửa (\d+) chỗ \(Tesseract → AI\)\. Xem lại cho chắc:$/,(_,n)=>`AI fixed ${n} item(s) (Tesseract → AI). Review the changes:`],
    [/^Tesseract xong – AI đang sửa chỗ sai…$/,'Tesseract finished – AI is fixing errors…'],
    [/^Nhận diện thể thức \(cho nút Word chuẩn\) → (.+)$/,(_,summary)=>`Document format detected (for official Word export) → ${summary}`],
    [/^Ảnh OCR · độ tin cậy ~([\d.]+)% · (\d+) bảng$/,(_,n,t)=>`Image OCR · confidence ~${n}% · ${t} tables`],
    [/^AI đã sửa (\d+) chỗ$/,(_,n)=>`AI fixed ${n} item(s)`],
    [/^AI nghi ngờ (\d+) chỗ$/,(_,n)=>`AI flagged ${n} item(s)`],
    [/^AI đang đối chiếu & sửa lỗi trang (\d+)\/(\d+)…$/,(_,n,t)=>`AI is checking and fixing page ${n}/${t}…`],
  ];
  const excluded = 'textarea,iframe,pre,code,script,style,.file-h .name';
  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();
  let lang = 'vi';
  let observer = null;
  function translate(value, target = lang) {
    const map = target === 'en' ? viToEn : enToVi;
    if (Object.prototype.hasOwnProperty.call(map, value)) return map[value];
    if (target === 'en') for (const [re, out] of dynamic) if (re.test(value)) return typeof out === 'function' ? out(...value.match(re)) : out;
    return value;
  }
  function translateTextNode(node) {
    const p = node.parentElement;
    if (!p || p.closest(excluded)) return;
    if (lang === 'vi' && originalText.has(node)) {
      node.nodeValue = originalText.get(node); originalText.delete(node); return;
    }
    const raw = node.nodeValue, trimmed = raw.trim(); if (!trimmed) return;
    const next = translate(trimmed);
    if (next !== trimmed) { originalText.set(node,raw); node.nodeValue = raw.replace(trimmed, next); }
  }
  function translateAttributes(node) {
    let originals = originalAttrs.get(node);
    for (const attr of ['placeholder','title','aria-label']) {
      const v = node.getAttribute(attr); if (!v) continue;
      if (lang === 'vi' && originals?.has(attr)) { node.setAttribute(attr,originals.get(attr)); originals.delete(attr); continue; }
      const t = translate(v); if (t !== v) { if (!originals) originalAttrs.set(node,originals = new Map()); originals.set(attr,v); node.setAttribute(attr,t); }
    }
  }
  function translateNodeNow(node) {
    if (node.nodeType === Node.TEXT_NODE) { translateTextNode(node); return; }
    if (node.nodeType !== Node.ELEMENT_NODE && node !== document) return;
    if (node.nodeType === Node.ELEMENT_NODE && node.matches(excluded)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    const descendants = []; while (walker.nextNode()) descendants.push(walker.currentNode);
    if (node.nodeType === Node.ELEMENT_NODE) descendants.unshift(node);
    for (const child of descendants) {
      if (child.nodeType === Node.TEXT_NODE) translateTextNode(child);
      else if (!child.matches(excluded)) translateAttributes(child);
    }
  }
  function translateNode(node) {
    if (!observer) { translateNodeNow(node); return; }
    observer.disconnect();
    try { translateNodeNow(node); }
    finally { observer.observe(document.body,{subtree:true,childList:true,characterData:true}); }
  }
  function setLanguage(value) {
    lang = value === 'en' ? 'en' : 'vi';
    try { localStorage.setItem('dc_language',lang); } catch {}
    document.documentElement.lang = lang;
    document.title = lang === 'en' ? 'DocConverter – Document Conversion & OCR' : 'DocConverter – Chuyển đổi tài liệu & OCR';
    translateNode(document.body);
    const code = document.querySelector('#langCode'); if (code) code.textContent = lang.toUpperCase();
    updateAccessibleLabels();
  }
  const nativeAlert = window.alert.bind(window);
  window.alert = message => nativeAlert(translate(String(message)));
  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') translateNode(record.target);
      else record.addedNodes.forEach(translateNode);
    }
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  const themeToggle = document.querySelector('#themeToggle');
  const langToggle = document.querySelector('#langToggle');
  function updateAccessibleLabels() {
    const theme = document.documentElement.dataset.theme || 'light';
    if (themeToggle) {
      const label = lang === 'en'
        ? (theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
        : (theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối');
      themeToggle.setAttribute('aria-label',label); themeToggle.title = label;
      themeToggle.setAttribute('aria-checked',String(theme === 'dark'));
    }
    if (langToggle) {
      const label = lang === 'en' ? 'Switch language to Vietnamese' : 'Chuyển ngôn ngữ sang English';
      langToggle.setAttribute('aria-label',label); langToggle.title = label;
    }
  }
  function setTheme(value) {
    const theme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('dc_theme',theme); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = theme === 'dark' ? '#11100f' : '#f5f4f2';
    updateAccessibleLabels();
  }
  setTheme(document.documentElement.dataset.theme || 'light');
  setLanguage((()=>{try{return localStorage.getItem('dc_language')||'vi'}catch{return 'vi'}})());
  themeToggle?.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  langToggle?.addEventListener('click',()=>setLanguage(lang === 'en' ? 'vi' : 'en'));
  window.appI18n = { get language(){return lang}, t: translate };
})();
