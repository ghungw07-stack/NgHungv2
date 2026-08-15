const featureData = [
  ['Quản trị nhóm','Đổi tên, avatar, link nhóm, admin, thành viên'],['Chống spam','Tin nhắn lặp, flood, tag và nội dung rác'],['Chống thu hồi','Ghi nhận nội dung tin nhắn đã bị thu hồi'],['Lọc nội dung','Link, số điện thoại, file, GIF, voice, sticker'],['AI Chat','Gemini, GPT, Nova và trả lời tự động'],['AI hình ảnh','Tạo ảnh, nhận diện và kiểm duyệt nội dung'],['Tải đa nền tảng','TikTok, YouTube, Facebook, Zing, SoundCloud'],['Tìm kiếm','Google, ảnh, tin tức và Pinterest'],['Game bài','Baccarat, xì dách, tài xỉu, bầu cua'],['Game cộng đồng','Ma sói, giveaway, đua ngựa, nối từ'],['Nông trại','Trồng cây, cửa hàng và bảng xếp hạng'],['Tra cứu nhanh','Thời tiết, vàng, xăng, xổ số, phạt nguội'],['Xử lý media','Ảnh, video, âm thanh, QR, xóa nền'],['Tự động hóa','Lịch gửi, auto join, phản hồi và thông báo'],['Bot mẹ / bot con','Kích hoạt, gia hạn và quản lý nhiều bot'],['Bảng điều khiển','Theo dõi log, nhóm, thành viên và gửi tin']
];
const all = document.querySelector('#allFeatures');
if (all) {
  all.innerHTML = featureData.map(([name,desc]) => `<div><b>${name}</b><small>${desc}</small></div>`).join('');
  document.querySelector('#showAll')?.addEventListener('click', e => { const open=all.classList.toggle('open'); all.setAttribute('aria-hidden', !open); e.currentTarget.innerHTML=open?'Thu gọn danh sách <span>−</span>':'Xem toàn bộ chức năng <span>＋</span>'; });
}
document.querySelector('.menu')?.addEventListener('click', () => document.querySelector('.nav')?.classList.toggle('open'));
const music = document.querySelector('#bgMusic'), musicToggle = document.querySelector('#musicToggle');
if (music) { music.volume = .65; music.play().catch(() => {}); const startOnTouch = () => { music.play().catch(() => {}); document.removeEventListener('pointerdown', startOnTouch); }; document.addEventListener('pointerdown', startOnTouch, {once:true}); }
musicToggle?.addEventListener('click', async () => { if (!music) return; if (music.paused) { try { await music.play(); musicToggle.textContent='❚❚'; } catch { musicToggle.textContent='♪'; } } else { music.pause(); musicToggle.textContent='▶'; } });
music?.addEventListener('ended', () => { if (musicToggle) musicToggle.textContent='▶'; });
if ('IntersectionObserver' in window) { const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.1}); document.querySelectorAll('.reveal').forEach(el=>observer.observe(el)); }
