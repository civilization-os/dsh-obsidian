import type { NoteFrontmatter } from '../types.ts'

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

// 规范化的 Frontmatter 核心字段排列顺序（面向未来 AI 检索与治理）
const CANONICAL_FIELD_ORDER: (keyof NoteFrontmatter)[] = [
  'title',
  'type',
  'domain',
  'status',
  'created',
  'updated',
  'tags',
  'related',
  'aliases',
]

/**
 * 轻量安全地解析 Markdown 前置 YAML 元数据（Frontmatter）
 */
export function parseFrontmatter(content: string): { frontmatter: NoteFrontmatter; body: string } {
  const match = content.match(FRONTMATTER_REGEX)
  if (!match) {
    return { frontmatter: {}, body: content }
  }

  const rawYaml = match[1]
  const body = content.slice(match[0].length)
  const frontmatter = parseSimpleYaml(rawYaml)
  return { frontmatter, body }
}

/**
 * 序列化 YAML Frontmatter 并拼接正文（严格遵循规范字段顺序）
 */
export function stringifyFrontmatter(frontmatter: NoteFrontmatter, body: string): string {
  const allKeys = Object.keys(frontmatter)
  if (allKeys.length === 0) return body.trimStart()

  // 按推荐规范排序
  const orderedKeys: string[] = [
    ...(CANONICAL_FIELD_ORDER as string[]).filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !(CANONICAL_FIELD_ORDER as string[]).includes(k)),
  ]

  const lines: string[] = ['---']
  for (const key of orderedKeys) {
    const val = frontmatter[key]
    if (val === undefined || val === null) continue

    if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${key}: []`)
      } else {
        lines.push(`${key}:`)
        for (const item of val) {
          const s = String(item).trim()
          // 若包含双链 [[ 或特殊字符，加引号包裹
          if (s.includes('[[') || s.includes(':') || s.includes('#')) {
            lines.push(`  - "${s.replace(/"/g, '\\"')}"`)
          } else {
            lines.push(`  - ${s}`)
          }
        }
      }
    } else if (typeof val === 'object') {
      lines.push(`${key}: ${JSON.stringify(val)}`)
    } else if (typeof val === 'string' && (val.includes(':') || val.includes('#') || val.includes('\n'))) {
      lines.push(`${key}: ${JSON.stringify(val)}`)
    } else {
      lines.push(`${key}: ${val}`)
    }
  }
  lines.push('---', '')
  return lines.join('\n') + body.trimStart()
}

/**
 * 提取正文中的 [[wikilink]] 双链目标名称
 */
export function extractWikilinks(content: string): string[] {
  const links: string[] = []
  const regex = /\[\[([^\]|#\n\r]+)(?:#[^\]|\n\r]+)?(?:\|[^\]\n\r]+)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const target = match[1].trim()
    if (target && !links.includes(target)) {
      links.push(target)
    }
  }
  return links
}

/**
 * 提取正文中的 #tag 标签（自动排除标题 #、代码块等）
 */
export function extractInlineTags(content: string): string[] {
  const tags: string[] = []
  const cleanContent = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*?`/g, '')
  const regex = /(?:^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5\/-]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(cleanContent)) !== null) {
    const tag = match[1].trim()
    if (tag && !/^\d+$/.test(tag) && !tags.includes(tag)) {
      tags.push(tag)
    }
  }
  return tags
}

/**
 * 简易 YAML 解析器（处理基础 key: value、列表项与字符串）
 */
function parseSimpleYaml(raw: string): NoteFrontmatter {
  const result: Record<string, any> = {}
  const lines = raw.split(/\r?\n/)
  let currentKey: string | null = null
  let currentArray: string[] | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // 列表项： - item
    if (trimmed.startsWith('- ') && currentKey) {
      const itemVal = trimmed.slice(2).trim().replace(/^['"]|['"]$/g, '')
      if (!currentArray) {
        currentArray = []
        result[currentKey] = currentArray
      }
      currentArray.push(itemVal)
      continue
    }

    // 键值对： key: value
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx > 0) {
      currentKey = trimmed.slice(0, colonIdx).trim()
      currentArray = null
      const rawVal = trimmed.slice(colonIdx + 1).trim()

      if (!rawVal) {
        result[currentKey] = []
        currentArray = result[currentKey]
      } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        try {
          const items = rawVal
            .slice(1, -1)
            .split(',')
            .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean)
          result[currentKey] = items
        } catch {
          result[currentKey] = rawVal
        }
      } else if (rawVal === 'true') {
        result[currentKey] = true
      } else if (rawVal === 'false') {
        result[currentKey] = false
      } else {
        result[currentKey] = rawVal.replace(/^['"]|['"]$/g, '')
      }
    }
  }

  return result
}
