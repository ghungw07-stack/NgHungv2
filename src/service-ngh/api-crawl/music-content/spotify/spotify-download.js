import axios from "axios";
import * as cheerio from "cheerio";

export default class SpotifyDown {
  /** @private */ #csrf = "";
  /** @private */ #cookieHeader = "";

  async refreshSession() {
    const res = await axios.get("https://spotmate.online/en", {
      withCredentials: true,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const rawCookies = res.headers["set-cookie"];
    if (!rawCookies || rawCookies.length === 0) {
      throw new Error("Không nhận được Set-Cookie từ /en");
    }

    this.#cookieHeader = rawCookies
      .map((c) => c.split(";")[0])
      .join("; ");

    const $ = cheerio.load(res.data);
    const token = $('meta[name="csrf-token"]').attr("content");
    if (!token) {
      throw new Error("Không tìm thấy CSRF token trong HTML");
    }
    this.#csrf = token;
  }

  async getTrackData(spotifyUrl) {
    if (!this.#csrf || !this.#cookieHeader) {
      await this.refreshSession();
    }

    try {
      return await this.#postTrackData(spotifyUrl);
    } catch (err) {
      if (err?.response?.status === 419) {
        await this.refreshSession();
        return this.#postTrackData(spotifyUrl);
      }
      throw err;
    }
  }

  /** @private */
  async #postTrackData(spotifyUrl) {
    const { data } = await axios.post(
      "https://spotmate.online/getTrackData",
      { spotify_url: spotifyUrl },
      {
        headers: {
          "x-csrf-token": this.#csrf,
          cookie: this.#cookieHeader,
          "x-requested-with": "XMLHttpRequest",
        },
      }
    );
    return data;
  }

  async convertLink(link) {
    if (!this.#csrf || !this.#cookieHeader) {
      await this.refreshSession();
    }

    try {
      return await this.#postConvert(link);
    } catch (err) {
      if (err?.response?.status === 419) {
        await this.refreshSession();
        return this.#postConvert(link);
      }
      throw err;
    }
  }

  /** @private */
  async #postConvert(link) {
    const { data } = await axios.post(
      "https://spotmate.online/convert",
      { urls: link },
      {
        headers: {
          "x-csrf-token": this.#csrf,
          cookie: this.#cookieHeader,
          "x-requested-with": "XMLHttpRequest",
        },
      }
    );
    return data;
  }
}