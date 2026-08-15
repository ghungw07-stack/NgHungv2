# Deploy lên Linux + Nginx

Các lệnh dưới đây dành cho Ubuntu/Debian. DNS của `hungdz.id.vn` phải trỏ về IP server trước khi chạy Certbot.

```bash
sudo apt update
sudo apt install -y nginx git certbot python3-certbot-nginx

sudo mkdir -p /var/www/hungdz.id.vn
sudo git clone https://github.com/ghungw07-stack/NgHungv2.git /tmp/ngh-bot-site
sudo cp -a /tmp/ngh-bot-site/docs/. /var/www/hungdz.id.vn/
sudo rm -f /var/www/hungdz.id.vn/CNAME

sudo cp /var/www/hungdz.id.vn/nginx-hungdz.id.vn.conf /etc/nginx/sites-available/hungdz.id.vn
sudo ln -sfn /etc/nginx/sites-available/hungdz.id.vn /etc/nginx/sites-enabled/hungdz.id.vn
sudo nginx -t
sudo systemctl reload nginx

# Cấp SSL miễn phí và tự gia hạn
sudo certbot --nginx -d hungdz.id.vn -d www.hungdz.id.vn
```

Sau đó kiểm tra:

```bash
curl -I https://hungdz.id.vn
sudo certbot renew --dry-run
```

## Cập nhật website lần sau

```bash
cd /tmp/ngh-bot-site
git pull origin main
sudo rsync -a --delete docs/ /var/www/hungdz.id.vn/ --exclude CNAME
```
