---
name: obsidian-operation
description: "Inspect, search, read, patch, and manage Obsidian notes with MOC (Map of Content) navigation, canonical YAML schemas, and Daily Note incubator workflows."
whenToUse: "Use when reading, searching, creating, or editing notes in the user's Obsidian knowledge base, querying MOCs, managing daily notes, or curating knowledge networks."
source: bundled
---

# 🧠 Obsidian 知识库认知治理与双链操作规范

本 Skill 指导你在 DeepSeek Harness (DSH) 中以现代知识网络（MOC + 原子笔记 + Daily 入口）的顶级实践来操作用户的 Obsidian 知识库。

---

## 🏛️ 三大核心认知原则（必须严格遵守）

### 1. 🗺️ MOC 优先导航：“不要靠目录找知识，靠 MOC 找”
- **MOC = Map of Content（语义地图/人工知识索引）**。
- **检索工作流**：
  - 当用户提问宏观领域（例如：“我们中间件有哪些积累？”、“AI Agent 的长记忆机制是怎样的？”）时，**禁止盲目遍历目录树**！
  - **第一步**：先调用 `obsidian_list_mocs` 查看库内存在的 MOC 地图；
  - **第二步**：阅读对应的 MOC 笔记（如 `[[AI-Agent MOC]]` 或 `[[Middleware MOC]]`），掌握该领域的核心知识脉络与下属双链；
  - **第三步**：沿着 MOC 中的 `[[wikilink]]` 深入钻取具体的原子知识。
- **新建笔记归巢**：
  - 新建原子知识卡片时，**必须思考并挂载至对应的 MOC 笔记**（通过 `obsidian_write_note` 的 `targetMoc` 或 `obsidian_link_to_moc`），严禁产生无法被溯源的孤岛笔记！

---

### 2. 🏷️ 统一 YAML Frontmatter 规范（面向未来 AI 结构化检索）
每次创建或重构笔记时，**必须规范化输出以下 YAML 核心字段**：

```yaml
---
title: Kafka Exactly Once
type: knowledge        # 枚举：knowledge(原子知识) | moc(地图) | concept(概念) | project(项目) | daily(日记)
domain: middleware     # 领域：middleware | cs | ai-agent | math | backend | frontend
status: stable         # 状态：draft(草稿) | growing(生长中) | stable(稳定) | archived(归档)
created: 2026-10-11
updated: 2026-10-11
tags:
  - kafka
  - distributed-system
related:
  - "[[Middleware MOC]]"
  - "[[Message Queue Architecture]]"
---
```

- **类型精确**：`type` 必须准确标注；
- **领域对齐**：`domain` 统一使用小写英文字符，便于未来精确过滤；
- **关联 MOC**：`related` 中至少关联 1 个上级 MOC 或相关核心概念。

---

### 3. 📅 Daily Note 规范：“坚决不写流水账，Daily 只是入口与孵化器”

- ❌ **严重错误（低价值流水账）**：
  > “今天学习了 Kafka，看了看关于 OOM 的问题。”

- ✅ **标准规范（Daily 孵化器模式）**：
  必须调用 `obsidian_append_daily` 组织为 `Work` 与 `Ideas`，并将关键技术方案提炼为原子知识双链：

  ```markdown
  ## Work
  解决生产环境 Kafka Consumer OOM 问题
  - **产生知识**：
    - [[Kafka Direct Memory 泄露排查]]
    - [[JSON Streaming 大包流式解析最佳实践]]

  ## Ideas
  AI Agent 分层记忆系统设计
  - **衍生思考**：
    - [[Agent Memory Architecture 设计草案]]
  ```

- **原子化下沉**：
  如果用户讨论了一个有长期价值的技术方案并要求记入日记，**除了在 Daily Note 中记录条目外，主动为用户创建对应的 `[[原子知识笔记]]`**（写入独立正文并挂入 MOC）。

---

## 🛠️ 可用工具清单

1. `obsidian_get_vault_status`：获取库状态、笔记总数、MOC 列表与当前活跃笔记。
2. `obsidian_list_mocs`：获取所有 MOC 知识地图（包含各章节主题与下属链接）。
3. `obsidian_link_to_moc`：将新笔记分类挂载到指定 MOC 对应标题下。
4. `obsidian_get_active_note`：获取用户在桌面端当前正在看的笔记。
5. `obsidian_search`：支持关键词、标签、以及 `type` / `domain` / `status` 属性过滤。
6. `obsidian_read_note`：读取笔记内容、Frontmatter 属性、出入链网络。
7. `obsidian_write_note`：创建或全量保存笔记（自动规范化 YAML，支持一键挂载 MOC）。
8. `obsidian_patch_note`：局部追加小节，杜绝暴力覆盖。
9. `obsidian_append_daily`：以 Work/Ideas 结构化条目沉淀至今日日记，拒绝流水账。
10. `obsidian_open_in_app`：在 Windows 系统客户端唤起并高亮定位笔记。
