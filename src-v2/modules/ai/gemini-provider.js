export class GeminiProvider {
  #client;
  constructor({ apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, model = process.env.GEMINI_MODEL || "gemini-2.5-flash" } = {}) {
    this.apiKey = apiKey;
    this.model = model;
  }

  get available() { return Boolean(this.apiKey); }

  async #getClient() {
    if (!this.available) throw new Error("AI chưa cấu hình GEMINI_API_KEY");
    if (!this.#client) {
      const { GoogleGenAI } = await import("@google/genai");
      this.#client = new GoogleGenAI({ apiKey: this.apiKey, httpOptions: { timeout: 25_000 } });
    }
    return this.#client;
  }

  async generate({ messages, systemInstruction }) {
    const client = await this.#getClient();
    const contents = messages.map(({ role, text }) => ({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text }],
    }));
    const response = await client.models.generateContent({
      model: this.model,
      contents,
      config: { systemInstruction, maxOutputTokens: 2048, temperature: 0.7 },
    });
    const text = response.text?.trim();
    if (!text) throw new Error("AI không trả về nội dung");
    return text;
  }
}
