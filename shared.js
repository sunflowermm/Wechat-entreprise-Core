/**
 * Wechat-entreprise-Core 共享常量与工具（与 Feishu-Core/shared.js 对齐）
 */

export const WECOM_PREFIX = "wecom_";
export const DEFAULT_ACCOUNT_ID = "default";

/** 由账号 ID 得到 Bot 侧 self_id（如 wecom_default） */
export function toSelfId(accountId) {
  return WECOM_PREFIX + (accountId ?? DEFAULT_ACCOUNT_ID);
}

/**
 * 解析服务端口：优先 cfg.port / cfg._port，其次 process.argv 的 server <port>
 * @param {object} [cfg]
 * @returns {number|null}
 */
export function resolveServerPort(cfg) {
  const fromCfg = cfg?.port ?? cfg?._port;
  if (fromCfg != null && !Number.isNaN(Number(fromCfg))) return Number(fromCfg);
  const idx = process.argv.indexOf("server");
  if (idx >= 0 && process.argv[idx + 1]) {
    const p = parseInt(process.argv[idx + 1], 10);
    if (!Number.isNaN(p)) return p;
  }
  return null;
}

/**
 * 从事件 data 解析企业微信账号 ID（供 sendFriendMsg / sendGroupMsg）
 * @param {object} data
 * @returns {string|null}
 */
export function resolveAccountIdFromData(data) {
  if (!data) return null;
  if (data.wecom_account_id != null && data.wecom_account_id !== "") return String(data.wecom_account_id);
  const selfId = data.self_id;
  if (typeof selfId === "string" && selfId.startsWith(WECOM_PREFIX)) return selfId.slice(WECOM_PREFIX.length);
  return null;
}

/** 回调 URL 路径前缀，默认 `/wecom/callback`，与 `wecom.yaml` 中 `callbackPath` 一致 */
export function normalizeCallbackBase(p) {
  const s = String(p ?? "").trim() || "/wecom/callback";
  const trimmed = s.replace(/\/+$/, "");
  return trimmed || "/wecom/callback";
}
