import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import type { Config, MocInfo, MocTopic, NoteInfo, NoteStatus, NoteType, SearchMatch } from '../types.ts'
import { extractInlineTags, extractWikilinks, parseFrontmatter } from './frontmatter.ts'
import { isPathAllowed } from './vault.ts'

export class ObsidianGraph {
  private vaultPath: string
  private config: Config
  public notes = new Map<string, NoteInfo>()
  // 简写名称索引（如 "函数" -> ["基础科学/.../第一节 函数.md"]）
  private nameIndex = new Map<string, string[]>()
  // 入链映射：目标键 -> 引用它的笔记路径集合
  private backlinks = new Map<string, Set<string>>()
  private initialized = false

  constructor(vaultPath: string, config: Config) {
    this.vaultPath = vaultPath
    this.config = config
  }

  /**
   * 初始化全库索引
   */
  public async buildIndex(): Promise<void> {
    this.notes.clear()
    this.nameIndex.clear()
    this.backlinks.clear()

    const scanDir = (dir: string) => {
      let entries: string[] = []
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }

      for (const entry of entries) {
        if (entry.startsWith('.')) continue
        const full = join(dir, entry)
        const rel = relative(this.vaultPath, full).replace(/\\/g, '/')

        if (!isPathAllowed(rel, this.vaultPath, this.config.excludePatterns)) {
          continue
        }

        let stat
        try {
          stat = statSync(full)
        } catch {
          continue
        }

        if (stat.isDirectory()) {
          scanDir(full)
        } else if (stat.isFile() && entry.toLowerCase().endsWith('.md')) {
          this.indexFile(rel, full, stat.mtimeMs, stat.size)
        }
      }
    }

    scanDir(this.vaultPath)
    this.recomputeBacklinks()
    this.initialized = true
  }

  /**
   * 单文件索引
   */
  public indexFile(relPath: string, fullPath: string, mtime: number, size: number): NoteInfo | null {
    try {
      const content = readFileSync(fullPath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(content)
      const outlinks = extractWikilinks(body)
      const inlineTags = extractInlineTags(body)

      const fmTags: string[] = Array.isArray(frontmatter.tags)
        ? frontmatter.tags.map(t => String(t).replace(/^#/, ''))
        : (frontmatter.tag ? [String(frontmatter.tag).replace(/^#/, '')] : [])

      const allTags = Array.from(new Set([...fmTags, ...inlineTags]))
      const cleanName = basename(relPath, '.md')

      // 判定是否属于 MOC (Map of Content) 语义地图
      const isMoc = frontmatter.type === 'moc' ||
        cleanName.toLowerCase().includes('moc') ||
        cleanName.endsWith('总览') ||
        cleanName.endsWith('地图')

      const info: NoteInfo = {
        path: relPath,
        fullPath,
        title: frontmatter.title || cleanName,
        frontmatter,
        tags: allTags,
        outlinks,
        backlinks: [],
        isMoc,
        mtime,
        size,
      }

      this.notes.set(relPath, info)

      // 维护简写名索引
      const list = this.nameIndex.get(cleanName) || []
      if (!list.includes(relPath)) {
        list.push(relPath)
        this.nameIndex.set(cleanName, list)
      }

      return info
    } catch {
      return null
    }
  }

  /**
   * 重新计算所有反向链接拓扑
   */
  public recomputeBacklinks(): void {
    this.backlinks.clear()

    for (const [sourcePath, note] of this.notes) {
      for (const target of note.outlinks) {
        const resolvedPath = this.resolveNotePath(target) || target
        let set = this.backlinks.get(resolvedPath)
        if (!set) {
          set = new Set()
          this.backlinks.set(resolvedPath, set)
        }
        set.add(sourcePath)
      }
    }

    for (const [path, note] of this.notes) {
      const cleanName = basename(path, '.md')
      const byPath = this.backlinks.get(path) || new Set()
      const byName = this.backlinks.get(cleanName) || new Set()
      const merged = Array.from(new Set([...byPath, ...byName]))
      note.backlinks = merged
    }
  }

  /**
   * 将双链中的目标名解析为实际相对路径
   */
  public resolveNotePath(target: string): string | null {
    const cleanTarget = target.replace(/\.md$/i, '')
    if (this.notes.has(cleanTarget + '.md')) {
      return cleanTarget + '.md'
    }
    if (this.notes.has(cleanTarget)) {
      return cleanTarget
    }

    const candidates = this.nameIndex.get(cleanTarget)
    if (candidates && candidates.length > 0) {
      return candidates[0]
    }

    return null
  }

  /**
   * 获取知识库内所有 MOC（Map of Content 语义地图）详情
   */
  public getMocs(): MocInfo[] {
    const mocs: MocInfo[] = []

    for (const [path, note] of this.notes) {
      if (!note.isMoc) continue

      try {
        const raw = readFileSync(note.fullPath, 'utf8')
        const { body } = parseFrontmatter(raw)
        const lines = body.split(/\r?\n/)

        const topics: MocTopic[] = []
        let currentTopic: MocTopic = { heading: 'Overview', links: [] }

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('#')) {
            if (currentTopic.links.length > 0) {
              topics.push(currentTopic)
            }
            currentTopic = {
              heading: trimmed.replace(/^#+\s*/, ''),
              links: [],
            }
          } else {
            const links = extractWikilinks(trimmed)
            for (const link of links) {
              if (!currentTopic.links.includes(link)) {
                currentTopic.links.push(link)
              }
            }
          }
        }
        if (currentTopic.links.length > 0) {
          topics.push(currentTopic)
        }

        mocs.push({
          path,
          title: note.title,
          domain: note.frontmatter.domain,
          topics,
          totalLinks: note.outlinks.length,
        })
      } catch {}
    }

    return mocs
  }

  /**
   * 将一篇新笔记挂载到指定的 MOC 目录下（防止知识产生孤岛）
   */
  public linkNoteToMoc(mocPathOrName: string, heading: string, noteName: string): boolean {
    const resolvedMocPath = this.resolveNotePath(mocPathOrName)
    if (!resolvedMocPath) return false

    const note = this.notes.get(resolvedMocPath)
    if (!note) return false

    try {
      const raw = readFileSync(note.fullPath, 'utf8')
      const targetHeading = heading.startsWith('#') ? heading : `## ${heading}`
      const linkEntry = `- [[${noteName}]]`

      // 避免重复挂载
      if (raw.includes(`[[${noteName}]]`)) {
        return true
      }

      let updated = raw
      const headingIdx = updated.indexOf(targetHeading)
      if (headingIdx !== -1) {
        const nextLineIdx = updated.indexOf('\n', headingIdx)
        if (nextLineIdx !== -1) {
          updated = updated.slice(0, nextLineIdx + 1) + `${linkEntry}\n` + updated.slice(nextLineIdx + 1)
        } else {
          updated += `\n${linkEntry}\n`
        }
      } else {
        // 如果没有该小节，在末尾新增该小节并挂载
        updated = updated.trimEnd() + `\n\n${targetHeading}\n\n${linkEntry}\n`
      }

      writeFileSync(note.fullPath, updated, 'utf8')
      this.indexFile(resolvedMocPath, note.fullPath, Date.now(), Buffer.byteLength(updated))
      this.recomputeBacklinks()
      return true
    } catch {
      return false
    }
  }

  /**
   * 搜索笔记（支持关键词、标签、以及面向 AI 的结构化 YAML 属性过滤）
   */
  public search(
    query: string,
    options: {
      tag?: string
      type?: NoteType
      domain?: string
      status?: NoteStatus
      limit?: number
    } = {}
  ): SearchMatch[] {
    const q = query.trim().toLowerCase()
    const targetTag = options.tag?.trim().toLowerCase().replace(/^#/, '')
    const targetType = options.type?.trim().toLowerCase()
    const targetDomain = options.domain?.trim().toLowerCase()
    const targetStatus = options.status?.trim().toLowerCase()
    const limit = options.limit || 20
    const results: SearchMatch[] = []

    for (const [path, note] of this.notes) {
      // 属性强过滤
      if (targetType && note.frontmatter.type?.toLowerCase() !== targetType) continue
      if (targetDomain && note.frontmatter.domain?.toLowerCase() !== targetDomain) continue
      if (targetStatus && note.frontmatter.status?.toLowerCase() !== targetStatus) continue

      if (targetTag) {
        const hasTag = note.tags.some(t => t.toLowerCase() === targetTag || t.toLowerCase().startsWith(targetTag + '/'))
        if (!hasTag) continue
      }

      let matches = false
      let snippet: string | undefined

      if (!q) {
        matches = true
      } else {
        const titleLower = note.title.toLowerCase()
        const pathLower = path.toLowerCase()

        if (titleLower.includes(q) || pathLower.includes(q)) {
          matches = true
        } else {
          try {
            const raw = readFileSync(note.fullPath, 'utf8')
            const idx = raw.toLowerCase().indexOf(q)
            if (idx !== -1) {
              matches = true
              const start = Math.max(0, idx - 40)
              const end = Math.min(raw.length, idx + q.length + 40)
              snippet = '...' + raw.slice(start, end).replace(/\s+/g, ' ') + '...'
            }
          } catch {}
        }
      }

      if (matches) {
        results.push({
          path,
          title: note.title,
          type: note.frontmatter.type,
          domain: note.frontmatter.domain,
          status: note.frontmatter.status,
          tags: note.tags,
          snippet,
          mtime: note.mtime,
        })
      }

      if (results.length >= limit * 2) break
    }

    return results.sort((a, b) => b.mtime - a.mtime).slice(0, limit)
  }

  /**
   * 获取单篇笔记详情
   */
  public getNote(pathOrName: string): NoteInfo | null {
    const resolved = this.resolveNotePath(pathOrName) || (pathOrName.endsWith('.md') ? pathOrName : pathOrName + '.md')
    return this.notes.get(resolved) || null
  }
}
