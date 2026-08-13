import QRCode from "qrcode";
import jsQR from "jsqr";
import sharp from "sharp";

export class QrService {
  constructor({ http, tempFiles }) { Object.assign(this, { http, tempFiles }); }

  async create(text) {
    const output = this.tempFiles.path(".png");
    await QRCode.toFile(output, text, {
      width: 900, margin: 3,
      color: { dark: "#071426", light: "#ffffff" },
      errorCorrectionLevel: "H",
    });
    return output;
  }

  async scan(url) {
    const input = this.tempFiles.path(".img");
    try {
      await this.http.download(url, input, { maxBytes: 10 * 1024 * 1024 });
      const { data, info } = await sharp(input)
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "attemptBoth" });
      if (!decoded?.data) throw new Error("Không tìm thấy mã QR trong ảnh");
      return decoded.data;
    } finally {
      await this.tempFiles.remove(input).catch(() => {});
    }
  }
}
