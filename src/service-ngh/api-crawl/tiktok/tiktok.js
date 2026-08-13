import fs from "fs";
import path from "path";
import jsdom from "jsdom";
import { fileURLToPath } from "url";
import { createCanvas } from "canvas";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const userAgent = "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/111.0";
export const webUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.35";

class TiktokService {
  constructor() {
    this.signaturejs = fs.readFileSync(__dirname + "/helper/signature.js", "utf-8");
    this.webmssdk = fs.readFileSync(__dirname + "/helper/webmssdk.js", "utf-8");
    this.resourceLoader = new jsdom.ResourceLoader({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.35",
    });
  }
  getJsdomWithCanvas() {
    const jsdomOptions = this.getJsdomOptions();
    const jsdomCustom = new jsdom.JSDOM(``, jsdomOptions);

    jsdomCustom.window.HTMLCanvasElement.prototype.getContext = function (type) {
      const canvas = createCanvas(this.width, this.height);
      return canvas.getContext(type);
    };

    return jsdomCustom;
  }
  generateSignature(url) {
    const stringUrl = url.toString();
    const { window } = this.getJsdomWithCanvas();
    let _window = window;
    _window.eval(this.signaturejs.toString());
    _window.byted_acrawler.init({
      aid: 24,
      dfp: true,
    });
    _window.eval(this.webmssdk);
    const signature = _window.byted_acrawler.sign({ url: stringUrl });
    return signature;
  }
  generateXBogus(url, signature) {
    const jsdomOptions = this.getJsdomOptions();
    const { window } = new jsdom.JSDOM(``, jsdomOptions);
    let _window = window;
    _window.eval(this.signaturejs.toString());
    _window.byted_acrawler.init({
      aid: 24,
      dfp: true,
    });
    _window.eval(this.webmssdk);
    if (signature) {
      url.searchParams.append("_signature", signature);
    }
    const xbogus = _window._0x32d649(url.searchParams.toString());
    return xbogus;
  }
  getJsdomOptions() {
    return {
      url: TiktokService.BASE_URL,
      referrer: TiktokService.BASE_URL,
      contentType: "text/html",
      includeNodeLocations: false,
      runScripts: "outside-only",
      pretendToBeVisual: true,
      resources: new jsdom.ResourceLoader({ userAgent: webUserAgent }),
    };
  }
  generateXTTParams(params) {
    const cipher = crypto.createCipheriv("aes-128-cbc", TiktokService.AES_KEY, TiktokService.AES_IV);
    return Buffer.concat([cipher.update(params), cipher.final()]).toString("base64");
  }
}

TiktokService.BASE_URL = "https://www.tiktok.com/";
TiktokService.AES_KEY = "webapp1.0+202106";
TiktokService.AES_IV = "webapp1.0+202106";

export const tiktokService = new TiktokService();
