import axios from "axios";
import HttpsProxyAgent from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import retry from "async-retry";
import * as cheerio from "cheerio";
import { tiktokService } from "./tiktok.js";
import QueryString from "qs";

const headersSearch = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  cookie:
    "_ttp=2p0lHkLPkuuzPy4n9kNCgaqVBFM; tt_chain_token=tioPB+Lui7TvHuzUPNaOHg==; passport_csrf_token=3dfb5a52d5a68f4d5c9bba4538577dfe; passport_csrf_token_default=3dfb5a52d5a68f4d5c9bba4538577dfe; odin_tt=0a5b7e2bc3c60961f0e9463f055e859c8ca0059ae611097cd3dd3f4f259a70c0ec1343ec5dfb12f6361658cbac0ad226f69c1b6cba2089e7f174c7f9388708e449330d0c262c38701c9381fc9a679cae; ttwid=1%7CaIhJLRa4fvQV5lLYGHleEtravH48pseLFrAf8dwU0ik%7C1736404109%7Ce5b777f06b45e5add32991c13b233b1867fa01f50ba08d37f095ee96b81648c4; msToken=ruVh1eb2RQfH8sIdNQMUgirrpsBRM7lyjGt_nJbm8DVQXSxVKiz4L73PlHcZ_AVXhZu5qRBI5DoAuagqgXmZohLuz7vtDEF-g4EQwW8aB9tcv1q1nZhPwnEcwtFHCTN2SIlrRdJREgK_9OqqxttLqrPLpw==",
  "Accept-Language": "vi-VN,vi;q=0.9",
};
const clientABVersions =
  "70508271,73184476,73280491,73282495,73294389,73294937,73340488,73400759,73401892,73404638,73408304,73411238,73414585,73418133,73419053,73427276,73432221,73449066,73453774,73470035,73470127,73484777,73495526,70405643,71057832,71200802,73004916,73171280,73208420,73385640";

const tiktokurl = "https://www.tiktok.com";
const tiktokApi = "https://m.tiktok.com/api";
const tiktokvApi = `https://api16-normal-useast5.tiktokv.us`;
const tiktokvFeed = (params) => `${tiktokvApi}/aweme/v1/feed/?${tiktokApiParams(params)}`;
const linkTiktokSearch = (keywords) => `${tiktokApi}/search/general/full/?keyword=${encodeURI(keywords)}`;
const linkTiktokRelated = (idVideo) => `${tiktokApi}/related/item_list/?${tiktokRelatedParams(idVideo)}`;
const linkTiktokPreload = () => `${tiktokApi}/preload/item_list/?${tiktokPreloadParams()}`;
const linkTiktokRecommend = (idVideo) => `${tiktokApi}/recommend/item_list/?${tiktokRecommendParams(idVideo)}`;
const linkTiktokGetPosts = (params) => `${tiktokurl}/api/post/item_list/?${params}`;
const linkSubHatDe = "https://subhatde.id.vn";
const linkSearchTiktokSubHatDe = (keywords) => `${linkSubHatDe}/tiktok/searchvideo?keywords=${encodeURI(keywords)}`;
const linkDownloadTiktokSubHatDe = (url) => `${linkSubHatDe}/tiktok/downloadvideo?url=${url}`;

const randomChar = (chars, length) => {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const tiktokApiParams = (args) => {
  return new URLSearchParams({
    ...args,
    version_name: "1.1.9",
    version_code: "2018111632",
    build_number: "1.1.9",
    device_id: "7238642534011110914",
    iid: "7318518857994389254",
    manifest_version_code: "2018111632",
    update_version_code: "2018111632",
    openudid: randomChar("0123456789abcdef", 16),
    uuid: randomChar("1234567890", 16),
    _rticket: Date.now() * 1000,
    ts: Date.now(),
    device_brand: "Google",
    device_type: "Pixel 4",
    device_platform: "android",
    resolution: "1080*1920",
    dpi: 420,
    os_version: "10",
    os_api: "29",
    carrier_region: "US",
    sys_region: "US",
    region: "US",
    timezone_name: "America/New_York",
    timezone_offset: "-14400",
    channel: "googleplay",
    ac: "wifi",
    mcc_mnc: "310260",
    is_my_cn: 0,
    ssmix: "a",
    as: "a1qwert123",
    cp: "cbfhckdckkde1",
  }).toString();
};

const tiktokRelatedParams = (idVideo) => {
  return new URLSearchParams({
    WebIdLastTime: Date.now(),
    aid: 1988,
    app_language: "en",
    app_name: "tiktok_web",
    browser_language: "en-US",
    browser_name: "Mozilla",
    browser_online: true,
    browser_platform: "Win32",
    browser_version:
      "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    channel: "tiktok_web",
    clientABVersions: clientABVersions,
    cookie_enabled: true,
    count: 16,
    coverFormat: 2,
    cursor: 0,
    data_collection_enabled: true,
    device_id: "7439236374672705044",
    device_platform: "web_pc",
    focus_state: true,
    from_page: "video",
    history_len: 5,
    isNonPersonalized: false,
    is_fullscreen: false,
    is_page_visible: true,
    itemID: idVideo,
    language: "en",
    odinId: "7439236084913718289",
    os: "windows",
    priority_region: "",
    referer: "",
    region: "VN",
    screen_height: 900,
    screen_width: 1600,
    tz_name: "Asia/Bangkok",
    user_is_login: false,
    verifyFp: "verify_m5acgd9w_JQLaQCy0_pzpQ_43RZ_BC6o_vhFGHinP4BkJ",
    webcast_language: "en",
  }).toString();
};

const tiktokRecommendParams = (idVideo) => {
  return new URLSearchParams({
    WebIdLastTime: Date.now(),
    aid: 1988,
    app_language: "vi-VN",
    app_name: "tiktok_web",
    browser_language: "vi-VN",
    browser_name: "Mozilla",
    browser_online: true,
    browser_platform: "Win32",
    browser_version:
      "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    channel: "tiktok_web",
    clientABVersions: clientABVersions,
    cookie_enabled: true,
    count: 16,
    coverFormat: 2,
    data_collection_enabled: true,
    device_id: "7439236374672705044",
    device_platform: "web_pc",
    device_type: "web_h264",
    focus_state: true,
    from_page: "fyp",
    history_len: 5,
    isNonPersonalized: false,
    is_fullscreen: false,
    is_page_visible: true,
    itemID: idVideo || "",
    language: "vi",
    odinId: "7439236084913718289",
    os: "windows",
    priority_region: "",
    pullType: 1,
    referer: "",
    region: "VN",
    screen_height: 900,
    screen_width: 1600,
    showAboutThisAd: true,
    showAds: false,
    tz_name: "Asia/Bangkok",
    user_is_login: false,
    vv_count_fyp: 5,
    watchLiveLastTime: "",
    webcast_language: "vi-VN",
  }).toString();
};

const tiktokPreloadParams = () => {
  return new URLSearchParams({
    WebIdLastTime: Date.now(),
    aid: 1988,
    app_language: "en",
    app_name: "tiktok_web",
    browser_language: "en-US",
    browser_name: "Mozilla",
    browser_online: true,
    browser_platform: "Win32",
    browser_version:
      "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    channel: "tiktok_web",
    clientABVersions: clientABVersions,
    cookie_enabled: true,
    count: 3,
    coverFormat: 2,
    data_collection_enabled: true,
    device_id: "7439236374672705044",
    device_platform: "web_pc",
    focus_state: false,
    from_page: "fyp",
    history_len: 3,
    isNonPersonalized: false,
    is_fullscreen: false,
    is_page_visible: true,
    language: "en",
    odinId: "7439236084913718289",
    os: "windows",
    priority_region: "",
    referer: "",
    region: "VN",
    screen_height: 900,
    screen_width: 1600,
    tz_name: "Asia/Bangkok",
    user_is_login: false,
    verifyFp: "verify_m5brcczp_UIuDK5W3_I1Bj_4iHu_BciG_yX5azOxfNFJ9",
    vv_count_fyp: 16,
    webcast_language: "en",
  }).toString();
};

const tiktokUserPostsParams = () => {
  return (
    QueryString.stringify({
      aid: 1988,
      app_language: "en",
      app_name: "tiktok_web",
      battery_info: 1,
      browser_language: "en-US",
      browser_name: "Mozilla",
      browser_online: true,
      browser_platform: "Win32",
      browser_version:
        "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.35",
      channel: "tiktok_web",
      cookie_enabled: true,
      device_id: "7002566096994190854",
      device_platform: "web_pc",
      focus_state: false,
      from_page: "user",
      history_len: 3,
      is_fullscreen: false,
      is_page_visible: true,
      os: "windows",
      priority_region: "RO",
      referer: "https://exportcomments.com/",
      region: "RO",
      root_referer: "https://exportcomments.com/",
      screen_height: 1440,
      screen_width: 2560,
      tz_name: "Europe/Bucharest",
      verifyFp: "verify_lacphy8d_z2ux9idt_xdmu_4gKb_9nng_NNTTTvsFS8ao",
      webcast_language: "en",
    }) +
    "&msToken=7UfjxOYL5mVC8QFOKQRhmLR3pCjoxewuwxtfFIcPweqC05Q6C_qjW-5Ba6_fE5-fkZc0wkLSWaaesA4CZ0LAqRrXSL8b88jGvEjbZPwLIPnHeyQq6VifzyKf5oGCQNw_W4Xq12Q-8KCuyiKGLOw=&X-Bogus=DFSzswVL-XGANHVWS0OnS2XyYJUm"
  );
};

const xttParams = (secUid, cursor, count) => {
  return QueryString.stringify({
    aid: "1988",
    cookie_enabled: true,
    screen_width: 0,
    screen_height: 0,
    browser_language: "",
    browser_platform: "",
    browser_name: "",
    browser_version: "",
    browser_online: "",
    timezone_name: "Europe/London",
    secUid,
    cursor,
    count,
    is_encryption: 1,
  });
};

const parseVideoData = (content) => {
  const data = {
    uid: content.aweme_id,
    desc: content.desc,
    author: {
      username: content.author.unique_id,
      nickname: content.author.nickname,
    },
    video: {
      url: content.video.play_addr.url_list[content.video.play_addr.url_list.length - 1],
      cover: content.video.cover.url_list[content.video.cover.url_list.length - 1],
      duration: content.video.duration,
      quality: content.video.ratio,
      type: "mp4",
    },
    images: content.image_post_info
      ? [
          ...Object.values(content.image_post_info.images).map((item) => {
            return item.display_image.url_list[item.display_image.url_list.length - 1];
          }),
        ]
      : null,
    music: {
      title: content.music.title,
      url: content.music.play_url.url_list[content.music.play_url.url_list.length - 1],
      cover:
        content.music?.cover_hd?.url_list[content.music.cover_hd.url_list.length - 1] ||
        content.music?.cover_large?.url_list[content.music.cover_large.url_list.length - 1] ||
        content.music?.cover_medium?.url_list[content.music.cover_medium.url_list.length - 1] ||
        content.music?.cover_thumb?.url_list[content.music.cover_thumb.url_list.length - 1],
      author: content.music.author,
      quality: "audio",
      type: "mp3",
    },
    stat: {
      playCount: content.statistics.play_count,
      diggCount: content.statistics.digg_count,
      commentCount: content.statistics.comment_count,
      downloadCount: content.statistics.download_count,
      shareCount: content.statistics.share_count,
      collectCount: content.statistics.collect_count,
    },
  };

  return data;
};

export async function searchTiktokSubHatDe(keywords) {
  try {
    const response = await axios.get(linkSearchTiktokSubHatDe(keywords), {
      timeout: 5000,
    });
    const videos = response.data?.data?.videos;
    if (!videos) return [];
    const result = videos.map((data) => ({
      id: data.video_id,
      desc: data.title,
      createTime: data.create_time,
      stat: {
        playCount: data.play_count,
        diggCount: data.digg_count,
        commentCount: data.comment_count,
        downloadCount: data.download_count,
        shareCount: data.share_count,
      },
      video: {
        url: data.play,
        cover: data.cover,
        duration: data.duration * 1000 || 1000,
        type: "mp4",
        quality: data.quality || "540p",
      },
      author: data.author,
      music: {
        title: data.music_info.title,
        url: data.music_info.play,
        cover: data.music_info.cover,
        author: data.music_info.author,
        quality: "audio",
        type: "mp3",
      },
    }));
    return result;
  } catch (error) {
    console.error("Error while fetching data:", error.message);
    return [];
  }
}

export async function searchTiktokGeneral(keywords, limit = 10) {
  try {
    const response = await axios.get(linkTiktokSearch(keywords), {
      headers: headersSearch,
    });
    const getData = response.data.data;
    if (!getData) return [];
    const result = getData
      .filter((data) => data.type === 1)
      .slice(0, limit)
      .map((data) => ({
        id: data.item.id,
        desc: data.item.desc,
        createTime: data.item.createTime,
        stat: {
          playCount: data.item.stats?.playCount || 0,
          diggCount: data.item.stats?.diggCount || 0,
          commentCount: data.item.stats?.commentCount || 0,
          downloadCount: data.item.stats?.downloadCount || 0,
          shareCount: data.item.stats?.shareCount || 0,
        },
        video: {
          url: data.item.video.playAddr,
          cover: data.item.video.cover,
          duration: data.item.video.duration * 1000 || 1000,
          type: data.item.video.format,
          quality: data.item.video.ratio,
        },
        author: data.item.author,
        music: {
          title: data.item.music.title,
          url: data.item.music.playUrl,
          cover: data.item.music.coverLarge,
          author: data.item.music.authorName,
          quality: "audio",
          type: "mp3",
        },
      }));
    return result;
  } catch (error) {
    console.error("Error while fetching data:", error);
    return [];
  }
}

export const searchTiktok = async (keywords, limit = 10) => {
  let result = [];
  result = await searchTiktokSubHatDe(keywords, limit);
  result = result.length === 0 ? await searchTiktokGeneral(keywords, limit) : result;
  return result;
};

export const reqIdVideoTiktok = async (url, proxy) => {
  url = url.replace("https://vm", "https://vt");

  try {
    const { request } = await axios({
      method: "HEAD",
      url,
      httpsAgent:
        (proxy &&
          (proxy.startsWith("http") || proxy.startsWith("https")
            ? new HttpsProxyAgent(proxy)
            : proxy.startsWith("socks")
            ? new SocksProxyAgent(proxy)
            : undefined)) ||
        undefined,
    });

    const { responseUrl } = request.res;
    const ID = responseUrl.match(/\d{17,21}/g)?.[0];

    if (!ID) {
      return {
        status: "error",
        message: "Failed to fetch tiktok url. Make sure your tiktok url is correct!",
      };
    }

    return ID;
  } catch (error) {
    return {
      status: "error",
      message: `Error fetching TikTok URL: ${error.message}`,
    };
  }
};

export const fetchTiktokData = async (ID, proxy) => {
  try {
    const response = await retry(
      async () => {
        const url = tiktokvFeed({
          aweme_id: ID,
        });
        const res = await axios(url, {
          method: "OPTIONS",
          headers: {
            "User-Agent":
              "com.zhiliaoapp.musically/300904 (2018111632; U; Android 10; en_US; Pixel 4; Build/QQ3A.200805.001; Cronet/58.0.2991.0)",
          },
          httpsAgent:
            proxy &&
            (proxy.startsWith("http") || proxy.startsWith("https")
              ? new HttpsProxyAgent(proxy)
              : proxy.startsWith("socks")
              ? new SocksProxyAgent(proxy)
              : undefined),
        });
        if (res.data !== "" && res.data.status_code === 0) {
          return res.data;
        }
        throw new Error("Failed to fetch tiktok data");
      },
      {
        retries: 20,
        minTimeout: 200,
        maxTimeout: 1000,
      }
    );
    return await response;
  } catch (error) {
    return null;
  }
};

export const getTiktokVideoByID = (data, ID) => {
  let content = data?.aweme_list;
  if (!content) return { content: null };

  content = content.find((v) => v.aweme_id === ID);
  if (!content) return { content: null };

  return parseVideoData(content);
};

export const getRandomVideoTiktok = (data, currentId) => {
  const videos = data?.aweme_list;
  if (!videos || videos.length === 0) return { content: null };

  const filteredVideos = videos.filter((video) => video.aweme_id !== currentId);
  if (filteredVideos.length === 0) return { content: null };

  const randomIndex = Math.floor(Math.random() * filteredVideos.length);
  const randomVideo = filteredVideos[randomIndex];

  return parseVideoData(randomVideo);
};

const getDataDownloadSubHatDe = async (url) => {
  const response = await axios.get(linkDownloadTiktokSubHatDe(url), {
    timeout: 1500,
  });
  if (response.data.msg === "success") {
    const data = response.data.data;
    return {
      uid: data.id,
      desc: data.title,
      author: {
        username: data.author.unique_id,
        nickname: data.author.nickname,
      },
      video: {
        url: data.play,
        cover: data.cover,
        duration: data.duration * 1000,
        quality: "540p",
        type: "mp4",
      },
      images: data.images,
      music: {
        title: data.music_info.title,
        url: data.music_info.play,
        cover: data.music_info.cover,
        author: data.music_info.author,
        quality: "audio",
        type: "mp3",
      },
      stat: {
        playCount: data.play_count,
        diggCount: data.digg_count,
        commentCount: data.comment_count,
        downloadCount: data.download_count,
        shareCount: data.share_count,
        collectCount: data.collect_count,
      },
    };
  }
  return null;
};

export const getDataDownloadOriginal = async (url, id = null) => {
  const idVideo = id ? id : await reqIdVideoTiktok(url);
  if (!idVideo) return null;

  const data = await fetchTiktokData(idVideo);
  if (!data) return null;

  return getTiktokVideoByID(data, idVideo);
};

export const getDataDownloadVideoTiktok = async (url) => {
  let data;
  try {
    data = await getDataDownloadSubHatDe(url);
  } catch {}
  data = data || (await getDataDownloadOriginal(url));
  if (!data) return null;
  return {
    id: data.uid,
    desc: data.desc,
    author: {
      uniqueId: data.author.username,
      nickname: data.author.nickname,
    },
    video: {
      url: data.video.url,
      cover: data.video.cover,
      type: data.video.type,
      quality: data.video.quality,
      duration: data.video.duration,
    },
    images: data.images,
    music: {
      title: data.music.title,
      url: data.music.url,
      cover: data.music.cover,
      author: data.music.author,
      quality: data.music.quality,
      type: data.music.type,
    },
    stat: {
      playCount: data.stat.playCount,
      diggCount: data.stat.diggCount,
      commentCount: data.stat.commentCount,
      downloadCount: data.stat.downloadCount,
      shareCount: data.stat.shareCount,
      collectCount: data.stat.collectCount,
    },
  };
};

export const getTiktokRelated = async (idVideo) => {
  const response = await axios.get(linkTiktokRelated(idVideo));
  const data = response.data.itemList;
  let result = [];
  if (!data) return [];
  data.map((item) => {
    result.push({
      id: item.id,
      desc: item.desc,
      createTime: item.createTime,
      stats: {
        playCount: item.stats.playCount,
        diggCount: item.stats.diggCount,
        commentCount: item.stats.commentCount,
        shareCount: item.stats.shareCount,
        collectCount: item.stats.collectCount,
      },
      video: {
        url: item.video.playAddr,
        cover: item.video.originCover,
        duration: item.video.duration * 1000 || 1000,
        type: item.video.format,
        quality: item.video.ratio,
      },
      author: item.author,
      music: item.music,
    });
  });
  return result;
};

/**
  // Author @Tobyg74
 */
const StalkUser = (username, cookie, proxy) =>
  new Promise(async (resolve) => {
    username = username.replace("@", "");
    axios(`${tiktokurl}/@${username}`, {
      method: "GET",
      headers: {
        cookie: typeof cookie === "object" ? cookie.map((v) => `${v.name}=${v.value}`).join("; ") : cookie,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36",
      },
      httpsAgent:
        (proxy &&
          (proxy.startsWith("http") || proxy.startsWith("https")
            ? new HttpsProxyAgent(proxy)
            : proxy.startsWith("socks")
            ? new SocksProxyAgent(proxy)
            : undefined)) ||
        undefined,
    })
      .then(async ({ data }) => {
        const $ = cheerio.load(data);
        const result = JSON.parse($("script#__UNIVERSAL_DATA_FOR_REHYDRATION__").text());
        if (!result["__DEFAULT_SCOPE__"] && !result["__DEFAULT_SCOPE__"]["webapp.user-detail"]) {
          return resolve({
            status: "error",
            message: "User not found!",
          });
        }
        const dataUser = result["__DEFAULT_SCOPE__"]["webapp.user-detail"]["userInfo"];
        if (!dataUser) {
          return resolve({
            status: "error",
            message: "User not found!",
          });
        }
        const { user, stats } = parseDataUser(dataUser);
        let response = {
          status: "success",
          result: {
            user,
            stats,
          },
        };
        resolve(response);
      })
      .catch((e) => resolve({ status: "error", message: e.message }));
  });

const parseDataUser = (dataUser) => {
  const user = {
    uid: dataUser.user.id,
    username: dataUser.user.uniqueId,
    nickname: dataUser.user.nickname,
    avatarLarger: dataUser.user.avatarLarger,
    avatarThumb: dataUser.user.avatarThumb,
    avatarMedium: dataUser.user.avatarMedium,
    signature: dataUser.user.signature,
    verified: dataUser.user.verified,
    privateAccount: dataUser.user.privateAccount,
    region: dataUser.user.region,
    commerceUser: dataUser.user.commerceUserInfo.commerceUser,
    usernameModifyTime: dataUser.user.uniqueIdModifyTime,
    nicknameModifyTime: dataUser.user.nickNameModifyTime,
    secUid: dataUser.user.secUid,
  };
  const stats = {
    followerCount: dataUser.stats.followerCount,
    followingCount: dataUser.stats.followingCount,
    heartCount: dataUser.stats.heartCount,
    videoCount: dataUser.stats.videoCount,
    likeCount: dataUser.stats.diggCount,
    friendCount: dataUser.stats.friendCount,
  };
  return { user, stats };
};

/**
  // Author @Tobyg74
 */
const requestUserPosts = async (proxy, xttparams = "") => {
  return retry(
    async (bail, attempt) => {
      try {
        const url = linkTiktokGetPosts(tiktokUserPostsParams());
        const { data } = await axios.get(`${url}`, {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.35",
            "x-tt-params": xttparams,
          },
          httpsAgent:
            (proxy &&
              (proxy.startsWith("http") || proxy.startsWith("https")
                ? new HttpsProxyAgent(proxy)
                : proxy.startsWith("socks")
                ? new SocksProxyAgent(proxy)
                : undefined)) ||
            undefined,
        });
        if (data === "") {
          throw new Error("Empty response");
        }
        return data;
      } catch (error) {
        if (error.response?.status === 400 || error.response?.data?.statusCode === 10201) {
          bail(new Error("Video not found!"));
          return;
        }
        throw error;
      }
    },
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
      factor: 2,
      onRetry: (error, attempt) => {
        console.log(`Retry attempt ${attempt} due to: ${error}`);
      },
    }
  );
};

/**
  // Author @Tobyg74
 */
const parseUserPosts = async (secUid, postLimit, proxy) => {
  let hasMore = true;
  let cursor = 0;
  const posts = [];
  let counter = 0;
  // let xttparams = tiktokService.generateXTTParams(xttParams(secUid, cursor, 30));
  try {
    while (hasMore) {
      const xttparams = tiktokService.generateXTTParams(xttParams(secUid, cursor, 10));
      let result = null;
      result = await requestUserPosts(proxy, xttparams);
      result?.itemList?.forEach((v) => {
        if (posts.some((post) => post.id === v.id)) return;
        const author = {
          id: v.author.id,
          username: v.author.uniqueId,
          nickname: v.author.nickname,
          avatarLarger: v.author.avatarLarger,
          avatarThumb: v.author.avatarThumb,
          avatarMedium: v.author.avatarMedium,
          signature: v.author.signature,
          verified: v.author.verified,
          openFavorite: v.author.openFavorite,
          privateAccount: v.author.privateAccount,
          isADVirtual: v.author.isADVirtual,
          isEmbedBanned: v.author.isEmbedBanned,
        };
        if (v.imagePost) {
          const images = v.imagePost.images.map((img) => img.imageURL.urlList[0]);
          posts.push({
            id: v.id,
            desc: v.desc,
            createTime: v.createTime,
            digged: v.digged,
            duetEnabled: v.duetEnabled,
            forFriend: v.forFriend,
            officalItem: v.officalItem,
            originalItem: v.originalItem,
            privateItem: v.privateItem,
            shareEnabled: v.shareEnabled,
            stitchEnabled: v.stitchEnabled,
            stats: v.stats,
            music: v.music,
            author,
            images,
          });
        } else {
          const video = {
            id: v.video.id,
            duration: v.video.duration,
            format: v.video.format,
            bitrate: v.video.bitrate,
            ratio: v.video.ratio,
            playAddr: v.video.playAddr,
            cover: v.video.cover,
            originCover: v.video.originCover,
            dynamicCover: v.video.dynamicCover,
            downloadAddr: v.video.downloadAddr,
          };
          let playAddrH264 = null;
          if (Array.isArray(v.video?.bitrateInfo)) {
            const h264Info = v.video.bitrateInfo.find((b) => b.CodecType === "h264");
            if (h264Info && h264Info.PlayAddr && Array.isArray(h264Info.PlayAddr.UrlList)) {
              playAddrH264 = h264Info.PlayAddr.UrlList[h264Info.PlayAddr.UrlList.length - 1];
            }
          }
          if (playAddrH264) video.playAddr = playAddrH264;
          posts.push({
            id: v.id,
            desc: v.desc,
            createTime: v.createTime,
            digged: v.digged,
            duetEnabled: v.duetEnabled,
            forFriend: v.forFriend,
            officalItem: v.officalItem,
            originalItem: v.originalItem,
            privateItem: v.privateItem,
            shareEnabled: v.shareEnabled,
            stitchEnabled: v.stitchEnabled,
            stats: v.stats,
            music: v.music,
            author,
            video,
          });
        }
      });
      hasMore = result.hasMore;
      cursor = hasMore ? result.cursor : null;
      counter++;
      if (postLimit && posts.length >= postLimit) {
        hasMore = false;
        break;
      }
    }
  } catch {}
  return postLimit ? posts.slice(0, postLimit) : posts;
};

export const getTiktokPostByUsername = async (username, limit = 10) =>
  new Promise((resolve) => {
    try {
      StalkUser(username).then(async (res) => {
        if (res.status === "error") {
          return resolve({
            status: "error",
            message: res.message,
          });
        }
        const secUid = res.result.user.secUid;
        const data = await parseUserPosts(secUid, limit, null);
        if (!data.length)
          return resolve({
            status: "error",
            message: "User not found!",
          });
        resolve({
          status: "success",
          result: data,
          totalPosts: data.length,
        });
      });
    } catch (err) {
      if (err.status == 400 || (err.response.data && err.response.data.statusCode == 10201)) {
        return resolve({
          status: "error",
          message: "Video not found!",
        });
      }
    }
  });

export const getTiktokPreload = async () => {
  const response = await axios.get(linkTiktokPreload());
  const data = response.data.itemList;
  let result = [];
  if (!data) return [];
  data.map((item) => {
    result.push({
      id: item.id,
      desc: item.desc,
      createTime: item.createTime,
      stats: {
        playCount: item.stats.playCount,
        diggCount: item.stats.diggCount,
        commentCount: item.stats.commentCount,
        shareCount: item.stats.shareCount,
        collectCount: item.stats.collectCount,
      },
      video: {
        url: item.video.playAddr,
        cover: item.video.originCover,
        duration: item.video.duration * 1000 || 1000,
        type: item.video.format,
        quality: item.video.ratio,
      },
      author: item.author,
      music: item.music,
    });
  });
  return result;
};
