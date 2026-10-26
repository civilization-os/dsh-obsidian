# @civilization/dsh-obsidian

**DeepSeek Harness (DSH) 原生 Obsidian 知识库与 MOC 双链图谱联动插件**

---

## 🌟 核心认知与治理原则

> **“不要靠目录找知识，靠 MOC 找；Daily 不是流水账，而是新知识的孵化入口。”**

本插件深度融合了现代知识网络（MOC / LYT 体系）与面向 AI Agent 的强约束设计：

- 🗺️ **MOC（Map of Content）优先导航**：
  自动全库识别与维护 MOC 地图笔记（如 `[[AI-Agent MOC]]`、`[[基础科学总览]]`），AI 在检索知识时优先沿 MOC 脉络钻取，新建笔记时自动归巢挂载至对应 MOC，彻底杜绝孤岛笔记。
- 🏷️ **统一 YAML Frontmatter 强约束规范**：
  严格维护面向未来 Agent 的属性标准：
  ```yaml
  ---
  title: Kafka Exactly Once
  type: knowledge        # knowledge(原子知识) | moc(地图) | concept | project | daily
  domain: middleware     # middleware | cs | ai-agent | math | backend
  status: stable         # draft | growing | stable | archived
  created: 2026-10-11
  updated: 2026-10-11
  tags:
    - kafka
  related:
    - "[[Middleware MOC]]"
  ---
  ```
  赋能 AI 进行多维结构化精确过滤（如按 `domain: middleware AND status: stable` 检索）。
- 📅 **Daily Note 入口化孵化器（杜绝流水账）**：
  摒弃无意义的纯文本流水账，强制以 `## Work`（工作实战）与 `## Ideas`（灵感思考）结构化组织，并自动提炼出独立的原子知识双链 `[[新知识名]]`。Daily 仅作为入口，知识沉淀为原子卡片。
- ⚡ **零侵入活跃笔记感知**：
  监听 `.obsidian/workspace.json` 毫秒级感知你在 Obsidian 桌面端正聚焦的笔记（Active Note）。
- 🔗 **Windows 系统级 URI 唤醒**：
  通过 `obsidian://open?vault=...&file=...` 一键呼出系统 Obsidian 窗口并精准定位。
- 🎨 **DSH 官方右侧栏 MOC 看板**：
  提供 MOC 地图矩阵、当前笔记出入链透视、以及结构化 Daily 快速收集箱。

---

## 🧭 AI 模型专属工具集 (Tools)

| 工具名称 | 核心功能简介 |
| :--- | :--- |
| `obsidian_get_vault_status` | 查看 Vault 状态、笔记总数、MOC 总数、活跃笔记信息。 |
| `obsidian_list_mocs` | **列出库内所有的 MOC 知识地图**（大纲主题与下属链接），AI 检索知识时的第一站。 |
| `obsidian_link_to_moc` | **将笔记挂载至 MOC 地图**：指定目标小节追加 `[[新笔记]]`，让知识形成闭环。 |
| `obsidian_get_active_note` | 获取用户在桌面端当前正聚焦的笔记内容及结构化属性。 |
| `obsidian_search` | 搜索笔记，支持关键词、标签、以及面向 AI 的 `type`、`domain`、`status` 属性过滤。 |
| `obsidian_read_note` | 读取指定笔记的详细正文、YAML Frontmatter 属性、出链与入链网络。 |
| `obsidian_write_note` | 保存结构化笔记，强制/规范 YAML 属性，并支持一键指定 `targetMoc` 自动挂载。 |
| `obsidian_patch_note` | 局部追加或按二级标题定位修改，保留原有笔记内容，杜绝暴力覆盖。 |
| `obsidian_append_daily` | **结构化记入今日日记**：以 Work / Ideas 沉淀条目并挂载 `[[原子知识双链]]`。 |
| `obsidian_open_in_app` | 通过 Windows 系统协议在 Obsidian 客户端中唤醒并定位对应笔记。 |

---

## 🏗️ 构建与调试

```powershell
# 编译打包（双端产物：Node 宿主 + 浏览器侧边栏）
pnpm run build

# 类型检查
pnpm run typecheck

# 运行 MOC 自动化实测
node tests/test-engine.mjs
```

---

## 🔌 Harness / Cordis 版本兼容

当前版本已在 DeepSeek Harness **0.2.1-rc.3** 及 Cordis **4.0.5** 上完成全量验证：
- 双端构建（CJS 客户端侧边栏 + ESM Node 宿主服务）零警告编译；
- 依赖对齐 `@deepseek-ai/schemastery: 3.18.5` 与 `@deepseek-ai/dsh-tools: 0.2.1-rc.3`；
- MOC 知识图谱索引与 Vault 自动化引擎测试全部通过；
- `peerDependencies` 支持 `@deepseek-ai/cordis: >=4.0.0` 与 `@deepseek-ai/dsh-tools: >=0.1.2-rc.1`。
