import { exec } from 'node:child_process'

export interface ObsidianUriOptions {
  vault: string
  file?: string
  heading?: string
  line?: number
}

/**
 * 构造 Obsidian 系统协议 URI (obsidian://open?...)
 */
export function buildObsidianUri(options: ObsidianUriOptions): string {
  const params = new URLSearchParams()
  params.set('vault', options.vault)

  if (options.file) {
    // 移除末尾的 .md 后缀（Obsidian 协议兼容带/不带后缀，无后缀更纯粹）
    const cleanFile = options.file.replace(/\.md$/i, '')
    params.set('file', cleanFile)
  }

  return `obsidian://open?${params.toString()}`
}

/**
 * 在 Windows 系统中静默唤醒并聚焦 Obsidian 客户端定位笔记
 */
export function openInObsidianApp(uri: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Windows 下使用 cmd /c start "" "obsidian://..." 唤醒系统注册协议
    const command = `start "" "${uri}"`
    exec(command, { windowsHide: true }, (error) => {
      if (error) {
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}
