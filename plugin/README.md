# Wechat-entreprise-Core 插件目录

本 Core 的**业务插件**放在此目录下的 `*.js` 文件，由 `PluginsLoader` 自动加载（与 `core/system-Core/plugin/` 相同约定）。

- **基类**：`src/infrastructure/plugins/plugin.js`
- **示例**：`core/system-Core/plugin/*.js`
- **文档**：`docs/plugin-base.md`、`docs/plugins-loader.md`

企业微信消息经 `events/wecom.js` 注入 `e.reply` 后进入统一 `plugins.deal`；新插件只需声明规则（命令/关键词等）并实现处理逻辑，无需改 Tasker/HTTP。

**约定**：不在 `constructor` 内放置可变缓存；使用类字段或 `init()`。`segment` 使用全局 `segment`，勿从 `#oicq` 导入。
