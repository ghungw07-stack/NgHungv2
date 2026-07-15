import { decryptResp, getSignKey, makeURL, ParamsEncryptor, request } from "../utils.js";
export async function login(zaloData) {
  const encryptedParams = await getEncryptParam(zaloData.appContext, zaloData.enableEncryptParam, "getlogininfo");
  try {
    const response = await request(
      zaloData.appContext,
      makeURL(
        zaloData.appContext,
        "https://wpa.chat.zalo.me/api/login/getLoginInfo",
        Object.assign(Object.assign({}, encryptedParams.params), { nretry: 0 }, false)
      )
    );
    if (!response.ok) throw new Error("Failed to fetch login info: " + response.statusText);
    const data = await response.json();
    if (encryptedParams.enk) {
      const decryptedData = decryptResp(encryptedParams.enk, data.data);
      return decryptedData != null && typeof decryptedData != "string" ? decryptedData : null;
    }
    return null;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to fetch login info: " + error);
  }
}
export async function getServerInfo(zaloData) {
  const encryptedParams = await getEncryptParam(zaloData.appContext, zaloData.enableEncryptParam, "getserverinfo");
  try {
    const response = await request(
      zaloData.appContext,
      makeURL(
        zaloData.appContext,
        "https://wpa.chat.zalo.me/api/login/getServerInfo",
        {
          imei: zaloData.appContext.imei,
          type: zaloData.appContext.options.typeLogin,
          client_version: zaloData.appContext.options.apiVersion,
          computer_name: "Web",
          signkey: encryptedParams.params.signkey,
        },
        false
      )
    );
    if (!response.ok) throw new Error("Failed to fetch server info: " + response.statusText);
    const data = await response.json();
    if (data.data == null) throw new Error("Failed to fetch server info: " + data.error);
    return data.data;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to fetch server info: " + error);
  }
}
async function getEncryptParam(appContext, encryptParams, type) {
  const params = {};
  const data = {
    computer_name: "Web",
    imei: appContext.imei,
    language: appContext.language,
    ts: Date.now(),
  };
  const encryptedData = await _encryptParam(appContext, data, encryptParams);
  if (encryptedData == null) Object.assign(params, data);
  else {
    const { encrypted_params, encrypted_data } = encryptedData;
    Object.assign(params, encrypted_params);
    params.params = encrypted_data;
  }
  params.type = appContext.options.typeLogin;
  params.client_version = appContext.options.apiVersion;
  params.signkey =
    type == "getserverinfo"
      ? getSignKey(type, {
          imei: appContext.imei,
          type: appContext.options.typeLogin,
          client_version: appContext.options.apiVersion,
          computer_name: "Web",
        })
      : getSignKey(type, params);
  return {
    params,
    enk: encryptedData ? encryptedData.enk : null,
  };
}
async function _encryptParam(appContext, data, encryptParams) {
  if (encryptParams) {
    const encryptor = new ParamsEncryptor({
      type: appContext.options.typeLogin,
      imei: appContext.imei,
      firstLaunchTime: Date.now(),
    });
    try {
      const stringifiedData = JSON.stringify(data);
      const encryptedKey = encryptor.getEncryptKey();
      const encodedData = ParamsEncryptor.encodeAES(encryptedKey, stringifiedData, "base64", false);
      const params = encryptor.getParams();
      return params
        ? {
            encrypted_data: encodedData,
            encrypted_params: params,
            enk: encryptedKey,
          }
        : null;
    } catch (error) {
      throw new Error("Failed to encrypt params: " + error);
    }
  }
  return null;
}
