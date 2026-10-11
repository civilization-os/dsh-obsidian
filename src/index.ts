import { readFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import { join, basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { Config as PluginConfig } from './types.ts'
import { resolveActiveVault, readActiveNoteFromWorkspace } from './engine/vault.ts'
import { ObsidianGraph } from './engine/graph.ts'
import { registerObsidianTools } from './tools/index.ts'
import { buildObsidianUri, openInObsidianApp } from './bridge/uri.ts'
import { appendToDailyNote } from './engine/daily.ts'

export const name = '@civilization/dsh-obsidian'
export const inject = ['tools', 'webServer', 'skills']

export * from './types.ts'
export * from './engine/vault.ts'
export * from './engine/graph.ts'
export * from './engine/frontmatter.ts'
export * from './engine/daily.ts'
export * from './bridge/uri.ts'

export const Config: Schema<Config> = Schema.object({
  autoDetectVault: Schema.boolean()
    .default(true)
    .description('自动探测本机 Obsidian 正在运行和打开的 Vault 仓库（推荐开启）'),
  customVaultPath: Schema.string()
    .default('')
    .description('自定义 Vault 物理路径（留空则使用自动探测的路径）'),
  watchActiveNote: Schema.boolean()
    .default(true)
    .description('实时感知 Obsidian 活跃笔记（监听 workspace.json，感知你当前正在看的内容）'),
  enableUriJump: Schema.boolean()
    .default(true)
    .description('允许通过 obsidian:// 协议唤起本地 Obsidian 客户端并定位高亮笔记'),
  dailyNotesFolder: Schema.string()
    .default('')
    .description('日记（Daily Notes）存放目录（留空则自动读取 Obsidian 官方日记设置）'),
  defaultNewNoteFolder: Schema.string()
    .default('')
    .description('AI 创建新笔记的默认归档目录（如 "Inbox"，留空则放在根目录）'),
  autoManageFrontmatter: Schema.boolean()
    .default(true)
    .description('自动补全与维护 YAML 属性（如 created, updated 时间戳与 tags）'),
  wikilinkFormat: Schema.union([
    Schema.const('shortest').description('最短名称（如 [[第一节 函数]]）'),
    Schema.const('relative').description('完整相对路径（如 [[基础科学/考研/...]]）'),
  ]).default('shortest').description('双链引用语法偏好'),
  excludePatterns: Schema.string()
    .role('textarea')
    .default('.obsidian/\n.git/\n00 System/Credentials/\n50 Areas/Finance/\n50 Areas/Identity/\n90 Archive/')
    .description('敏感目录过滤黑名单（换行分隔，AI 将无法检索或读取这些路径）'),
  safeWriteMode: Schema.union([
    Schema.const('direct').description('直接写入并同步'),
    Schema.const('backup_on_overwrite').description('覆盖修改前自动保存一份历史副本'),
  ]).default('direct').description('修改与覆盖笔记时的安全策略'),
}).description('Obsidian 知识库连接与联动配置')

async function readSkillContent(): Promise<string> {
  try {
    const skillUrl = new URL('../skills/obsidian-operation/SKILL.md', import.meta.url)
    const text = await readFile(skillUrl, 'utf8')
    return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
  } catch {
    return 'Obsidian 知识库操作与双链集成服务'
  }
}

async function readJsonBody(req: any): Promise<Record<string, any>> {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body) } catch {}
  }
  if (req.readableEnded || req.complete) return {}

  return new Promise((resolve, reject) => {
    let raw = ''
    let timer: any = null
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      req.off?.('data', onData)
      req.off?.('end', onEnd)
      req.off?.('error', onError)
    }
    const onData = (chunk: Buffer) => { raw += chunk.toString('utf8') }
    const onEnd = () => {
      cleanup()
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (err) { reject(err) }
    }
    const onError = (err: any) => { cleanup(); reject(err) }

    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
    timer = setTimeout(() => { cleanup(); resolve({}) }, 2000)
  })
}

function writeJson(res: any, status: number, body: any): void {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
  })
  res.end(data)
}

export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const vaultInfo = resolveActiveVault(config)

  // 1. 注册专属 Skill
  try {
    const skillContent = await readSkillContent()
    ctx.effect(() => (ctx as any).skills?.register?.({
      name: 'obsidian-operation',
      description: 'Inspect, search, read, patch, and manage Obsidian notes, wikilinks, daily notes, and knowledge graph.',
      whenToUse: 'Use when interacting with the Obsidian knowledge base or querying notes and backlinks.',
      source: 'bundled',
      content: skillContent,
    }))
  } catch {}

  if (!vaultInfo) {
    // 未检测到 Vault 时依然允许 WebServer 返回未连接状态
    registerApiRoutes(ctx, null, null, config)
    return
  }

  // 2. 初始化知识图谱内存索引
  const graph = new ObsidianGraph(vaultInfo.path, config)
  await graph.buildIndex()

  // 3. 注册 AI Tools
  registerObsidianTools(ctx, vaultInfo, graph, config)

  // 4. 监听 .obsidian/workspace.json 实时通知（若启用）
  if (config.watchActiveNote !== false) {
    try {
      const workspacePath = join(vaultInfo.path, '.obsidian', 'workspace.json')
      ctx.effect(() => {
        const watcher = watch(workspacePath, () => {
          ctx.emit('obsidian/active-changed' as any, readActiveNoteFromWorkspace(vaultInfo.path))
        })
        return () => watcher.close()
      })
    } catch {}
  }

  // 5. 注册 WebServer API 端点（提供右侧栏交互）
  registerApiRoutes(ctx, vaultInfo, graph, config)
}

function registerApiRoutes(
  ctx: Context,
  vaultInfo: { path: string; name: string } | null,
  graph: ObsidianGraph | null,
  config: Config
): void {
  const webServer = (ctx as any).webServer
  if (!webServer?.register) return

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/dsh-obsidian/api',
    handler: async (req: any, res: any) => {
      const url = new URL(req.url || '/', 'http://localhost')
      const pathname = url.pathname

      // 允许跨域（本地开发）
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        return res.end()
      }

      // 1. 状态查询
      if (pathname === '/dsh-obsidian/api/status' && req.method === 'GET') {
        if (!vaultInfo || !graph) {
          return writeJson(res, 200, {
            connected: false,
            message: '未检测到正在打开的 Obsidian 知识库',
          })
        }

        const activeRel = readActiveNoteFromWorkspace(vaultInfo.path)
        const activeNote = activeRel ? graph.getNote(activeRel) : null

        return writeJson(res, 200, {
          connected: true,
          vaultName: vaultInfo.name,
          vaultPath: vaultInfo.path,
          totalNotes: graph.notes.size,
          activeNote: activeRel,
          activeNoteTitle: activeNote?.title || (activeRel ? basename(activeRel, '.md') : null),
          outlinksCount: activeNote?.outlinks.length || 0,
          backlinksCount: activeNote?.backlinks.length || 0,
        })
      }

      // 2. 活跃笔记详情查询
      if (pathname === '/dsh-obsidian/api/active' && req.method === 'GET') {
        if (!vaultInfo || !graph) {
          return writeJson(res, 400, { error: '未连接 Vault' })
        }

        const activeRel = readActiveNoteFromWorkspace(vaultInfo.path)
        if (!activeRel) {
          return writeJson(res, 200, { active: false })
        }

        const note = graph.getNote(activeRel)
        return writeJson(res, 200, {
          active: true,
          path: activeRel,
          title: note?.title || basename(activeRel, '.md'),
          tags: note?.tags || [],
          outlinks: note?.outlinks || [],
          backlinks: note?.backlinks || [],
        })
      }

      // 3. 搜索
      if (pathname === '/dsh-obsidian/api/search' && req.method === 'GET') {
        if (!graph) return writeJson(res, 200, { results: [] })
        const q = url.searchParams.get('q') || ''
        const tag = url.searchParams.get('tag') || undefined
        const results = graph.search(q, { tag, limit: 20 })
        return writeJson(res, 200, { results })
      }

      // 4. 打开客户端
      if (pathname === '/dsh-obsidian/api/open' && req.method === 'POST') {
        if (!vaultInfo) return writeJson(res, 400, { error: '未连接 Vault' })
        const body = await readJsonBody(req)
        const targetPath = body.path || readActiveNoteFromWorkspace(vaultInfo.path) || ''
        const uri = buildObsidianUri({ vault: vaultInfo.name, file: targetPath })
        const ok = await openInObsidianApp(uri)
        return writeJson(res, 200, { ok, uri })
      }

      // 5. 快速记录到今日日记
      if (pathname === '/dsh-obsidian/api/capture' && req.method === 'POST') {
        if (!vaultInfo) return writeJson(res, 400, { error: '未连接 Vault' })
        const body = await readJsonBody(req)
        if (!body.content?.trim()) {
          return writeJson(res, 400, { error: '记录内容不能为空' })
        }
        const outcome = appendToDailyNote(vaultInfo.path, body.content.trim(), config, body.heading)
        if (graph && outcome.success) {
          graph.indexFile(outcome.filePath, join(vaultInfo.path, outcome.filePath), Date.now(), 0)
          graph.recomputeBacklinks()
        }
        return writeJson(res, 200, outcome)
      }

      writeJson(res, 404, { error: '接口未找到' })
    },
  }))
}
