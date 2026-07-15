/**
 * Wechat-entreprise Tasker：回调解密与派发 → `wecom.message` / `wecom.notice`；发送 `message/send`。
 * 与 system-Core / Feishu-Core 一致：协议与凭证均在 `core/*` 闭环，不修改 `src/infrastructure`。
 */
import { TaskerBase } from "../../../src/infrastructure/tasker/tasker-base.js";
import { EventNormalizer } from "../../../src/utils/event-normalizer.js";
import fs from "fs/promises";
import {
  mergeAccountConfig,
  resolveAccount,
  listEnabledAccounts,
  sendApplicationMessage,
  verifyMsgSignature,
  decryptAndVerifyCorp,
  extractCdata,
  extractEncryptFromCallbackXml,
} from "../internal/index.js";
import { normalizeCallbackBase, resolveAccountIdFromData, toSelfId } from "../shared.js";

function normalizeAllowEntry(raw) {
  const s = String(raw).trim();
  return s ? s.toLowerCase() : "";
}

function isAllowedByAllowlist(allowFrom, userId) {
  const list = Array.isArray(allowFrom) ? allowFrom.map(normalizeAllowEntry).filter(Boolean) : [];
  if (list.length === 0) return false;
  if (list.includes("*")) return true;
  const uid = normalizeAllowEntry(userId ?? "");
  return uid ? list.includes(uid) : false;
}

function parseInnerXml(xml) {
  return {
    toUser: extractCdata(xml, "ToUserName"),
    fromUser: extractCdata(xml, "FromUserName"),
    createTime: extractCdata(xml, "CreateTime"),
    msgType: extractCdata(xml, "MsgType"),
    content: extractCdata(xml, "Content"),
    msgId: extractCdata(xml, "MsgId"),
    agentId: extractCdata(xml, "AgentID"),
    chatId: extractCdata(xml, "ChatId"),
    picUrl: extractCdata(xml, "PicUrl"),
    event: extractCdata(xml, "Event"),
    eventKey: extractCdata(xml, "EventKey"),
  };
}

class WecomTasker {
  id = "WXWork";
  name = "Wechat-entreprise";
  path = "wecom";

  async _getWecomCfg() {
    const config = global.CommonConfigRegistry?.get?.("wecom");
    if (!config?.read) return null;
    try {
      return await config.read(true);
    } catch (e) {
      AgentRuntime.makeLog("warn", `[WeCom] 读取配置失败: ${e?.message}`, "Wecom");
      return null;
    }
  }

  async load() {
    const runtimeConfig = await this._getWecomCfg();
    if (!runtimeConfig?.enabled) {
      AgentRuntime.makeLog("info", "[WeCom] 未启用，跳过", "Wecom");
      return;
    }
    const accounts = listEnabledAccounts(runtimeConfig);
    if (!accounts.length) {
      AgentRuntime.makeLog("warn", "[WeCom] 无可用账号（corpId/agentId/agentSecret）", "Wecom");
      return;
    }
    for (const account of accounts) {
      try {
        await this._ensureSecretFromFile(account);
        await this._startAccount(account);
      } catch (err) {
        AgentRuntime.makeLog("error", `[WeCom] 启动 ${account.accountId} 失败: ${err?.message}`, "Wecom", err);
      }
    }
  }

  async _ensureSecretFromFile(account) {
    if (account.config?.agentSecretFile && !account.agentSecret) {
      const secret = await fs.readFile(account.config.agentSecretFile, "utf8");
      account.agentSecret = (secret || "").trim();
      account.configured = !!(account.corpId && account.agentId && account.agentSecret);
    }
  }

  async _startAccount(account) {
    if (!account.configured) return;
    const { accountId } = account;
    const selfId = toSelfId(accountId);
    if (!AgentRuntime[selfId]) {
      TaskerBase.createBotInstance(
        {
          id: selfId,
          name: account.config?.name || `WeCom-${accountId}`,
          type: "wecom",
          info: { corp_id: account.corpId, agent_id: account.agentId },
          tasker: this,
        },
        AgentRuntime
      );
      if (!AgentRuntime.uin.includes(selfId)) AgentRuntime.uin.push(selfId);
    }
    const runtimeConfig = await this._getWecomCfg();
    const merged = runtimeConfig ? mergeAccountConfig(runtimeConfig, accountId) : {};
    const base = normalizeCallbackBase(merged.callbackPath);
    const port = global.runtimeConfig?.port ?? global.runtimeConfig?._port ?? "";
    AgentRuntime.makeLog(
      "mark",
      `[WeCom] 账号 ${accountId} 已注册；回调 URL: https://你的域名${base}/${accountId}（XRK 端口 ${port}）`,
      "Wecom"
    );
  }

  async verifyCallbackUrl(accountId, query) {
    const msg_signature = query?.msg_signature;
    const timestamp = query?.timestamp;
    const nonce = query?.nonce;
    const echostr = query?.echostr;
    if (!echostr || !msg_signature) return { ok: false, reason: "缺少 msg_signature 或 echostr" };

    const runtimeConfig = await this._getWecomCfg();
    if (!runtimeConfig) return { ok: false, reason: "配置不可用" };
    const account = resolveAccount(runtimeConfig, accountId);
    if (!account.token || !account.encodingAESKey || !account.corpId) {
      return { ok: false, reason: "回调 token / encodingAESKey / corpId 未配置" };
    }
    if (!verifyMsgSignature(account.token, timestamp, nonce, echostr, msg_signature)) {
      return { ok: false, reason: "签名无效" };
    }
    try {
      const plain = decryptAndVerifyCorp(account.encodingAESKey, echostr, account.corpId);
      return { ok: true, echostr: plain };
    } catch (e) {
      return { ok: false, reason: e?.message || "解密失败" };
    }
  }

  /**
   * POST 加密包：验签、解密、派发（供 HTTP 层调用，避免与 Tasker 重复逻辑）
   * @returns {{ status: number, body: string }}
   */
  async handleEncryptedPost(accountId, query, xmlRaw) {
    const runtimeConfig = await this._getWecomCfg();
    if (!runtimeConfig) return { status: 503, body: "wecom config unavailable" };
    if (!runtimeConfig.enabled) return { status: 503, body: "wecom disabled" };

    const merged = mergeAccountConfig(runtimeConfig, accountId);
    const token = merged.token?.trim();
    const encodingAESKey = merged.encodingAESKey?.trim();
    const corpId = merged.corpId?.trim();

    if (!token || !encodingAESKey || !corpId) {
      AgentRuntime.makeLog("warn", "[WeCom] 回调缺少 token/encodingAESKey/corpId", "Wecom");
      return { status: 500, body: "server misconfigured" };
    }

    const encrypt = extractEncryptFromCallbackXml(xmlRaw);
    if (!encrypt) {
      AgentRuntime.makeLog("warn", "[WeCom] POST 无 Encrypt 字段", "Wecom");
      return { status: 400, body: "bad xml" };
    }

    if (!verifyMsgSignature(token, query?.timestamp, query?.nonce, encrypt, query?.msg_signature)) {
      AgentRuntime.makeLog("warn", "[WeCom] POST 签名无效", "Wecom");
      return { status: 403, body: "signature" };
    }

    try {
      const innerXml = decryptAndVerifyCorp(encodingAESKey, encrypt, corpId);
      this.handleIncomingXml(accountId, innerXml);
      return { status: 200, body: "success" };
    } catch (e) {
      AgentRuntime.makeLog("error", `[WeCom] 解密失败: ${e?.message}`, "Wecom", e);
      return { status: 400, body: "decrypt failed" };
    }
  }

  handleIncomingXml(accountId, xml) {
    const parsed = parseInnerXml(xml);
    const msgType = (parsed.msgType || "").toLowerCase();

    if (msgType === "event") {
      this._emitNotice(accountId, parsed);
      return;
    }

    if (["text", "image", "voice", "video", "file", "location", "emotion"].includes(msgType)) {
      void this._emitMessageAsync(accountId, parsed, xml);
      return;
    }

    AgentRuntime.makeLog("info", `[WeCom] 未处理的消息类型: ${msgType}`, "Wecom");
  }

  _emitNotice(accountId, parsed) {
    const selfId = toSelfId(accountId);
    const chatId = parsed.chatId || null;
    const data = {
      post_type: "notice",
      sub_type: parsed.event || "event",
      self_id: selfId,
      user_id: parsed.fromUser || null,
      group_id: chatId,
      chat_id: chatId,
      time: Math.floor(Number(parsed.createTime) || Date.now() / 1000),
      wecom_account_id: accountId,
      wecom_event_key: parsed.eventKey || null,
      wecom_parsed: parsed,
    };
    data.bot = AgentRuntime[selfId] || null;
    data.event_id = `wecom_${selfId}_evt_${parsed.event}_${data.time}_${Math.random().toString(36).slice(2, 8)}`;
    data.tasker = "wecom";
    data.isWecom = true;
    if (data.bot) AgentRuntime.em("wecom.notice", data);
  }

  async _emitMessageAsync(accountId, parsed, rawXml) {
    const runtimeConfig = await this._getWecomCfg();
    const merged = runtimeConfig ? mergeAccountConfig(runtimeConfig, accountId) : {};

    const selfId = toSelfId(accountId);
    const chatId = parsed.chatId || "";
    const isGroup = Boolean(chatId);
    const fromUser = parsed.fromUser || "";

    if (isGroup) {
      if (merged.groupPolicy === "disabled") return;
      if (merged.groupPolicy === "allowlist" && !isAllowedByAllowlist(merged.groupAllowFrom, fromUser)) return;
    } else {
      if (merged.dmPolicy === "disabled") return;
      if (merged.dmPolicy === "allowlist" && !isAllowedByAllowlist(merged.allowFrom, fromUser)) return;
    }

    let text = parsed.content || "";
    if (parsed.msgType === "image") {
      text = parsed.picUrl ? `[图片] ${parsed.picUrl}` : "[图片]";
    } else if (parsed.msgType && parsed.msgType !== "text") {
      text = text || `[${parsed.msgType}]`;
    }

    const msgId = parsed.msgId || `mid_${Date.now()}`;
    const data = {
      post_type: "message",
      message_type: isGroup ? "group" : "private",
      self_id: selfId,
      user_id: fromUser,
      group_id: isGroup ? chatId : null,
      chat_id: chatId || null,
      message_id: msgId,
      raw_message: text,
      msg: text,
      message: [{ type: "text", text }],
      time: Math.floor(Number(parsed.createTime) || Date.now() / 1000),
      wecom_account_id: accountId,
      wecom_msg_type: parsed.msgType,
      wecom_raw_xml: rawXml,
    };

    data.bot = AgentRuntime[selfId] || null;
    if (!data.bot) {
      AgentRuntime.makeLog("warn", `[WeCom] AgentRuntime 不存在: ${selfId}`, selfId);
      return;
    }
    data.event_id = `wecom_${selfId}_${msgId}_${data.time}`;
    data.tasker = "wecom";
    data.isWecom = true;
    data.isGroup = isGroup;
    data.isPrivate = !isGroup;
    data.sender = {
      user_id: fromUser,
      nickname: fromUser,
      card: fromUser,
    };
    EventNormalizer.normalize(data, {
      defaultPostType: "message",
      defaultMessageType: data.message_type,
      defaultSubType: isGroup ? "normal" : "friend",
      defaultUserId: fromUser,
    });
    AgentRuntime.makeLog("info", `[WeCom] 消息 ${selfId} <= ${isGroup ? chatId : fromUser}`, selfId);
    AgentRuntime.em("wecom.message", data);
  }

  async sendFriendMsg(data, msg) {
    const accountId = resolveAccountIdFromData(data);
    const userId = data?.user_id;
    if (!accountId || !userId) return null;
    return this._send(accountId, { touser: userId }, msg);
  }

  async sendGroupMsg(data, msg) {
    const accountId = resolveAccountIdFromData(data);
    const chatId = data?.group_id || data?.chat_id;
    if (!accountId || !chatId) return null;
    return this._send(accountId, { chatid: chatId }, msg);
  }

  async _send(accountId, target, text) {
    const runtimeConfig = await this._getWecomCfg();
    if (!runtimeConfig) throw new Error("WeCom 配置不可用");
    const account = resolveAccount(runtimeConfig, accountId);
    if (!account.configured) throw new Error(`WeCom 账号 "${accountId}" 未配置`);
    let content = String(text ?? "");
    const prefix = account.config?.responsePrefix;
    if (prefix && typeof prefix === "string") content = prefix.trim() + content;
    const renderMode = account.config?.renderMode ?? "auto";
    const useText = renderMode === "raw";

    const payload = useText
      ? { msgtype: "text", text: { content: content.slice(0, 2048) } }
      : { msgtype: "markdown", markdown: { content: content.slice(0, 4090) } };

    const res = await sendApplicationMessage({
      corpId: account.corpId,
      agentSecret: account.agentSecret,
      agentId: account.agentId,
      payload: { ...payload, ...target },
    });
    return { msgid: res.msgid };
  }
}

const _wecomTasker = new WecomTasker();

export function getWecomTasker() {
  return _wecomTasker;
}

export { _wecomTasker as wecomTaskerSingleton };

export function registerWecomTasker(bot = globalThis.AgentRuntime) {
  if (!bot) return;
  if (!Array.isArray(bot.tasker)) bot.tasker = [];
  if (!bot.tasker.some((t) => t?.path === _wecomTasker.path)) {
    bot.tasker.push(_wecomTasker);
  }
}

registerWecomTasker();
