import type { NoteFrontmatter } from '../types.ts'

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

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
 * 序列化 YAML Frontmatter 并拼接正文
 */
export function stringifyFrontmatter(frontmatter: NoteFrontmatter, body: string): string {
  const keys = Object.keys(frontmatter)
  if (keys.length === 0) return body.trimStart()

  const lines: string[] = ['---']
  for (const key of keys) {
    const val = frontmatter[key]
    if (val === undefined || val === null) continue
    if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${key}: []`)
      } else {
        lines.push(`${key}:`)
        for (const item of val) {
          lines.push(`  - ${String(item)}`)
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
  // 匹配 [[note]]、[[note|alias]]、[[note#heading]]
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
  // 剔除代码块以防误判
  const cleanContent = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*?`/g, '')
  // 匹配 #tag，不包含空格与特殊符号，前面必须是空格、行首或非单词字符
  const regex = /(?:^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5\/-]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(cleanContent)) !== null) {
    const tag = match[1].trim()
    // 过滤纯数字或全符号
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
        // 空值或后随数组
        result[currentKey] = []
        currentArray = result[currentKey]
      } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        // 行内数组 [a, b, c]
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
