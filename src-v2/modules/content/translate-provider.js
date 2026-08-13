export class TranslateProvider {
  constructor(http) { this.http = http; }
  async translate(text, target = "vi", source = "auto") {
    if (!/^[a-z]{2,5}(?:-[A-Z]{2})?$/.test(target)) throw new Error("Mã ngôn ngữ đích không hợp lệ");
    const params = new URLSearchParams({ client: "gtx", sl: source, tl: target, dt: "t", q: text });
    const data = await this.http.json(`https://translate.googleapis.com/translate_a/single?${params}`);
    const translated = (data?.[0] || []).map((part) => part?.[0] || "").join("").trim();
    if (!translated) throw new Error("Không dịch được nội dung");
    return { text: translated, detectedLanguage: data?.[2] || source, target };
  }
}
