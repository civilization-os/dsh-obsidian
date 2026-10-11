import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config, NoteStatus, NoteType } from '../types.ts'
import { ObsidianGraph } from '../engine/graph.ts'
import { appendStructuredDailyNote } from '../engine/daily.ts'
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
    description: '查看当前连接的 Obsidian Vault 知识库状态、笔记总数、MOC 地图总数以及用户当前正在阅读的活跃笔记。',
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

      const mocs = graph.getMocs()

      return {
        connected: true,
        vaultName: vaultInfo.name,
        vaultPath: vaultInfo.path,
        totalNotes: graph.notes.size,
        totalMocs: mocs.length,
        mocs: mocs.map(m => ({ title: m.title, path: m.path, domain: m.domain })),
        activeNote: activeRel,
        activeNoteTitle: activeTitle,
      }
    },
  })

  // 2. 列出库内所有的 MOC (Map of Content 语义地图)
  reg({
    name: 'obsidian_list_mocs',
    description: '获取知识库内所有的 MOC（Map of Content 语义地图/人工知识目录）。核心原则：不要靠文件夹树找知识，优先靠 MOC 导航寻找知识脉络。',
    parameters: {},
    output,
    isConcurrencySafe: () => true,
    async execute() {
      const mocs = graph.getMocs()
      return {
        totalMocs: mocs.length,
        mocs,
      }
    },
  })

  // 3. 将笔记挂载到指定 MOC 地图
  reg({
    name: 'obsidian_link_to_moc',
    description: '将一篇知识笔记自动挂载归档到指定的 MOC 地图小节下，避免新创建的笔记成为孤岛。',
    parameters: {
      moc: { type: 'string', required: true, description: '目标 MOC 名称或路径（如 "AI-Agent MOC" 或 "基础科学总览"）' },
      heading: { type: 'string', required: true, description: '挂载的目标小节标题（如 "Framework"、"Memory"、"核心概念"）' },
      noteName: { type: 'string', required: true, description: '被挂载的笔记名称（如 "Agent Memory Architecture"）' },
    },
    output,
    async execute(args: { moc: string; heading: string; noteName: string }) {
      const ok = graph.linkNoteToMoc(args.moc, args.heading, args.noteName)
      return {
        success: ok,
        message: ok
          ? `已成功将 [[${args.noteName}]] 挂载至 MOC [${args.moc}] 的「${args.heading}」板块下。`
          : `未能找到或更新指定的 MOC [${args.moc}]。`,
      }
    },
  })

  // 4. 获取当前 Obsidian 客户端活跃笔记详情
  reg({
    name: 'obsidian_get_active_note',
    description: '获取用户在 Obsidian 桌面端当前正在阅读或编辑的笔记内容及其结构化元数据（Frontmatter、出链、入链）。',
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

  // 5. 结构化检索笔记（支持关键词、标签、以及 type/domain/status 属性过滤）
  reg({
    name: 'obsidian_search',
    description: '在 Obsidian 知识库中检索笔记。支持关键词匹配、标签过滤，以及面向未来 AI 的结构化属性过滤（type/domain/status）。',
    parameters: {
      query: { type: 'string', description: '搜索关键词或标题' },
      tag: { type: 'string', description: '标签过滤（可选，无需带 # 号）' },
      type: { type: 'string', enum: ['knowledge', 'moc', 'concept', 'project', 'daily', 'resource'], description: '按笔记类型过滤' },
      domain: { type: 'string', description: '按领域过滤（如 middleware, cs, ai-agent, math）' },
      status: { type: 'string', enum: ['draft', 'growing', 'stable', 'archived'], description: '按笔记成熟度状态过滤' },
      limit: { type: 'number', description: '返回最大条数（默认 15）' },
    },
    output,
    isConcurrencySafe: () => true,
    async execute(args: { query?: string; tag?: string; type?: NoteType; domain?: string; status?: NoteStatus; limit?: number }) {
      const matches = graph.search(args.query || '', {
        tag: args.tag,
        type: args.type,
        domain: args.domain,
        status: args.status,
        limit: args.limit || 15,
      })
      return {
        totalMatches: matches.length,
        results: matches,
      }
    },
  })

  // 6. 读取指定笔记（包含双链与属性）
  reg({
    name: 'obsidian_read_note',
    description: '读取指定 Obsidian 笔记的内容，并返回结构化的 Frontmatter（type, domain, status, related 等）、出链与反向入链。',
    parameters: {
      path: { type: 'string', required: true, description: '笔记路径（如 "基础科学/数学.md"）或简写名称（如 "第一节 函数"）' },
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

  // 7. 新建或更新知识笔记（强制/规范化 YAML 元数据，支持挂载 MOC）
  reg({
    name: 'obsidian_write_note',
    description: '新建或全量保存笔记。遵循规范化 Frontmatter 约束（title, type, domain, status, related），并可自动挂载至指定 MOC。',
    parameters: {
      path: { type: 'string', required: true, description: '笔记目标路径（如 "Inbox/Kafka Direct Memory.md"）' },
      content: { type: 'string', required: true, description: 'Markdown 笔记正文' },
      title: { type: 'string', description: '笔记标题（可选，默认由文件名推导）' },
      type: { type: 'string', enum: ['knowledge', 'moc', 'concept', 'project', 'daily', 'resource'], description: '笔记类型，默认 knowledge' },
      domain: { type: 'string', description: '所属知识领域（如 middleware, cs, ai-agent, math, backend）' },
      status: { type: 'string', enum: ['draft', 'growing', 'stable', 'archived'], description: '成熟度状态，默认 draft 或 growing' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
      related: { type: 'array', items: { type: 'string' }, description: '关联的 MOC 或前置知识点双链（如 ["[[Middleware MOC]]"]）' },
      targetMoc: { type: 'string', description: '若需要自动将此笔记归档到某个 MOC，填入 MOC 名称' },
      mocHeading: { type: 'string', description: '目标 MOC 中的小节标题（如 "Memory", "Framework"）' },
    },
    output,
    async execute(args: {
      path: string
      content: string
      title?: string
      type?: NoteType
      domain?: string
      status?: NoteStatus
      tags?: string[]
      related?: string[]
      targetMoc?: string
      mocHeading?: string
    }) {
      const relPath = args.path.endsWith('.md') ? args.path : `${args.path}.md`
      if (!isPathAllowed(relPath, vaultInfo.path, config.excludePatterns)) {
        throw new Error(`安全拦截：路径 "${relPath}" 禁止写入。`)
      }

      const fullPath = join(vaultInfo.path, relPath)
      mkdirSync(dirname(fullPath), { recursive: true })

      let { frontmatter, body } = parseFrontmatter(args.content)
      const nowStr = new Date().toISOString().slice(0, 10)
      const cleanTitle = args.title || basename(relPath, '.md')

      if (config.autoManageFrontmatter !== false) {
        frontmatter.title = cleanTitle
        frontmatter.type = args.type || frontmatter.type || 'knowledge'
        if (args.domain) frontmatter.domain = args.domain
        frontmatter.status = args.status || frontmatter.status || 'growing'
        if (!frontmatter.created) frontmatter.created = nowStr
        frontmatter.updated = nowStr

        if (args.tags && args.tags.length > 0) {
          const mergedTags = Array.from(new Set([...(frontmatter.tags || []), ...args.tags]))
          frontmatter.tags = mergedTags
        }
        if (args.related && args.related.length > 0) {
          const mergedRelated = Array.from(new Set([...(frontmatter.related || []), ...args.related]))
          frontmatter.related = mergedRelated
        }
      }

      const finalMarkdown = stringifyFrontmatter(frontmatter, body)
      writeFileSync(fullPath, finalMarkdown, 'utf8')

      // 增量更新图谱索引
      const stat = { mtimeMs: Date.now(), size: Buffer.byteLength(finalMarkdown) }
      graph.indexFile(relPath, fullPath, stat.mtimeMs, stat.size)
      graph.recomputeBacklinks()

      let mocMessage = ''
      if (args.targetMoc && args.mocHeading) {
        const linked = graph.linkNoteToMoc(args.targetMoc, args.mocHeading, cleanTitle)
        if (linked) {
          mocMessage = `，并已挂载到 MOC [${args.targetMoc}] 的「${args.mocHeading}」小节`
        }
      }

      return {
        success: true,
        path: relPath,
        bytes: Buffer.byteLength(finalMarkdown),
        message: `成功保存结构化知识笔记：${relPath}${mocMessage}。`,
      }
    },
  })

  // 8. 局部补丁修改笔记
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

  // 9. 今日日记结构化沉淀（拒绝流水账，作为知识与灵感孵化入口）
  reg({
    name: 'obsidian_append_daily',
    description: '将工作成果、故障排查或灵感构想结构化记入今日日记。坚决杜绝纯文本流水账！必须提炼并包含产生的原子知识双链 [[知识名]]。',
    parameters: {
      entry: { type: 'string', required: true, description: '工作解决的问题或灵感核心概述（例如："解决生产环境 Kafka Consumer OOM 问题"）' },
      category: { type: 'string', enum: ['Work', 'Ideas'], description: '条目分类：Work(工作实战) 或 Ideas(构想灵感)，默认 Work' },
      generatedKnowledge: { type: 'array', items: { type: 'string' }, description: '本次工作沉淀提炼出的原子知识点卡片名称（如 ["Kafka Direct Memory", "JSON Streaming Parse"]）' },
      ideas: { type: 'array', items: { type: 'string' }, description: '衍生的架构构想或探索课题（如 ["Agent Memory Architecture"]）' },
    },
    output,
    async execute(args: { entry: string; category?: 'Work' | 'Ideas'; generatedKnowledge?: string[]; ideas?: string[] }) {
      const result = appendStructuredDailyNote(vaultInfo.path, args, config)
      if (result.success) {
        const full = join(vaultInfo.path, result.filePath)
        graph.indexFile(result.filePath, full, Date.now(), 0)
        graph.recomputeBacklinks()
      }
      return result
    },
  })

  // 10. 在系统客户端打开
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
