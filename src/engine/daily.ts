import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Config } from '../types.ts'

export interface DailyNoteConfig {
  folder: string
  format: string
  template?: string
}

export interface DailyStructuredEntry {
  category?: 'Work' | 'Ideas' | string
  entry: string
  generatedKnowledge?: string[]
  ideas?: string[]
}

/**
 * 读取 Obsidian 官方的 Daily Note 配置
 */
export function getDailyNoteSettings(vaultPath: string, config: Config): DailyNoteConfig {
  const configFile = join(vaultPath, '.obsidian', 'daily-notes.json')
  let folder = config.dailyNotesFolder || ''
  let format = 'YYYY-MM-DD'
  let template: string | undefined

  if (existsSync(configFile)) {
    try {
      const data = JSON.parse(readFileSync(configFile, 'utf8'))
      if (data.folder && !config.dailyNotesFolder) folder = data.folder
      if (data.format) format = data.format
      if (data.template) template = data.template
    } catch {}
  }

  return { folder, format, template }
}

/**
 * 格式化今天的日期字符串
 */
export function formatCurrentDate(format: string = 'YYYY-MM-DD'): string {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')

  return format
    .replace(/YYYY/g, year)
    .replace(/MM/g, month)
    .replace(/DD/g, day)
    .replace(/HH/g, hours)
    .replace(/mm/g, minutes)
}

/**
 * 向今日日记追加结构化条目（拒绝流水账，作为原子知识孵化器入口）
 */
export function appendStructuredDailyNote(
  vaultPath: string,
  data: DailyStructuredEntry,
  config: Config
): { success: boolean; filePath: string; message: string } {
  const settings = getDailyNoteSettings(vaultPath, config)
  const dateStr = formatCurrentDate(settings.format)
  const fileName = `${dateStr}.md`
  const relPath = settings.folder ? `${settings.folder}/${fileName}` : fileName
  const fullPath = join(vaultPath, relPath)

  try {
    mkdirSync(dirname(fullPath), { recursive: true })

    let existingContent = ''
    if (existsSync(fullPath)) {
      existingContent = readFileSync(fullPath, 'utf8')
    } else {
      // 现代规范初始模板
      existingContent = `---\ntitle: ${dateStr}\ntype: daily\nstatus: growing\ncreated: ${dateStr}\nupdated: ${dateStr}\ntags:\n  - daily-note\n---\n\n# 📅 ${dateStr} 日志\n\n`
    }

    const category = data.category || 'Work'
    const targetHeading = `## ${category}`

    // 格式化 entry
    const lines: string[] = [data.entry.trim()]
    if (data.generatedKnowledge && data.generatedKnowledge.length > 0) {
      lines.push('\n- **产生知识**：')
      for (const k of data.generatedKnowledge) {
        const cleanK = k.replace(/^\[\[|\]\]$/g, '')
        lines.push(`  - [[${cleanK}]]`)
      }
    }
    if (data.ideas && data.ideas.length > 0) {
      lines.push('\n- **衍生思考**：')
      for (const idea of data.ideas) {
        const cleanIdea = idea.replace(/^\[\[|\]\]$/g, '')
        lines.push(`  - [[${cleanIdea}]]`)
      }
    }

    const blockText = lines.join('\n') + '\n'

    let updatedContent = existingContent
    const headingIdx = updatedContent.indexOf(targetHeading)

    if (headingIdx !== -1) {
      const nextLineIdx = updatedContent.indexOf('\n', headingIdx)
      if (nextLineIdx !== -1) {
        updatedContent = updatedContent.slice(0, nextLineIdx + 1) + `${blockText}\n` + updatedContent.slice(nextLineIdx + 1)
      } else {
        updatedContent += `\n${blockText}\n`
      }
    } else {
      updatedContent = updatedContent.trimEnd() + `\n\n${targetHeading}\n\n${blockText}\n`
    }

    writeFileSync(fullPath, updatedContent, 'utf8')
    return {
      success: true,
      filePath: relPath,
      message: `已结构化记入 ${relPath} 的 [${category}] 板块，并沉淀双链索引。`,
    }
  } catch (err: any) {
    return {
      success: false,
      filePath: relPath,
      message: `写入日记失败: ${err?.message || String(err)}`,
    }
  }
}
