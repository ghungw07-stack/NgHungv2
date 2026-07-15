import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const sendCallVoiceFactory = apiFactory()((api, appContext, utils) => {
  const callURL1 = utils.makeURL(
    `${api.zpwServiceMap.voice_call[0]}/api/voicecall/requestcall`,
    {
      zpw_type: appContext.options.typeLogin,
      zpw_ver: 24,
    },
    false
  );

  const callURL2 = utils.makeURL(
    `${api.zpwServiceMap.voice_call[0]}/api/voicecall/request`,
    {
      zpw_ver: appContext.options.apiVersion,
      zpw_type: 24,
    },
    false
  );

  const callURL3 = utils.makeURL(
    `${api.zpwServiceMap.voice_call[0]}/api/voicecall/ringring`,
    {
      zpw_ver: appContext.options.apiVersion,
      zpw_type: 24,
    },
    false
  );

  return async function sendCallVoice(targetId) {
    let randomId = Math.floor(Date.now() / 1000);

    const params = {
      calleeId: targetId,
      callId: randomId,
      codec: "[]",
      typeRequest: 1,
      imei: appContext.imei,
    };
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response1 = await utils.request(callURL1, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });
    const result1 = await utils.resolve(response1);
    if (result1.status !== 0) throw new ZaloApiError(result1.msg, result1.status);

    const params2 = {
      calleeId: targetId,
      rtcpAddress: result1.rtcpIP,
      rtpAddress: result1.rtpIP,
      codec: JSON.stringify([
        {
          dynamicFptime: 0,
          frmPtime: 20,
          name: "opus/16000/1",
          payload: 112,
        },
      ]),
      session: result1.sessId,
      callId: randomId,
      imei: appContext.imei,
      subCommand: 3,
    };
    const encryptedCallParams = utils.encodeAES(JSON.stringify(params2));

    const response2 = await utils.request(callURL2, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedCallParams,
      }),
    });
    const result2 = await utils.resolve(response2);
    if (result2.status !== 0) throw new ZaloApiError(result2.msg, result2.status);

    // const params3 = {
    //   callerId: result2.data.callerId,
    //   callId: randomId,
    //   status: 0,
    //   imei: appContext.imei,
    // };
    // const encryptedCallParams3 = encodeAES(appContext.secretKey, JSON.stringify(params3));
    // const response3 = await utils.request(callURL3, {
    //   method: "POST",
    //   body: new URLSearchParams({
    //     params: encryptedCallParams3,
    //   }),
    // });
    // const result3 = await handleZaloResponse(response3, appContext);
    // if (result3.error) throw new ZaloApiError(result3.error.message, result3.error.code);

    return result2;
  };
});
