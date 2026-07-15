/**
 * 企业微信事件监听：订阅 wecom.message / wecom.notice，挂载 e.reply 后走 plugins.deal。
 */
import EventListenerBase from "../../../src/infrastructure/listener/base.js";
import { errorHandler, ErrorCodes } from "../../../src/utils/error-handler.js";

export default class WecomEvent extends EventListenerBase {
  _listenersInitialized = false;

  constructor() {
    super("wecom");
  }

  async init() {
    if (this._listenersInitialized) return;
    const bot = this.bot || AgentRuntime;
    bot.on("wecom.message", (e) => this.handle(e, true));
    bot.on("wecom.notice", (e) => this.handle(e, false));
    this._listenersInitialized = true;
  }

  normalizeBase(e) {
    e.bot = e.bot || (e.self_id ? AgentRuntime[e.self_id] : null);
    if (!e.bot) {
      AgentRuntime.makeLog("warn", `[WeCom] AgentRuntime 不存在: ${e.self_id}`, e.self_id);
      return false;
    }
    this.ensureEventId(e);
    if (!this.markProcessed(e)) return false;
    this.markAdapter(e, { isWecom: true });
    return true;
  }

  setupReply(e) {
    if (e.reply || !e.bot?.tasker) return;
    const tasker = e.bot.tasker;
    e.reply = async (msg = "") => {
      if (msg == null) return false;
      try {
        if (e.message_type === "group" && e.group_id) return await tasker.sendGroupMsg(e, msg);
        if (e.message_type === "private" && e.user_id) return await tasker.sendFriendMsg(e, msg);
        AgentRuntime.makeLog("warn", "[WeCom] 无法发送", e.self_id);
        return false;
      } catch (err) {
        errorHandler.handle(err, { context: "WecomEvent.reply", selfId: e.self_id, code: ErrorCodes.SYSTEM_ERROR }, true);
        return false;
      }
    };
  }

  async handle(e, isMessage) {
    try {
      if (!this.normalizeBase(e)) return;
      if (isMessage && e.post_type === "message") this.setupReply(e);
      await this.plugins.deal(e);
    } catch (err) {
      errorHandler.handle(err, { context: "WecomEvent.handle", selfId: e?.self_id, code: ErrorCodes.SYSTEM_ERROR }, true);
      AgentRuntime.makeLog("error", `[WeCom] 处理失败: ${err?.message}`, e?.self_id, err);
    }
  }
}
