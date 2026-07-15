import { authenticator } from "otplib";
import { launchPageBrowserReal } from "../../../utilities/browser-launch.js";
import { getDataDownloadAIO } from "../../api-download/aio-downlink.js";

export default class SpotifyAPI {
  constructor(spDcCookie) {
    this.spDcCookie = spDcCookie;
    this.webAccessToken = null;
    this.clientId = null;
    this.clientToken = null;
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    this.baseUrl = {
      baseUrl: "https://open.spotify.com",
      getAccessToken: "https://open.spotify.com/api/token",
      friendActivity: "https://guc-spclient.spotify.com/presence-view/v1/buddylist",
      pathfinder: "https://api-partner.spotify.com/pathfinder/v2/query",
      clientToken: "https://clienttoken.spotify.com/v1/clienttoken",
    };
  }

  saveWebAccessToken(token) {
    this.webAccessToken = token;
  }

  saveClientId(clientId) {
    this.clientId = clientId;
  }

  saveClientToken(clientToken) {
    this.clientToken = clientToken;
  }

  async getWebAccessToken() {
    const page = await launchPageBrowserReal();

    const data = {
      accessToken: null,
      clientId: null,
      clientToken: null,
    };

    await page.setExtraHTTPHeaders({
      Cookie: this.spDcCookie,
    });

    const tokenPromise = new Promise((resolve) => {
      page.on("response", async (response) => {
        const url = response.url();
        if (url.includes(this.baseUrl.getAccessToken)) {
          const jsonData = JSON.parse(await response.text());
          data.accessToken = jsonData.accessToken;
          data.clientId = jsonData.clientId;
        } else if (url.includes(this.baseUrl.clientToken)) {
          try {
            const jsonData = JSON.parse(await response.text());
            data.clientToken = jsonData.granted_token.token;
          } catch {}
        }

        if (data.accessToken && data.clientId && data.clientToken) {
          resolve();
        }
      });
    });

    await page.goto(this.baseUrl.baseUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

    await tokenPromise;

    this.saveWebAccessToken(data.accessToken);
    this.saveClientId(data.clientId);
    this.saveClientToken(data.clientToken);
    return data;
  }

  async _fetchWithRetry(url, options, { maxRetries = 10, refreshTokenOnFail = false } = {}) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (res.ok) return res;
        if (res.status === 401 && refreshTokenOnFail) {
          await this.getWebAccessToken();
          if (options && options.headers && this.webAccessToken) {
            options.headers.Authorization = `Bearer ${this.webAccessToken}`;
          }
          continue;
        }
        lastError = Object.assign(new Error(`Request failed: ${res.status}`), { response: res });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  async getFriendActivity() {
    if (!this.webAccessToken) {
      await this.getWebAccessToken();
    }
    const url = this.baseUrl.friendActivity;
    const headers = {
      "User-Agent": this.userAgent,
      Authorization: `Bearer ${this.webAccessToken}`,
    };
    const res = await this._fetchWithRetry(url, { headers }, { maxRetries: 10, refreshTokenOnFail: true });
    return await res.json();
  }

  async search(searchTerm) {
    if (!this.webAccessToken) await this.getWebAccessToken();
    const url = this.baseUrl.pathfinder;
    const data = {
      variables: {
        searchTerm,
        offset: 0,
        limit: 10,
        numberOfTopResults: 5,
        includeAudiobooks: true,
        includeArtistHasConcertsField: false,
        includePreReleases: true,
        includeLocalConcertsField: false,
        includeAuthors: false,
      },
      operationName: "searchDesktop",
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "d9f785900f0710b31c07818d617f4f7600c1e21217e80f5b043d1e78d74e6026",
        },
      },
    };
    const headers = {
      accept: "application/json",
      "app-platform": "WebPlayer",
      Authorization: `Bearer ${this.webAccessToken}`,
      "content-type": "application/json;charset=UTF-8",
      "user-agent": this.userAgent,
    };
    const res = await this._fetchWithRetry(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      },
      { maxRetries: 10, refreshTokenOnFail: true }
    );
    const jsonData = await res.json();
    return jsonData.data.searchV2.tracksV2.items.map((item) => {
      const itemData = item.item.data;
      const totalSeconds = Math.floor(itemData.duration.totalMilliseconds / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const formattedDuration = `${minutes}:${seconds.toString().padStart(2, "0")}`;
      return {
        ...itemData,
        title: itemData.name,
        id: itemData.id,
        uri: itemData.uri,
        duration: formattedDuration,
        thumbnail: itemData.albumOfTrack.coverArt.sources.reduce(
          (max, item) => (item.height > (max?.height || 0) ? item : max),
          null
        )?.url,
        artist: itemData.artists.items.map((a) => a.profile.name).join(", ") || "Unknown Artist",
      };
    });
  }

  async getTrackInfo(trackUri) {
    if (!this.webAccessToken) await this.getWebAccessToken();
    const url = this.baseUrl.pathfinder;
    const data = {
      variables: {
        uri: trackUri,
      },
      operationName: "getTrack",
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "26cd58ab86ebba80196c41c3d48a4324c619e9a9d7df26ecca22417e0c50c6a4",
        },
      },
    };
    const headers = {
      accept: "application/json",
      "app-platform": "WebPlayer",
      Authorization: `Bearer ${this.webAccessToken}`,
      "content-type": "application/json",
      "user-agent": this.userAgent,
    };
    const res = await this._fetchWithRetry(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      },
      { maxRetries: 10, refreshTokenOnFail: true }
    );
    return await res.json();
  }

  async getTracksInfo(ids) {
    if (!this.webAccessToken) await this.getWebAccessToken();
    const idsParam = Array.isArray(ids) ? ids.join(",") : ids;
    const url = `https://api.spotify.com/v1/tracks?ids=${idsParam}&market=from_token`;
    const headers = {
      Authorization: `Bearer ${this.webAccessToken}`,
      "client-token": this.clientToken,
      "sec-ch-ua": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
      "User-Agent": this.userAgent,
      accept: "*/*",
      "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5,zh-TW;q=0.4,zh-CN;q=0.3,zh;q=0.2",
      "if-none-match": '"MC-IjFlODAzMzJhYjlhMmY1NmQ2NTM4OTUzZDg2Mjc4MzRkIg=="',
      origin: "https://open.spotify.com",
      priority: "u=1, i",
      referer: "https://open.spotify.com/",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
    };
    const res = await this._fetchWithRetry(
      url,
      { method: "GET", body: null, headers },
      { maxRetries: 5, refreshTokenOnFail: true }
    );
    return await res.json();
  }

  async getStreamSong(id) {
    // const getTrackInfo = await this.getTracksInfo(id);
    // const selectTrack = getTrackInfo.tracks.find((item) => item.id === id);
    // if (selectTrack) {
    //   return `https://cdn-spotify.zm.io.vn/stream/${selectTrack.id}/${selectTrack.external_ids.isrc}`;
    // } else {
    //   return null;
    // }

    const url = `${this.baseUrl.baseUrl}/track/${id}`;
    const dataAIO = await getDataDownloadAIO(url);
    if (dataAIO.error) {
      return null;
    }
    return dataAIO.medias[0].url;
  }

  async searchTracks(searchTerm, limit = 20) {
    if (!this.webAccessToken) await this.getWebAccessToken();

    const url = this.baseUrl.pathfinder;
    const data = {
      variables: {
        searchTerm,
        offset: 0,
        limit,
        numberOfTopResults: 20,
        includeAudiobooks: true,
        includeAuthors: false,
        includePreReleases: false,
      },
      operationName: "searchTracks",
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "bc1ca2fcd0ba1013a0fc88e6cc4f190af501851e3dafd3e1ef85840297694428",
        },
      },
    };

    const headers = {
      accept: "application/json",
      "app-platform": "WebPlayer",
      Authorization: `Bearer ${this.webAccessToken}`,
      "content-type": "application/json;charset=UTF-8",
      "user-agent": this.userAgent,
    };

    const res = await this._fetchWithRetry(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      },
      { maxRetries: 5, refreshTokenOnFail: true }
    );

    const jsonData = await res.json();
    return jsonData.data.searchV2.tracksV2.items.map((item) => {
      const itemData = item.item.data;
      const totalSeconds = Math.floor(itemData.duration.totalMilliseconds / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const formattedDuration = `${minutes}:${seconds.toString().padStart(2, "0")}`;
      return {
        ...itemData,
        title: itemData.name,
        id: itemData.id,
        uri: itemData.uri,
        duration: formattedDuration,
        thumbnail: itemData.albumOfTrack.coverArt.sources.reduce(
          (max, item) => (item.height > (max?.height || 0) ? item : max),
          null
        )?.url,
        artist: itemData.artists.items.map((a) => a.profile.name).join(", ") || "Unknown Artist",
      };
    });
  }
}
