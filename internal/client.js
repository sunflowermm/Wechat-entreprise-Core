/**
 * qyapi 客户端（对应 Maven `wecom-sdk` 模块中的 API 调用层：token + `/cgi-bin/*`）
 * @see https://developer.work.weixin.qq.com/document
 */
const WEComBaseUrl = "https://qyapi.weixin.qq.com/cgi-bin";

const tokenCache = new Map();

function makeErr(message, details = {}) {
  const err = new Error(message);
  err.details = details;
  return err;
}

export async function getAccessToken({ corpId, agentSecret }) {
  if (!corpId || !agentSecret) {
    throw makeErr("WeCom 配置不完整：缺少 corpId 或 agentSecret", { corpId, agentSecret });
  }

  const cacheKey = `${corpId}|${agentSecret}`;
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expires_at > now + 60_000) {
    return cached.access_token;
  }

  const url = `${WEComBaseUrl}/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(agentSecret)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw makeErr("请求 WeCom gettoken 失败", { status: res.status, statusText: res.statusText });
  }

  const data = await res.json();
  if (data.errcode !== 0) {
    throw makeErr("WeCom gettoken 返回错误", data);
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in * 1000 : 7200_000;
  tokenCache.set(cacheKey, {
    access_token: data.access_token,
    expires_at: now + expiresIn,
  });

  return data.access_token;
}

export async function callWeComApi({ corpId, agentSecret, path, method = "POST", body, query }) {
  const p = String(path || "").replace(/^\/+/, "");
  if (!p) {
    throw makeErr("WeCom 调用缺少 path", { path });
  }

  const accessToken = await getAccessToken({ corpId, agentSecret });

  const searchParams = new URLSearchParams({ access_token: accessToken });
  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      searchParams.set(key, String(value));
    }
  }

  const url = `${WEComBaseUrl}/${p}?${searchParams.toString()}`;

  const init = { method };
  if (body && method !== "GET" && method !== "HEAD") {
    init.headers = { "Content-Type": "application/json; charset=utf-8" };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    throw makeErr("WeCom API HTTP 请求失败", { path: p, status: res.status, statusText: res.statusText });
  }

  const data = await res.json();
  if (data.errcode != null && data.errcode !== 0) {
    throw makeErr("WeCom API 返回错误", { path: p, ...data });
  }

  return data;
}

/** @see https://developer.work.weixin.qq.com/document/path/90236 */
export async function sendApplicationMessage(opts) {
  const { corpId, agentSecret, agentId, payload } = opts;
  const aid = typeof agentId === "string" ? parseInt(agentId, 10) : Number(agentId);
  if (!Number.isFinite(aid)) {
    throw makeErr("WeCom: agentId 无效", { agentId });
  }
  return callWeComApi({
    corpId,
    agentSecret,
    path: "message/send",
    method: "POST",
    body: { agentid: aid, ...payload },
  });
}
