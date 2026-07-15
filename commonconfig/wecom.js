/**
 * Wechat-entreprise-Core 企业微信通道配置
 *
 * - **逻辑路径**（相对项目根）：`data/server_bots/{port}/wecom.yaml`，`{port}` 来自 `resolveServerPort(global.runtimeConfig)`（与 Feishu 的 `feishu.yaml` 规则一致）
 * - **物理路径**：`ConfigBase` 使用 `paths.root` 拼接，即 `{项目根目录}/data/server_bots/{port}/wecom.yaml`
 * - 业务通过 `CommonConfigRegistry.get('wecom')` 后 `read()` 使用
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import fsSync from "fs";
import ConfigBase from "../../../src/infrastructure/commonconfig/commonconfig.js";
import RuntimeUtil from "../../../src/utils/runtime-util.js";
import { resolveServerPort } from "../shared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE = path.join(__dirname, "wecom.default.yaml");

export default class WecomConfig extends ConfigBase {
  constructor() {
    super({
      name: "wecom",
      displayName: "企业微信通道配置",
      description: "企业微信自建应用回调与消息发送",
      filePath: (runtimeConfig) => {
        const port = resolveServerPort(runtimeConfig ?? global.runtimeConfig);
        if (!port) throw new Error("WecomConfig: 需要端口 (global.runtimeConfig.port 或 node app server <port>)");
        return path.join("data", "server_bots", String(port), "wecom.yaml");
      },
      fileType: "yaml",
      schema: {
        fields: {
          enabled: { type: "boolean", label: "启用", default: false, component: "Switch", group: "基础" },
          name: { type: "string", label: "账号名称", description: "本端展示名", component: "Input", group: "基础" },

          corpId: { type: "string", label: "企业 ID", description: "corpid", component: "Input", group: "应用凭证" },
          agentId: { type: "string", label: "AgentId", description: "应用 AgentId", component: "Input", group: "应用凭证" },
          agentSecret: { type: "string", label: "应用 Secret", component: "InputPassword", group: "应用凭证" },
          agentSecretFile: { type: "string", label: "Secret 文件路径", description: "可选，替代直接填 Secret", component: "Input", group: "应用凭证" },

          token: { type: "string", label: "回调 Token", description: "与接收消息服务器配置一致", component: "Input", group: "回调" },
          encodingAESKey: { type: "string", label: "EncodingAESKey", description: "43 位，与后台一致", component: "Input", group: "回调" },
          callbackPath: { type: "string", label: "回调路径前缀", default: "/wecom/callback", component: "Input", group: "回调" },

          dmPolicy: { type: "string", label: "私聊策略", enum: ["open", "allowlist", "disabled"], default: "open", component: "Select", group: "策略" },
          groupPolicy: { type: "string", label: "群策略", enum: ["open", "allowlist", "disabled"], default: "open", component: "Select", group: "策略" },
          allowFrom: { type: "array", label: "私聊白名单(userid)", itemType: "string", default: [], component: "Tags", group: "策略" },
          groupAllowFrom: { type: "array", label: "群聊白名单(userid)", itemType: "string", default: [], component: "Tags", group: "策略" },

          responsePrefix: { type: "string", label: "回复前缀", component: "Input", group: "发送" },
          renderMode: { type: "string", label: "renderMode", enum: ["auto", "raw"], default: "auto", component: "Select", group: "发送" },

          defaultAccount: { type: "string", label: "默认账号 ID", component: "Input", group: "高级" },

          accounts: {
            type: "object",
            label: "多账号",
            description: "键为账号 id，值为该账号 corpId/agentSecret 等",
            component: "SubForm",
            fields: {},
            example: { default: { corpId: "", agentId: "", agentSecret: "" } },
            group: "高级",
          },
        },
      },
    });
  }

  async read(useCache = true) {
    let targetPath;
    try {
      targetPath = this.getFilePath();
    } catch {
      return await super.read(useCache);
    }
    if (!fsSync.existsSync(targetPath) && fsSync.existsSync(DEFAULT_TEMPLATE)) {
      try {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(DEFAULT_TEMPLATE, targetPath);
        RuntimeUtil.makeLog("info", `[WeCom] 已从默认模板创建: ${targetPath}`, "WecomConfig");
      } catch (e) {
        RuntimeUtil.makeLog("warn", `[WeCom] 创建默认配置失败: ${e?.message}`, "WecomConfig");
      }
    }
    return await super.read(useCache);
  }

  async write(data, options = {}) {
    return await super.write(data, { ...options, cleanEmpty: true });
  }
}
