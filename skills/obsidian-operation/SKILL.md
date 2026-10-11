---
name: obsidian-operation
description: "Inspect, search, read, patch, and manage Obsidian notes, wikilinks, daily notes, and knowledge graph in DeepSeek Harness."
whenToUse: "Use when reading, searching, creating, or editing notes in the user's Obsidian knowledge base, managing daily notes, querying backlinks, or interacting with the active Obsidian window."
source: bundled
---

# 🧠 Obsidian 知识库联动与双链操作规范

本 Skill 指导你如何在 DeepSeek Harness (DSH) 中高效、安全地操作用户的 Obsidian 知识库（Vault）。

---

## 🛠️ 可用工具概览

1. **`obsidian_get_vault_status`**：获取 Vault 状态、笔记总数、活跃笔记名称。
2. **`obsidian_get_active_note`**：获取用户在 Obsidian 桌面端当前正在看的笔记内容及出入链。
3. **`obsidian_search`**：全文、标题或标签检索笔记。
4. **`obsidian_read_note`**：按路径或名称精确读取笔记，返回正文、Frontmatter、出链与入链列表。
5. **`obsidian_write_note`**：新建或全量保存笔记，自动维护创建/修改日期和标签。
6. **`obsidian_patch_note`**：局部追加小节，保留原有笔记内容，不暴力覆盖。
7. **`obsidian_append_daily`**：将灵感、代办或讨论要点一键记入今日日记。
8. **`obsidian_open_in_app`**：在 Windows 桌面端直接唤醒 Obsidian 窗口并定位该笔记。

---

## 💡 最佳实践原则

### 1. 善用双链 (`[[wikilink]]`)
- 在撰写知识库笔记时，当提及核心概念、已有文档或相关术语时，**主动使用双链**：
  - 标准格式：`[[概念名称]]`
  - 别名格式：`[[目标文件|显示的别名]]`
- 尽量关联库内已有的相关笔记，保持知识网络的互联互通。

### 2. 避免暴力覆盖（优先使用 `obsidian_patch_note`）
- 除非是全新创建笔记或用户明确要求“重构/全量覆写”，否则请优先使用 `obsidian_patch_note` 在指定的二级标题后追加内容，或者将结论追加在末尾。

### 3. 日常记录与待办归档
- 当用户要求：“记到日记里”、“添加到今天 todo”、“帮我记下这个想法”时：
  - 调用 `obsidian_append_daily`。
  - 格式应简洁精练，条目式组织（`- [ ] 任务` 或 `- 想法记录`）。

### 4. 上下文感知（Active Note 优先）
- 如果用户未指定笔记名，但提问“总结一下这篇文章”、“帮我修改当前笔记”、“给这篇笔记补充一个总结”时：
  - 先调用 `obsidian_get_active_note` 获知用户当前在 Obsidian 中正在聚焦阅读的文件。
