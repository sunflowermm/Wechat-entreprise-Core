/**
 * 企业微信回调 HTTP：GET 校验 URL、POST 加密包（业务逻辑在 Tasker.handleEncryptedPost）
 * 路由：`{callbackPath}/:accountId`，由 `init` 读取 `wecom.yaml` 后挂载。
 */
import express from "express";
import BotUtil from "../../../src/utils/botutil.js";
import { getWecomCallbackBase } from "../internal/account.js";
import { wecomTaskerSingleton } from "../tasker/WechatEntreprise.js";

const readWecomXmlBody = express.text({
  type: () => true,
  limit: "2mb",
  defaultCharset: "utf-8",
});

async function handleWecomGetVerify(req, res, bot) {
  const result = await wecomTaskerSingleton.verifyCallbackUrl(req.params.accountId, req.query);
  if (!result.ok) {
    Bot.makeLog("warn", `[WeCom] URL 校验失败: ${result.reason}`, "wecom.http");
    return res.status(403).send("verify failed");
  }
  return res.status(200).send(result.echostr);
}

async function handleWecomPost(req, res, bot) {
  const xmlRaw = typeof req.body === "string" ? req.body : String(req.body ?? "");
  const { status, body } = await wecomTaskerSingleton.handleEncryptedPost(req.params.accountId, req.query, xmlRaw);
  return res.status(status).send(body);
}

export default {
  name: "wecom-callback",
  dsc: "企业微信自建应用回调",
  priority: 88,
  routes: [],

  init: async function (app, bot) {
    const base = await getWecomCallbackBase();
    BotUtil.makeLog("info", `[WeCom] 回调路由: GET/POST ${base}/:accountId`, "wecom.http");

    const self = this;
    app.get(`${base}/:accountId`, self.wrapHandler(handleWecomGetVerify, bot));
    app.post(`${base}/:accountId`, readWecomXmlBody, self.wrapHandler(handleWecomPost, bot));
  },
};
