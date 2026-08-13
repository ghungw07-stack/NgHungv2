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

### Yêu cầu hệ thống

- Node.js phiên bản 24.
- MongoDB đang hoạt động. Bot hiện không sử dụng MySQL.
- FFmpeg nếu sử dụng các lệnh xử lý âm thanh hoặc video.

### Cài đặt MongoDB

1. Cài MongoDB Community Server phù hợp với hệ điều hành từ trang tải chính thức: https://www.mongodb.com/try/download/community
2. Khởi động dịch vụ MongoDB và bảo đảm cổng mặc định `27017` đang hoạt động.
3. Mở file `assets/json-data/database-config.json` và kiểm tra cấu hình:

   ```json
   {
     "uri": "mongodb://127.0.0.1:27017",
     "database": "bot-zalo-ngh"
   }
   ```

4. Nếu MongoDB nằm trên máy chủ khác hoặc có tài khoản/mật khẩu, thay `uri` bằng chuỗi kết nối tương ứng. Không công khai chuỗi kết nối có chứa mật khẩu.
5. Không cần tự tạo collection hoặc bảng. Bot sẽ tự tạo dữ liệu và index cần thiết trong lần khởi động đầu tiên.

Nếu MongoDB chưa chạy hoặc cấu hình sai, bot sẽ dừng và báo `Lỗi khi khởi tạo MongoDB`.

### Cấu hình và khởi chạy bot

1. **Cài thư viện**:

   ```bash
   npm install
   ```

2. **Cấu hình bot**: Chỉnh sửa file `assets/config.json`:
   - **Cookie**: Lấy cookie từ tài khoản Zalo dùng để chạy bot.
   - **IMEI**: Mở Zalo Web, vào Công cụ dành cho nhà phát triển (DevTools), chọn Console rồi chạy:
     ```javascript
     localStorage.getItem('z_uuid');
     ```
   - **UserAgent**: Có thể giữ giá trị mặc định hoặc dùng UserAgent của trình duyệt hiện tại.

3. **Khởi chạy bot**: Sau khi cấu hình xong, chạy file `run.bat` hoặc dùng lệnh `npm start`.

4. **Cấp quyền quản trị**: Thêm UID của tài khoản cần cấp quyền vào file `assets/data/list_admin.json`.

5. **Áp dụng cấu hình**: Khởi động lại bot sau khi chỉnh sửa cấu hình.

6. **Cài đặt FFmpeg trên Windows**:

   - Tải FFmpeg tại: https://www.gyan.dev/ffmpeg/builds/
   - Giải nén vào thư mục `C:\ffmpeg`.
   - Thêm `C:\ffmpeg\bin` vào biến môi trường `Path`.
   - Mở Command Prompt hoặc PowerShell và chạy `ffmpeg` để kiểm tra.

7. **Cài đặt TensorFlow và NSFWJS**:

   ```bash
   npm install @tensorflow/tfjs-node
   npm install nsfwjs
   ```

> Lưu ý: Không chia sẻ cookie, IMEI, khóa API hoặc dữ liệu đăng nhập công khai.
