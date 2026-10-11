# @civilization/dsh-obsidian

**DeepSeek Harness (DSH) 原生 Obsidian 知识库与双链图谱联动插件**

---

## 🌟 核心特性

- 🔍 **开箱即用 0 配置探测**：开机自动读取 `%APPDATA%\obsidian\obsidian.json`，秒级识别并绑定当前处于活跃打开状态的本地 Obsidian Vault（知识库）。
- ⚡ **零侵入活跃笔记感知**：无须在 Obsidian 客户端中开启任何后台服务器或安装第三方端口插件，通过监听 `.obsidian/workspace.json` 即可毫秒级感知你在 Obsidian 中正处于阅读或聚焦状态的笔记（Active Note）。
- 🕸️ **内存级双链拓扑图谱**：自动极速索引全库 Markdown 文件，解析 `[[wikilink]]`、别名、`#tag` 与 YAML Frontmatter，支持出链（Outlinks）与反向入链（Backlinks）拓扑回溯。
- 🔗 **系统级 URI 静默唤醒**：集成 Windows `obsidian://open?vault=...&file=...` 协议，可在 DSH 侧边栏或对话中一键呼出桌面端 Obsidian 窗口并高亮定位笔记。
- 📅 **今日日记（Daily Note）一键归档**：自动探测 Obsidian 官方 Daily Notes 目录与命名格式，支持随时随地将灵感、代办或讨论要点追加进今日日志。
- 🤖 **专属 AI Agent Tools 与 Skill**：为 DeepSeek 模型赋予结构化的知识库读写、局部补丁更新、语义检索与双链整理能力。
- 🎨 **DSH 官方右侧栏看板**：可视化查看当前活跃笔记、关联双链网络、即时检索知识库以及快速收集箱（Quick Capture）。

---

## 🧭 AI 模型专属工具 (Tools)

| 工具名称 | 核心功能简介 |
| :--- | :--- |
| `obsidian_get_vault_status` | 查看当前连接的 Vault 状态、笔记总数、活跃笔记名称与路径。 |
| `obsidian_get_active_note` | 获取用户当前在 Obsidian 窗口中打开的笔记内容、标签、出链与入链。 |
| `obsidian_search` | 全文、标题或标签检索笔记，返回匹配列表与上下文片段。 |
| `obsidian_read_note` | 读取指定笔记的详细正文、YAML Frontmatter 属性、出链与入链网络。 |
| `obsidian_write_note` | 新建或全量覆写笔记，自动维护 `created`、`updated` 时间戳与标签。 |
| `obsidian_patch_note` | 局部追加或按二级标题定位修改，保留原有笔记内容，杜绝暴力覆盖。 |
| `obsidian_append_daily` | 将代办事项或讨论摘要快速记入今日日记（Daily Note）。 |
| `obsidian_open_in_app` | 通过 Windows 系统协议在 Obsidian 客户端中唤醒并定位对应笔记。 |

---

## ⚙️ 配置项 (Settings)

本插件采用 `@deepseek-ai/schemastery` 规范，所有选项均可在 DSH 官方插件设置面板中直接可视化修改：

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :---: | :---: | :--- |
| `autoDetectVault` | `boolean` | `true` | 是否自动探测本机当前打开的 Obsidian 知识库 |
| `customVaultPath` | `string` | `""` | 手动指定 Vault 物理路径（留空则使用自动探测的路径） |
| `watchActiveNote` | `boolean` | `true` | 是否实时监听当前在 Obsidian 客户端中打开的笔记 |
| `enableUriJump` | `boolean` | `true` | 是否允许一键唤起本地 Obsidian 桌面端 |
| `dailyNotesFolder` | `string` | `""` | 日记存放目录（留空则自动读取 Obsidian 配置） |
| `defaultNewNoteFolder` | `string` | `""` | AI 新建笔记的默认收件箱目录（如 `Inbox/`） |
| `autoManageFrontmatter`| `boolean` | `true` | 是否自动维护 YAML Frontmatter 中的创建/修改时间与标签 |
| `wikilinkFormat` | `enum` | `'shortest'` | 双链生成偏好：`shortest`（最短名）或 `relative`（相对路径） |
| `excludePatterns` | `string` | *(敏感目录)* | 排除过滤黑名单（换行分隔，AI 无法访问或检索） |
| `safeWriteMode` | `enum` | `'direct'` | 写入安全策略：`direct`（直接落盘）或 `backup_on_overwrite` |

---

## 🏗️ 构建与开发

```powershell
# 安装依赖
pnpm install

# 编译构建（双端产物：Node 宿主 + 浏览器端侧边栏）
pnpm run build

# 启动热重载开发监听
pnpm run dev

# 类型检查
pnpm run typecheck
```
