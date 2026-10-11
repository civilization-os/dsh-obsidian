import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../types.ts'
import { ObsidianGraph } from '../engine/graph.ts'
import { appendToDailyNote } from '../engine/daily.ts'
import { buildObsidianUri, openInObsidianApp } from '../bridge/uri.ts'
import { isPathAllowed, readActiveNoteFromWorkspace } from '../engine/vault.ts'
import { parseFrontmatter, stringifyFrontmatter } from '../engine/frontmatter.ts'

const output: any = {
  schema: { type: 'object', additionalProperties: true, properties: {} },
  render: (_args: any, value: any) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

export function registerObsidianTools(
  ctx: any,
  vaultInfo: { path: string; name: string },
  graph: ObsidianGraph,
  config: Config
): void {
  const toolsService = ctx.tools
  if (!toolsService?.register) return

  const reg = (toolDef: any) => {
    ctx.effect(() => toolsService.register(defineTool(toolDef)))
  }

  // 1. 获取 Vault 整体状态与活跃笔记
  reg({
    name: 'obsidian_get_vault_status',
    description: '查看当前连接的 Obsidian Vault 知识库状态、笔记总数以及当前在 Obsidian 客户端中处于聚焦状态的笔记（Active Note）。',
    parameters: {},
    output,
    isConcurrencySafe: () => true,
    async execute() {
      const activeRel = readActiveNoteFromWorkspace(vaultInfo.path)
      let activeTitle: string | null = null
      if (activeRel) {
        const note = graph.getNote(activeRel)
        activeTitle = note ? note.title : basename(activeRel, '.md')
      }

      return {
        connected: true,
        vaultName: vaultInfo.name,
        vaultPath: vaultInfo.path,
        totalNotes: graph.notes.size,
        activeNote: activeRel,
        activeNoteTitle: activeTitle,
      }
    },
  })

  // 2. 获取当前 Obsidian 客户端正处于聚焦状态的笔记详情
  reg({
    name: 'obsidian_get_active_note',
    description: '获取用户在 Obsidian 桌面端当前正在阅读或编辑的笔记内容及其双链元数据。',
    parameters: {},
    output,
    isConcurrencySafe: () => true,
    async execute() {
      const activeRel = readActiveNoteFromWorkspace(vaultInfo.path)
      if (!activeRel) {
        return { active: false, message: '当前 Obsidian 客户端未打开任何笔记或处于空标签页。' }
      }

      const fullPath = join(vaultInfo.path, activeRel)
      if (!existsSync(fullPath)) {
        return { active: false, path: activeRel, message: '活跃笔记文件在磁盘上不存在。' }
      }

      const raw = readFileSync(fullPath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(raw)
      const note = graph.getNote(activeRel)

      return {
        active: true,
        path: activeRel,
        title: note?.title || basename(activeRel, '.md'),
        tags: note?.tags || [],
        outlinks: note?.outlinks || [],
        backlinks: note?.backlinks || [],
        frontmatter,
        content: raw,
      }
    },
  })

  // 3. 搜索笔记
  reg({
    name: 'obsidian_search',
    description: '在 Obsidian 知识库中快速检索笔记，支持关键词匹配、标签过滤和全文匹配。',
    parameters: {
      query: { type: 'string', description: '搜索关键词或标题' },
      tag: { type: 'string', description: '标签过滤（可选，无需带 # 号）' },
      limit: { type: 'number', description: '返回最大条数（默认 15）' },
    },
    output,
    isConcurrencySafe: () => true,
    async execute(args: { query?: string; tag?: string; limit?: number }) {
      const matches = graph.search(args.query || '', { tag: args.tag, limit: args.limit || 15 })
      return {
        totalMatches: matches.length,
        results: matches,
      }
    },
  })

  // 4. 读取指定笔记（包含双链与属性）
  reg({
    name: 'obsidian_read_note',
    description: '读取指定 Obsidian 笔记的内容，并返回结构化的 Frontmatter、出链（Outlinks）与反向入链（Backlinks）。支持传入相对路径或简写笔记名。',
    parameters: {
      path: { type: 'string', required: true, description: '笔记路径（如 "基础科学/考研/数一/第一节 函数.md"）或简写名称（如 "第一节 函数"）' },
    },
    output,
    isConcurrencySafe: () => true,
    async execute(args: { path: string }) {
      const resolved = graph.resolveNotePath(args.path) || (args.path.endsWith('.md') ? args.path : args.path + '.md')
      if (!isPathAllowed(resolved, vaultInfo.path, config.excludePatterns)) {
        throw new Error(`访问受限：路径 "${args.path}" 在排除黑名单中。`)
      }

      const full = join(vaultInfo.path, resolved)
      if (!existsSync(full)) {
        throw new Error(`笔记不存在：未能找到 "${args.path}"。`)
      }

      const raw = readFileSync(full, 'utf8')
      const { frontmatter, body } = parseFrontmatter(raw)
      const note = graph.getNote(resolved)

      return {
        path: resolved,
        title: note?.title || basename(resolved, '.md'),
        tags: note?.tags || [],
        outlinks: note?.outlinks || [],
        backlinks: note?.backlinks || [],
        frontmatter,
        content: raw,
      }
    },
  })

  // 5. 新建或更新完整笔记
  reg({
    name: 'obsidian_write_note',
    description: '在 Obsidian 知识库中新建或全量保存笔记。支持自动维护 Frontmatter 元数据（创建/修改时间与标签）。',
    parameters: {
      path: { type: 'string', required: true, description: '笔记目标路径（如 "Inbox/技术方案.md"）' },
      content: { type: 'string', required: true, description: 'Markdown 笔记正文' },
      title: { type: 'string', description: '笔记标题（可选）' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签列表（可选）' },
    },
    output,
    async execute(args: { path: string; content: string; title?: string; tags?: string[] }) {
      const relPath = args.path.endsWith('.md') ? args.path : `${args.path}.md`
      if (!isPathAllowed(relPath, vaultInfo.path, config.excludePatterns)) {
        throw new Error(`安全拦截：路径 "${relPath}" 禁止写入。`)
      }

      const fullPath = join(vaultInfo.path, relPath)
      mkdirSync(dirname(fullPath), { recursive: true })

      let { frontmatter, body } = parseFrontmatter(args.content)
      const nowStr = new Date().toISOString().slice(0, 10)

      if (config.autoManageFrontmatter !== false) {
        if (!frontmatter.created) frontmatter.created = nowStr
        frontmatter.updated = nowStr
        if (args.title) frontmatter.title = args.title
        if (args.tags && args.tags.length > 0) {
          const mergedTags = Array.from(new Set([...(frontmatter.tags || []), ...args.tags]))
          frontmatter.tags = mergedTags
        }
      }

      const finalMarkdown = stringifyFrontmatter(frontmatter, body)
      writeFileSync(fullPath, finalMarkdown, 'utf8')

      // 增量更新图谱索引
      const stat = { mtimeMs: Date.now(), size: Buffer.byteLength(finalMarkdown) }
      graph.indexFile(relPath, fullPath, stat.mtimeMs, stat.size)
      graph.recomputeBacklinks()

      return {
        success: true,
        path: relPath,
        bytes: Buffer.byteLength(finalMarkdown),
        message: `成功保存笔记：${relPath}`,
      }
    },
  })

  // 6. 局部补丁修改笔记
  reg({
    name: 'obsidian_patch_note',
    description: '对现有笔记进行局部更新或追加小节，避免暴力覆盖全篇。支持按二级标题定位追加。',
    parameters: {
      path: { type: 'string', required: true, description: '笔记路径' },
      content: { type: 'string', required: true, description: '需要追加或插入的内容' },
      heading: { type: 'string', description: '目标二级标题（如 "## 方案选型"），留空则追加在末尾' },
    },
    output,
    async execute(args: { path: string; content: string; heading?: string }) {
      const resolved = graph.resolveNotePath(args.path) || (args.path.endsWith('.md') ? args.path : args.path + '.md')
      if (!isPathAllowed(resolved, vaultInfo.path, config.excludePatterns)) {
        throw new Error(`安全拦截：路径 "${resolved}" 处于保护名单中。`)
      }

      const full = join(vaultInfo.path, resolved)
      if (!existsSync(full)) {
        throw new Error(`笔记不存在：未能找到 "${resolved}"。`)
      }

      const raw = readFileSync(full, 'utf8')
      let updated = raw

      if (args.heading) {
        const cleanHeading = args.heading.startsWith('#') ? args.heading : `## ${args.heading}`
        const headingIdx = updated.indexOf(cleanHeading)
        if (headingIdx !== -1) {
          const nextLineIdx = updated.indexOf('\n', headingIdx)
          if (nextLineIdx !== -1) {
            updated = updated.slice(0, nextLineIdx + 1) + `${args.content.trim()}\n\n` + updated.slice(nextLineIdx + 1)
          } else {
            updated += `\n\n${args.content.trim()}\n`
          }
        } else {
          updated = updated.trimEnd() + `\n\n${cleanHeading}\n\n${args.content.trim()}\n`
        }
      } else {
        updated = updated.trimEnd() + `\n\n${args.content.trim()}\n`
      }

      writeFileSync(full, updated, 'utf8')
      graph.indexFile(resolved, full, Date.now(), Buffer.byteLength(updated))
      graph.recomputeBacklinks()

      return {
        success: true,
        path: resolved,
        message: `已向 ${resolved} 追加内容。`,
      }
    },
  })

  // 7. 快速记入今日日记 (Daily Note)
  reg({
    name: 'obsidian_append_daily',
    description: '将待办、灵感或任务摘要一键追加到用户今日的 Obsidian 日记中。自动识别日记格式与目录。',
    parameters: {
      content: { type: 'string', required: true, description: '要记入今日日记的内容或列表项' },
      heading: { type: 'string', description: '追加到的目标小节（可选，如 "待办事项"、"技术灵感"）' },
    },
    output,
    async execute(args: { content: string; heading?: string }) {
      const result = appendToDailyNote(vaultInfo.path, args.content, config, args.heading)
      if (result.success) {
        const full = join(vaultInfo.path, result.filePath)
        graph.indexFile(result.filePath, full, Date.now(), 0)
        graph.recomputeBacklinks()
      }
      return result
    },
  })

  // 8. 在系统 Obsidian 客户端中唤醒并定位笔记
  reg({
    name: 'obsidian_open_in_app',
    description: '在 Windows 桌面端直接唤醒 Obsidian 并打开指定笔记。若不指定路径，则直接呼出当前 Vault 窗口。',
    parameters: {
      path: { type: 'string', description: '需要定位打开的笔记路径（留空则打开当前活跃笔记或仓库）' },
    },
    output,
    isConcurrencySafe: () => true,
    async execute(args: { path?: string }) {
      const targetPath = args.path || readActiveNoteFromWorkspace(vaultInfo.path) || ''
      const uri = buildObsidianUri({ vault: vaultInfo.name, file: targetPath })
      const ok = await openInObsidianApp(uri)
      return {
        success: ok,
        uri,
        message: ok ? `已在 Obsidian 客户端中唤起并定位：${targetPath || vaultInfo.name}` : '无法唤醒 Obsidian 桌面端。',
      }
    },
  })
}
