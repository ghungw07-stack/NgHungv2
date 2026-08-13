# Dự án Zalo ChatBot

Zalo ChatBot là bot đa chức năng được phát triển bằng JavaScript bởi **NGH**, hỗ trợ quản lý nhóm, giải trí và tự động hóa nhiều tác vụ trên Zalo.

## Tính năng phiên bản 2.0.4

- **Quản lý nhóm Zalo tự động**:
  - Tự động chống spam.
  - Lọc tin nhắn chứa liên kết.
  - Lọc nội dung và từ khóa không phù hợp.
- **Ảnh chào mừng và tạm biệt**: Tự động tạo ảnh khi thành viên tham gia, rời nhóm hoặc bị xóa khỏi nhóm.
- **Kho lệnh tiện ích và giải trí**: Hỗ trợ nhiều lệnh dành cho cộng đồng, game và các nền tảng như YouTube, Facebook, TikTok, Zing, SoundCloud.
- **Hệ thống bot mẹ và bot con**: Hỗ trợ quản lý, kích hoạt, gia hạn và điều khiển nhiều bot.

## Hướng dẫn sử dụng

1. **Cấu hình bot**: Chỉnh sửa file `assets/config.json`:
   - **Cookie**: Lấy cookie từ tài khoản Zalo dùng để chạy bot.
   - **IMEI**: Mở Zalo Web, vào Công cụ dành cho nhà phát triển (DevTools), chọn Console rồi chạy:
     ```javascript
     localStorage.getItem('z_uuid');
     ```
   - **UserAgent**: Có thể giữ giá trị mặc định hoặc dùng UserAgent của trình duyệt hiện tại.

2. **Khởi chạy bot**: Sau khi cấu hình xong, chạy file `run.bat` hoặc dùng lệnh `npm start`.

3. **Cấp quyền quản trị**: Thêm UID của tài khoản cần cấp quyền vào file `assets/data/list_admin.json`.

4. **Áp dụng cấu hình**: Khởi động lại bot sau khi chỉnh sửa cấu hình.

5. **Cài đặt FFmpeg trên Windows**:

   - Tải FFmpeg tại: https://www.gyan.dev/ffmpeg/builds/
   - Giải nén vào thư mục `C:\ffmpeg`.
   - Thêm `C:\ffmpeg\bin` vào biến môi trường `Path`.
   - Mở Command Prompt hoặc PowerShell và chạy `ffmpeg` để kiểm tra.

6. **Cài đặt TensorFlow và NSFWJS**:

   ```bash
   npm install @tensorflow/tfjs-node
   npm install nsfwjs
   ```

> Lưu ý: Không chia sẻ cookie, IMEI, khóa API hoặc dữ liệu đăng nhập công khai.
