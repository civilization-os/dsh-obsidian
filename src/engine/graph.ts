import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import type { Config, NoteInfo, SearchMatch } from '../types.ts'
import { extractInlineTags, extractWikilinks, parseFrontmatter } from './frontmatter.ts'
import { isPathAllowed } from './vault.ts'

export class ObsidianGraph {
  private vaultPath: string
  private config: Config
  public notes = new Map<string, NoteInfo>()
  // 简写名称索引（如 "函数" -> ["基础科学/.../函数.md"]）
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

      const info: NoteInfo = {
        path: relPath,
        fullPath,
        title: frontmatter.title || cleanName,
        frontmatter,
        tags: allTags,
        outlinks,
        backlinks: [],
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
        // 尝试精确匹配或解析最短名
        const resolvedPath = this.resolveNotePath(target) || target
        let set = this.backlinks.get(resolvedPath)
        if (!set) {
          set = new Set()
          this.backlinks.set(resolvedPath, set)
        }
        set.add(sourcePath)
      }
    }

    // 回填到每个 note
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
    // 1. 完全相同路径
    if (this.notes.has(cleanTarget + '.md')) {
      return cleanTarget + '.md'
    }
    if (this.notes.has(cleanTarget)) {
      return cleanTarget
    }

    // 2. 通过简写名称在索引中查找
    const candidates = this.nameIndex.get(cleanTarget)
    if (candidates && candidates.length > 0) {
      return candidates[0]
    }

    return null
  }

  /**
   * 搜索笔记（关键词、标题与标签）
   */
  public search(query: string, options: { tag?: string; limit?: number } = {}): SearchMatch[] {
    const q = query.trim().toLowerCase()
    const targetTag = options.tag?.trim().toLowerCase().replace(/^#/, '')
    const limit = options.limit || 20
    const results: SearchMatch[] = []

    for (const [path, note] of this.notes) {
      if (targetTag) {
        const hasTag = note.tags.some(t => t.toLowerCase() === targetTag || t.toLowerCase().startsWith(targetTag + '/'))
        if (!hasTag) continue
      }

      let matches = false
      let score = 0
      let snippet: string | undefined

      if (!q) {
        matches = true
      } else {
        const titleLower = note.title.toLowerCase()
        const pathLower = path.toLowerCase()

        if (titleLower.includes(q)) {
          matches = true
          score += 10
        } else if (pathLower.includes(q)) {
          matches = true
          score += 5
        } else {
          // 读取正文进行全文搜索
          try {
            const raw = readFileSync(note.fullPath, 'utf8')
            const idx = raw.toLowerCase().indexOf(q)
            if (idx !== -1) {
              matches = true
              score += 1
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
          tags: note.tags,
          snippet,
          mtime: note.mtime,
        })
      }

      if (results.length >= limit * 2) break
    }

    // 默认按修改时间降序排序
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
