import EventEmitter from "events";
import WebSocket from "ws";
import { initializeGroupEvent } from "../models/GroupEvent.js";
import { GroupMessage, Message, Reaction, Undo } from "../models/index.js";
import { decodeEventData, getGroupEventType, hasOwn, logger, makeURL } from "../utils.js";
import { GroupDeliveredMessage, UserDeliveredMessage } from "../models/DeliveredMessage.js";
import { GroupSeenMessage, UserSeenMessage } from "../models/SeenMessage.js";
import { deepParseJSON } from "../../utils/format-util.js";
import { CloseWebSocketReason, CommandTypeCode, SignalCommands } from "../models/WebSocketConstants.js";

export class Listener extends EventEmitter {
  constructor(appContext, urls) {
    super();
    if (!appContext.cookie) throw new Error("Cookie is not available");
    if (!appContext.userAgent) throw new Error("User agent is not available");
    this.urls = urls;
    this.appContext = appContext;
    this.wsURL = makeURL(this.appContext, this.urls[0], { t: Date.now() });
    this.retryCount = {};
    this.rotateCount = 0;
    for (const retry in appContext.settings.features.socket.retries) {
      const { times, max } = appContext.settings.features.socket.retries[retry];
      this.retryCount[retry] = {
        count: 0,
        max: max || 0,
        times: typeof times === "number" ? [times] : times,
      };
    }
    this.cookie = appContext.cookie;
    this.userAgent = appContext.userAgent;
    this.selfListen = appContext.options.selfListen;
    this.ws = null;
    this.onConnectedCallback = () => {};
    this.onClosedCallback = () => {};
    this.onErrorCallback = () => {};
    this.onMessageCallback = () => {};
  }
  onConnected(cb) {
    this.onConnectedCallback = cb;
  }
  onClosed(cb) {
    this.onClosedCallback = cb;
  }
  onError(cb) {
    this.onErrorCallback = cb;
  }
  onMessage(cb) {
    this.onMessageCallback = cb;
  }
  canRetry(code) {
    if (!this.appContext.settings.features.socket.close_and_retry_codes.includes(code)) return false;
    if (this.retryCount[code.toString()].count >= this.retryCount[code.toString()].max) return false;
    this.retryCount[code.toString()].count++;
    const { count, max, times } = this.retryCount[code.toString()];
    const retryTime = count - 1 < times.length ? times[count - 1] : times[times.length - 1];
    logger(this.appContext).verbose(`Close with code ${code} - retry connection in ${retryTime}ms (${count}/${max})`);
    return retryTime;
  }
  shouldRotate(code) {
    if (!this.appContext.settings.features.socket.rotate_error_codes.includes(code)) return false;
    if (this.rotateCount >= this.urls.length - 1) return false;
    return true;
  }
  rotateEndpoint() {
    this.rotateCount++;
    this.wsURL = makeURL(this.appContext, this.urls[this.rotateCount], { t: Date.now() });
    logger(this.appContext).verbose(`Rotating endpoint to ${this.wsURL}`);
  }
  start({ retryOnClose = true } = {}) {
    logger(this.appContext, true).verbose(`Application is starting...`);
    this.ws = new WebSocket(this.wsURL, {
      headers: {
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        connection: "Upgrade",
        host: new URL(this.wsURL).host,
        origin: "https://chat.zalo.me",
        prgama: "no-cache",
        "sec-websocket-extensions": "permessage-deflate; client_max_window_bits",
        "sec-websocket-version": "13",
        upgrade: "websocket",
        "user-agent": this.userAgent,
        cookie: this.cookie,
      },
    });
    this.ws.onopen = () => {
      this.onConnectedCallback();
      logger(this.appContext, true).success(`Application is connected successfully`);
      this.emit("connected");
    };
    this.ws.onclose = (event) => {
      logger(this.appContext, true).verbose(`Application is closed with code: ${event.code} - ${event.reason}`);
      this.reset();
      this.emit("disconnected", event.code);
      const retry = retryOnClose && this.canRetry(event.code);
      if (retry && retryOnClose) {
        const shouldRotate = this.shouldRotate(event.code);
        if (shouldRotate) this.rotateEndpoint();
        setTimeout(() => {
          this.start({ retryOnClose });
        }, retry);
      } else {
        this.onClosedCallback(event.code);
        this.emit("closed", event.code);
      }
    };
    this.ws.onerror = (event) => {
      logger(this.appContext, true).error(`Error WebSocket With: ${event.error}`);
      this.onErrorCallback(event.error);
      this.emit("error", event.error);
    };
    this.ws.onmessage = async (event) => {
      const { data } = event;
      if (!(data instanceof Buffer)) return;
      const encodedHeader = data.subarray(0, 4);
      const [version, cmd, subCmd] = getHeader(encodedHeader);
      try {
        const dataToDecode = data.subarray(4);
        const decodedData = new TextDecoder("utf-8").decode(dataToDecode);
        if (decodedData.length == 0) return;
        const parsed = JSON.parse(decodedData);
        if (version == 1) {
          // Update Cipher Key New || Cập Nhật Khóa Mã Hóa Mới
          if (cmd == CommandTypeCode.AUTHEN && subCmd == 1 && hasOwn(parsed, "key")) this.updateCipherKey(parsed);
          // Personal Messages || Tin Nhắn Cá Nhân
          else if (cmd == CommandTypeCode.PUSH_MSG_1_1 && subCmd == 0) await this.handlePersonalMessages(parsed);
          // Clear Unreads Message Personal || Dọn dẹp đánh dấu tin nhắn chưa đọc cá nhân
          else if (cmd == CommandTypeCode.CLEAR_UNREADS_1_1 && subCmd == 0)
            await this.handleSyncDataMessage(parsed, false, true);
          // Group messages || Tin Nhắn Nhóm/Cộng Đồng
          else if (cmd == CommandTypeCode.PUSH_MSG_GROUP && subCmd == 0) await this.handleGroupMessages(parsed);
          // Clear Unreads Message Group || Dọn dẹp đánh dấu tin nhắn chưa đọc trong nhóm
          else if (cmd == CommandTypeCode.CLEAR_UNREADS_GROUP && subCmd == 0)
            await this.handleSyncDataMessage(parsed, true, true);
          // Delivery Message Personal - Seen Message Personal || Tin Nhắn Đã Gửi Cá Nhân - Tin Nhắn Đã Xem Cá Nhân
          else if (cmd == CommandTypeCode.PUSH_STATUS_1_1 && subCmd == 0)
            await this.handleSyncDataMessage(parsed, false);
          // Delivery Message Group - Seen Message Group || Tin Nhắn Đã Gửi Đến Nhóm - Tin Nhắn Đã Xem Trong Nhóm
          else if (cmd == CommandTypeCode.PUSH_STATUS_GROUP && subCmd == 0)
            await this.handleSyncDataMessage(parsed, true);
          // Controls/Events || Điều Khiển/Sự Kiện
          else if (cmd == CommandTypeCode.CTRL_PUSH_CTRL && subCmd == 0) await this.handleControlEvents(parsed);
          // Someone is typing a message in Private of Group (Not Community)
          // Phát hiện người nào đang gõ tin nhắn trong cá nhân hoặc nhóm (không phải cộng đồng)
          else if (cmd == CommandTypeCode.CTRL_ACTION && subCmd == 0) await this.handleTyping(parsed);
          // Reactions || Thả Cảm Xúc
          else if (cmd == CommandTypeCode.CTRL_PUSH_REACT && subCmd == 0) await this.handleReactions(parsed);
          // Clear Unreads Reaction Personal/Group || Dọn dẹp đánh dấu tin nhắn chưa đọc cá nhân/nhóm/cộng đồng
          else if (cmd == CommandTypeCode.CTRL_PUSH_CLEAR_REACT && subCmd == 0)
            await this.handleSyncDataMessage(parsed, true, true);
          // Data Key My Cloud Media || Dữ liệu Khóa trên My Cloud Media
          else if (cmd == CommandTypeCode.CLOUD.PUSH && subCmd == 0) await this.handleSendDataMyCloud(parsed);
          else if (cmd == CommandTypeCode.CLOUD.NEED_VERIFY && subCmd == 0) await this.handleSendDataMyCloud(parsed);
          else if (cmd == CommandTypeCode.CLOUD.DONE_MIGRATE && subCmd == 0) await this.handleSendDataMyCloud(parsed);
          // Detect Login Session || Phát hiện phiên đăng nhập song song
          else if (
            (cmd == SignalCommands.INIT.INIT_SESSION ||
              cmd == SignalCommands.INIT.ACK_INIT_SESSION ||
              cmd == SignalCommands.INIT.REQUEST_PREKEYS) &&
            subCmd == 1
          )
            await this.handleDetectLoginSession(parsed);
          // Connection closed (3000,0) || Kết nối đã đóng (3000,0)
          else if (cmd == CommandTypeCode.MAX_CONNECTION && subCmd == 0) await this.handleConnectionClosed(parsed);
        }
      } catch (error) {
        logger(this.appContext).error(`Error parsing data: ${error}`);
        this.onErrorCallback(error);
        this.emit("error", error);
      }
    };
  }

  updateCipherKey(parsed) {
    this.cipherKey = parsed.key;
    if (this.pingInterval) clearInterval(this.pingInterval);
    const ping = () => {
      const payload = {
        version: 1,
        cmd: 2,
        subCmd: 1,
        data: { eventId: Date.now() },
      };
      const encodedData = new TextEncoder().encode(JSON.stringify(payload.data));
      const dataLength = encodedData.length;
      const data = new DataView(Buffer.alloc(4 + dataLength).buffer);
      data.setUint8(0, payload.version);
      data.setInt32(1, payload.cmd, true);
      data.setInt8(3, payload.subCmd);
      encodedData.forEach((e, i) => {
        data.setUint8(4 + i, e);
      });
      this.ws.send(data);
    };
    this.pingInterval = setInterval(() => {
      ping();
    }, this.appContext.settings.features.socket.ping_interval);
  }

  /**
   * Handle Personal Messages && Undo Message Personal
   * Xử Lý Tin Nhắn Cá Nhân && Xử Lý Tin Nhắn Bị Undo Cá Nhân
   */
  async handlePersonalMessages(parsed) {
    const parsedData = (await decodeEventData(parsed, this.cipherKey)).data;
    const { msgs } = parsedData;
    for (const msg of msgs) {
      if (typeof msg.content == "object" && msg.content && hasOwn(msg.content, "deleteMsg")) {
        const undoObject = new Undo(msg, false, this.appContext);
        if (undoObject.isSelf && !this.selfListen) continue;
        this.emit("undo", undoObject);
      } else {
        const messageObject = new Message(msg, this.appContext.uid);
        if (messageObject.isSelf && !this.selfListen) continue;
        this.onMessageCallback(messageObject);
        this.emit("message", messageObject);
      }
    }
  }

  /**
   * Handle Group Messages && Undo Message Group
   * Xử Lý Tin Nhắn Nhóm && Xử Lý Tin Nhắn Bị Undo Nhóm
   */
  async handleGroupMessages(parsed) {
    const parsedData = (await decodeEventData(parsed, this.cipherKey)).data;
    const { groupMsgs } = parsedData;
    for (const msg of groupMsgs) {
      if (typeof msg.content == "object" && msg.content && hasOwn(msg.content, "deleteMsg")) {
        const undoObject = new Undo(msg, true, this.appContext);
        if (undoObject.isSelf && !this.selfListen) continue;
        this.emit("undo", undoObject);
      } else {
        const messageObject = new GroupMessage(msg, this.appContext.uid);
        if (messageObject.isSelf && !this.selfListen) continue;
        this.onMessageCallback(messageObject);
        this.emit("message", messageObject);
      }
    }
  }

  /**
   * Handle Control Events
   * Xử Lý Điều Khiển Sự Kiện
   */
  async handleControlEvents(parsed) {
    const parsedData = (await decodeEventData(parsed, this.cipherKey)).data;
    const { controls } = parsedData;
    for (const control of controls) {
      if (control.content.act_type == "file_done") {
        const data = {
          fileUrl: control.content.data.url,
          fileId: control.content.fileId,
        };
        if (data.fileUrl && !data.fileUrl.includes("createby=")) {
          data.fileUrl = data.fileUrl + (data.fileUrl.includes("?") ? "&" : "?") + "createby=NguyenGiaHung_Bot";
        }
        const uploadCallback = this.appContext.uploadCallbacks.get(String(control.content.fileId));
        if (uploadCallback) uploadCallback(data);
        this.appContext.uploadCallbacks.delete(String(control.content.fileId));
        this.emit("upload_attachment", data);
      } else if (control.content.act_type == "voice_aac_success") {
        const data = {
          fileUrl: control.content.data["5"] || control.content.data["6"],
          fileId: control.content.fileId,
        };
        if (data.fileUrl && !data.fileUrl.includes("createby=")) {
          data.fileUrl = data.fileUrl + (data.fileUrl.includes("?") ? "&" : "?") + "createby=NguyenGiaHung_Bot";
        }
        const uploadCallback = this.appContext.uploadCallbacks.get(String(control.content.fileId));
        if (uploadCallback) uploadCallback(data);
        this.appContext.uploadCallbacks.delete(String(control.content.fileId));
        this.emit("upload_attachment", data);
      } else if (control.content.act_type == "group") {
        if (control.content.act == "join_reject") continue;
        const groupEventData =
          typeof control.content.data == "string" ? JSON.parse(control.content.data) : control.content.data;
        const groupEvent = initializeGroupEvent(
          groupEventData,
          getGroupEventType(control.content.act),
          this.appContext
        );
        if (groupEvent.isSelf && !this.selfListen) continue;
        this.emit("group_event", groupEvent);
      }
    }
  }

  /**
   * Handle Reactions
   * Xử Lý Thả Cảm Xúc
   */
  async handleReactions(parsed) {
    const parsedData = (await decodeEventData(parsed, this.cipherKey)).data;
    const { reacts, reactGroups } = parsedData;
    for (const react of reacts) {
      react.content = JSON.parse(react.content);
      const reactionObject = new Reaction(react, false, this.appContext);
      if (reactionObject.isSelf && !this.selfListen) continue;
      this.emit("reaction", reactionObject);
    }
    for (const reactGroup of reactGroups) {
      reactGroup.content = JSON.parse(reactGroup.content);
      const reactionObject = new Reaction(reactGroup, true, this.appContext);
      if (reactionObject.isSelf && !this.selfListen) continue;
      this.emit("reaction", reactionObject);
    }
  }

  /**
   * Someone is typing a message in Private of Group (Not Community)
   * Phát hiện người nào đang gõ tin nhắn trong cá nhân hoặc nhóm (không phải cộng đồng)
   */
  async handleTyping(parsed) {
    const data = JSON.parse(parsed.data);
    if (data.error_code !== 0) return;

    const actions = data.data.actions;
    for (const action of actions) {
      if (action.act_type === "typing") {
        const rawData = action.data.replace(/\\/g, "");
        const matches = {
          gid: rawData.match(/"gid":"(\d+)"/)?.[1],
          uid: rawData.match(/"uid":"(\d+)"/)?.[1],
          ts: rawData.match(/"ts":\s*"(\d+)"/)?.[1],
          isPC: rawData.match(/"isPC":(\d+)/)?.[1],
        };

        if (!matches.uid || !matches.ts) continue;

        const typingEvent = {
          userId: matches.uid,
          timestamp: Number(matches.ts),
          isPC: Boolean(Number(matches.isPC)),
          type: action.act,
        };

        if (action.act === "gtyping" && matches.gid) {
          typingEvent.groupId = matches.gid;
        }

        this.emit("typing", typingEvent);
      }
    }
  }

  /**
   * Handle Sync Data Message (Personal and Group)
   * Xử Lý Đồng Bộ Dữ Liệu Tin Nhắn (Cá Nhân và Nhóm)
   * @param {Object} parsed - Parsed data from WebSocket
   * @param {boolean} isGroup - True for group messages, false for personal messages
   * @param {boolean} isSkipProcess - Skip processing if true
   */
  async handleSyncDataMessage(parsed, isGroup = false, isSkipProcess = false) {
    if (isSkipProcess) return;
    const parsedData = (await decodeEventData(parsed, this.cipherKey)).data;
    const {
      clearUnreads: clearUnreadsMsgs,
      delivereds: deliveredMsgs,
      seens: seenMsgs,
      groupSeens: groupSeenMsgs,
      msgs: msgs,
      groupMsgs: groupMsgs,
      pageMsgs: pageMsgs,
    } = parsedData;

    // Handle delivered messages
    if (Array.isArray(deliveredMsgs) && deliveredMsgs.length > 0) {
      let deliveredObjects;
      if (isGroup) {
        deliveredObjects = deliveredMsgs.map((delivered) => new GroupDeliveredMessage(this.appContext.uid, delivered));
        if (!this.selfListen) deliveredObjects = deliveredObjects.filter((delivered) => !delivered.isSelf);
      } else {
        deliveredObjects = deliveredMsgs.map((delivered) => new UserDeliveredMessage(delivered));
      }
      this.emit("delivered_messages", deliveredObjects);
    }

    // Handle seen messages
    const seenMsgsToProcess = isGroup ? groupSeenMsgs : seenMsgs;
    if (Array.isArray(seenMsgsToProcess) && seenMsgsToProcess.length > 0) {
      let seenObjects;
      if (isGroup) {
        seenObjects = seenMsgsToProcess.map((seen) => new GroupSeenMessage(this.appContext.uid, seen));
        if (!this.selfListen) seenObjects = seenObjects.filter((seen) => !seen.isSelf);
      } else {
        seenObjects = seenMsgsToProcess.map((seen) => new UserSeenMessage(seen));
      }
      this.emit("seen_messages", seenObjects);
    }

    // Handle clear unreads messages
    if (Array.isArray(clearUnreadsMsgs) && clearUnreadsMsgs.length > 0) {
      this.emit("clear_unreads_messages", clearUnreadsMsgs);
    }
  }

  /**
   * Detect Login Session
   * Phát hiện phiên đăng nhập song song
   */
  async handleDetectLoginSession(parsed) {
    const parsedData = (await decodeEventData(parsed, this.cipherKey)).data;
    const { queueStatus, eesession } = parsedData;
    if (Array.isArray(eesession) && eesession.length > 0) {
      const firstEesession = eesession[0];
      const { cmd, subCmd, msgId, sessionData } = firstEesession;
      const getTypePlatform = (deviceId) => (deviceId === 0 ? "App" : deviceId === 1 ? "Web" : "PC");
      if (cmd === SignalCommands.INIT.REQUEST_PREKEYS) {
        const { err, keyId, count, type, ts } = sessionData;
        logger(this.appContext).info(
          `REQUEST PREKEYS - Logging In On Another Platform >>> TYPE REQUEST PREKEYS: ${getTypePlatform(type)}`
        );
      } else {
        const { uidFrom, uidTo, reqServerTs, forwardTs, data, deviceId, msgId, type } = sessionData;
        logger(this.appContext).info(`Thông báo phiên đăng nhập song song >>> Nền Tảng: ${getTypePlatform(deviceId)}`);
      }
    }
  }

  /**
   * Send Key Data My Cloud Media
   * Gửi Khóa Dữ liệu My Cloud Media
   */
  async handleSendDataMyCloud(parsed) {
    const parsedData = (await decodeEventData(parsed, this.cipherKey)).data;
    const data = deepParseJSON(parsedData);
    this.emit("data_cloud_media", data);
  }

  /**
   * Handle Connection Closed (Another Connection Opened)
   * Xử Lý Kết Nối Đóng (Có Kết Nối Khác Được Mở)
   */
  async handleConnectionClosed(parsed) {
    logger(this.appContext).warn("Another connection has been opened, the current connection will be closed.");
    if (this.ws.readyState !== WebSocket.CLOSED) this.ws.close(CloseWebSocketReason.AnotherConnection);
  }

  stop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    this.reset();

    this.onConnectedCallback = () => {};
    this.onClosedCallback = () => {};
    this.onErrorCallback = () => {};
    this.onMessageCallback = () => {};

    this.removeAllListeners();
  }

  reset() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      if (this.ws.readyState !== WebSocket.CLOSED) {
        this.ws.close(CloseWebSocketReason.ManualClosure);
      }
      this.ws = null;
    }
    this.cipherKey = undefined;
    if (this.pingInterval) clearInterval(this.pingInterval);
  }
}
function getHeader(buffer) {
  if (buffer.byteLength < 4) {
    throw new Error("Invalid header");
  }
  return [buffer[0], buffer.readUInt16LE(1), buffer[3]];
}