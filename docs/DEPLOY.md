# Đưa landing page lên mạng miễn phí

## GitHub Pages

1. Đẩy repository lên GitHub.
2. Mở **Settings → Pages**.
3. Tại **Build and deployment**, chọn **Deploy from a branch**.
4. Chọn branch `main`, thư mục `/docs`, sau đó **Save**.
5. Website sẽ có địa chỉ dạng `https://TEN-GITHUB.github.io/TEN-REPO/`.

Các đường dẫn trong website đều là đường dẫn tương đối nên hoạt động cả ở tên miền gốc lẫn đường dẫn con của GitHub Pages.

## Cloudflare Pages

Cloudflare Pages có CDN và lớp chống DDoS mặc định cho nội dung tĩnh:

1. Trong Cloudflare, mở **Workers & Pages → Create → Pages → Connect to Git**.
2. Chọn repository này.
3. Để trống build command và đặt output directory là `docs`.
4. Deploy để nhận tên miền miễn phí dạng `ten-du-an.pages.dev`.

## Trước khi nhận thanh toán thật

Form nạp tiền hiện là bản trình diễn phía trình duyệt, không ghi nhận giao dịch. Muốn tự động duyệt thật cần một backend riêng, database và webhook có chữ ký từ cổng thanh toán/ngân hàng. Không đặt token, API key hoặc thông tin đăng nhập trong thư mục `docs` vì toàn bộ nội dung GitHub Pages đều công khai.
