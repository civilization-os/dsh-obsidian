import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Config } from '../types.ts'

export interface DailyNoteConfig {
  folder: string
  format: string
  template?: string
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
 * 格式化今天的日期字符串（基础支持 YYYY, MM, DD, ddd 等常用占位符）
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
 * 向今日日记追加内容
 */
export function appendToDailyNote(
  vaultPath: string,
  content: string,
  config: Config,
  heading?: string
): { success: boolean; filePath: string; message: string } {
  const settings = getDailyNoteSettings(vaultPath, config)
  const dateStr = formatCurrentDate(settings.format)
  const fileName = `${dateStr}.md`
  const relPath = settings.folder ? `${settings.folder}/${fileName}` : fileName
  const fullPath = join(vaultPath, relPath)

  const now = new Date()
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  try {
    mkdirSync(dirname(fullPath), { recursive: true })

    let existingContent = ''
    if (existsSync(fullPath)) {
      existingContent = readFileSync(fullPath, 'utf8')
    } else {
      // 新建日记初始化模版
      existingContent = `---\ncreated: ${dateStr}\ntags:\n  - daily-note\n---\n\n# 📅 ${dateStr} 日志\n\n`
    }

    let updatedContent = existingContent

    const entryText = content.trim().startsWith('-')
      ? `${content.trim()}`
      : `- [${timeStr}] ${content.trim()}`

    if (heading) {
      const targetHeading = heading.startsWith('#') ? heading : `## ${heading}`
      const headingIdx = updatedContent.indexOf(targetHeading)
      if (headingIdx !== -1) {
        const nextLineIdx = updatedContent.indexOf('\n', headingIdx)
        if (nextLineIdx !== -1) {
          updatedContent = updatedContent.slice(0, nextLineIdx + 1) + `${entryText}\n` + updatedContent.slice(nextLineIdx + 1)
        } else {
          updatedContent += `\n${entryText}\n`
        }
      } else {
        // 未找到标题则在末尾新建标题
        updatedContent = updatedContent.trimEnd() + `\n\n${targetHeading}\n${entryText}\n`
      }
    } else {
      updatedContent = updatedContent.trimEnd() + `\n\n${entryText}\n`
    }

    writeFileSync(fullPath, updatedContent, 'utf8')
    return { success: true, filePath: relPath, message: `已成功追加至 ${relPath}` }
  } catch (err: any) {
    return { success: false, filePath: relPath, message: `写入日记失败: ${err?.message || String(err)}` }
  }
}
