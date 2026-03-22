# `internal/` — 协议与账号底层

与参考工程 **wecom-sdk**（Maven 多模块）概念对齐，便于对照维护：

| Maven 模块（概念） | 本目录文件 | 说明 |
|-------------------|------------|------|
| `wecom-common` | `callback-crypto.js`、`xml.js` | 加解密、XML 字段提取 |
| `wecom-sdk`（API 层） | `client.js` | `gettoken`、`message/send` 等 `qyapi` 调用 |
| 多企业/路由元数据 | `account.js` | 账号 merge、回调 base 路径 |

对外统一从 `internal/index.js` 再导出；`shared.js`（Core 根目录）仍为全局常量与端口解析，不迁入此处。
