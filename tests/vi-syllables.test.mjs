// Chạy: node tests/vi-syllables.test.mjs   (không cần thư viện)
import assert from 'node:assert/strict';
await import('../vi-syllables.js');
const VI = globalThis.VI;
let pass = 0; const t = (name, fn) => { try { fn(); pass++; console.log('PASS ', name); } catch (e) { console.log('FAIL ', name, '\n     ', e.message); process.exitCode = 1; } };

// Tập nhỏ dùng để kiểm thử thuật toán (dữ liệu thật nằm ở vi-data.js)
VI.init(`tiếng việt người được nghiêng quyển giường khuya thuở nghèo trường đồng nẵng hoặc xin chào phố kế hoạch phương pháp
giảng dạy ngoại ngữ căn cứ năm học nhà tổ chức hội thảo về đổi mới vào ngày tháng đề nghị các đơn vị cử viên tham dự đầy đủ và đúng giờ
việt viết viêt nai đà tỉnh ủy ban nhân dân thành phố sở tại cơ quan công văn kính gửi khoa phòng ban trực thuộc`);

t('âm tiết hợp lệ', () => ['tiếng', 'Việt', 'người', 'được', 'nghiêng', 'quyển', 'giường', 'khuya', 'thuở', 'trường', 'Đồng', 'Nẵng'].forEach(w => assert.ok(VI.isValid(w), w)));
t('chuỗi vô nghĩa bị phát hiện', () => ['nguời', 'đưọc', 'xưoc', 'thuơng', 'trưòng'].forEach(w => assert.ok(!VI.isValid(w), w)));
t('NFD vẫn hợp lệ (người gõ dạng tổ hợp)', () => assert.ok(VI.isValid('người')));
t('chi phí thay thế: dấu thanh 0.6, dấu mũ/móc 0.75, d/đ 0.8, x/s 0.85', () => {
  assert.equal(VI.runeCost('ạ', 'ả'), 0.6); assert.equal(VI.runeCost('u', 'ư'), 0.75); assert.equal(VI.runeCost('d', 'đ'), 0.8); assert.equal(VI.runeCost('x', 's'), 0.85); assert.equal(VI.runeCost('a', 'a'), 0);
});
t('gợi ý duy nhất: nguời → người', () => { const s = VI.suggest('nguời'); assert.equal(s.best, 'người'); assert.equal(s.ties, 1); });
t('autoCorrect sửa đúng và giữ hoa/thường', () => {
  const r = VI.autoCorrect('Nguời Việt, đưọc xin chào.'); assert.equal(r.text, 'Người Việt, được xin chào.'); assert.equal(r.changes.length, 2);
  assert.deepEqual(r.changes.map(c => c.orig), ['Nguời', 'đưọc']);
});
t('nhiều ứng viên cùng điểm → KHÔNG sửa (viêt: việt/viết)', () => {
  VI.init('việt viết nai');
  const sg = VI.suggest('viêt'); assert.equal(sg.ties, 2);
  assert.equal(VI.autoCorrect('viet và viêt').text, 'viet và viêt');
});
t('miễn sửa: IN HOA, 1 ký tự, chữ Latin không dấu, dính số', () => {
  VI.init('người được tiếng việt');
  assert.equal(VI.autoCorrect('NGUỜI').text, 'NGUỜI');
  assert.equal(VI.autoCorrect('ư').text, 'ư');
  assert.equal(VI.autoCorrect('nguoi').text, 'nguoi');
  assert.equal(VI.autoCorrect('12nguời').text, '12nguời');
});
t('validRatio: tiếng Anh không bị phạt, lỗi tiếng Việt bị tính', () => {
  VI.init('căn cứ kế hoạch năm học tiếng việt người được');
  assert.equal(VI.validRatio('Collecting things and more').ratio, 1);
  const r = VI.validRatio('căn cứ kế hoạch nguời'); assert.equal(r.total, 5); assert.equal(r.valid, 4); assert.ok(Math.abs(r.ratio - 0.8) < 1e-9);
});
t('scan: chỉ tô sáng token có chữ Việt có dấu mà vô nghĩa, có gợi ý', () => {
  VI.init('người được tiếng việt xin chào');
  const f = VI.scan('Nguời things được'); assert.equal(f.length, 1); assert.equal(f[0].token, 'Nguời'); assert.equal(f[0].suggestion, 'Người');
  assert.equal('Nguời things được'.slice(f[0].start, f[0].end), 'Nguời');
});
t('symbolSuspects: ký hiệu lạ, lẫn chữ-số, ngoặc lệch', () => {
  const s = VI.symbolSuspects('Số: 60$‡/VPCP và 1O5 tiền (đồng.'); const reasons = s.map(x => x.reason).join('|');
  assert.ok(/ký hiệu lạ/.test(reasons)); assert.ok(/ngoặc/.test(reasons));
});
t('chưa nạp dữ liệu → không làm gì (an toàn)', () => { VI.init(''); assert.equal(VI.ready(), false); assert.deepEqual(VI.scan('nguời'), []); assert.equal(VI.autoCorrect('nguời').text, 'nguời'); });
console.log(`\n${pass} test đạt`);
