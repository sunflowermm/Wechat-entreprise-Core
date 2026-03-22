/**
 * 多账号合并、凭证解析、回调路径（对应 SDK 中多企业配置与路由元数据）
 */
import { DEFAULT_ACCOUNT_ID, normalizeCallbackBase } from "../shared.js";

export function listAccountIds(cfg) {
  const accounts = cfg?.accounts;
  if (!accounts || typeof accounts !== "object") return [DEFAULT_ACCOUNT_ID];
  return Object.keys(accounts).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function mergeAccountConfig(cfg, accountId) {
  const { accounts, ...base } = cfg ?? {};
  return { ...base, ...(accounts?.[accountId] ?? {}) };
}

export function resolveAccount(cfg, accountId) {
  const merged = mergeAccountConfig(cfg, accountId);
  const corpId = merged?.corpId?.trim();
  const agentId = merged?.agentId?.trim();
  const agentSecret = merged?.agentSecret?.trim();
  const enabled = (cfg?.enabled !== false) && (merged.enabled !== false);
  return {
    accountId: accountId ?? DEFAULT_ACCOUNT_ID,
    enabled,
    configured: !!(corpId && agentId && agentSecret),
    corpId: corpId || undefined,
    agentId: agentId || undefined,
    agentSecret: agentSecret || undefined,
    token: merged?.token?.trim() || undefined,
    encodingAESKey: merged?.encodingAESKey?.trim() || undefined,
    config: merged,
  };
}

export function listEnabledAccounts(cfg) {
  const accounts = listAccountIds(cfg)
    .map((id) => resolveAccount(cfg, id))
    .filter((a) => a.enabled && a.configured);
  const defaultId = (cfg?.defaultAccount ?? "").trim();
  if (!defaultId) return accounts;
  const idx = accounts.findIndex((a) => a.accountId === defaultId);
  if (idx <= 0) return accounts;
  const out = [...accounts];
  const [one] = out.splice(idx, 1);
  out.unshift(one);
  return out;
}

export async function getWecomCallbackBase() {
  const config = global.ConfigManager?.get?.("wecom");
  if (!config?.read) return normalizeCallbackBase(null);
  try {
    const cfg = await config.read(true);
    return normalizeCallbackBase(cfg?.callbackPath);
  } catch {
    return normalizeCallbackBase(null);
  }
}
