import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory, getMd5LargeFileFromUrl, getFileInfoFromUrl } from "../utils.js";
import { checkExstentionFileRemote } from "../../utils/util.js";

export const sendFileFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/asyncfile/msg`, {
    nretry: "0",
  });

  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/asyncfile/msg`, {
    nretry: "0",
  });
  return async function sendFile(message, fileUrl, ttl = 0, fileNameInput, fileSizeInput, extInput, md5FileInput) {
    if (!message) throw new ZaloApiError("Missing message");
    let fileName = fileNameInput;
    let fileSize = fileSizeInput;
    let ext = extInput;
    let md5File = md5FileInput;

    if (!ext) {
      ext = await checkExstentionFileRemote(fileUrl);
    }
    if (!fileName || !fileSize) {
      const { fileName: fileNameRemote, fileSize: fileSizeRemote } = await getFileInfoFromUrl(fileUrl);
      fileName = fileNameRemote;
      fileSize = fileSizeRemote;
    }
    if (!md5File) {
      md5File = (await getMd5LargeFileFromUrl(fileUrl, fileSize)).data;
    }

    const threadId = message.threadId;
    const threadType = message.type;
    const isGroupMessage = threadType === MessageType.GroupMessage;

    const params = {
      fileId: Date.now(),
      checksum: md5File,
      checksumSha: "",
      extension: ext,
      totalSize: fileSize,
      fileName: fileName,
      clientId: Date.now(),
      fType: 1,
      fileCount: 0,
      fdata: "{}",
      fileUrl: fileUrl,
      zsource: 402,
      ttl: ttl,
    };

    if (threadType === MessageType.GroupMessage) {
      params.grid = String(threadId);
    } else {
      params.toid = String(threadId);
    }

    if (message.data?.content && typeof message.data.content === "string") {
      params.msg = message.data.content;
    }
    if (message.data?.mentions) {
      params.mentionInfo = JSON.stringify(message.data.mentions);
    }

    const url = isGroupMessage ? groupMessageServiceURL : directMessageServiceURL;
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(url, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});
