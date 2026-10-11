import { existsSync, readFileSync, watch } from 'node:fs'
import { join, normalize, relative, resolve, basename } from 'node:path'
import type { Config } from '../types.ts'

export interface DetectedVault {
  path: string
  name: string
  isOpen: boolean
}

/**
 * 自动嗅探本地安装的 Obsidian 注册信息与当前打开的 Vault 库
 */
export function detectObsidianVaults(): DetectedVault[] {
  const appData = process.env.APPDATA || (process.platform === 'darwin'
    ? join(process.env.HOME || '', 'Library/Application Support')
    : join(process.env.HOME || '', '.config'))

  const configFile = join(appData, 'obsidian', 'obsidian.json')
  if (!existsSync(configFile)) {
    return []
  }

  try {
    const raw = readFileSync(configFile, 'utf8')
    const parsed = JSON.parse(raw)
    const vaults: DetectedVault[] = []

    if (parsed && typeof parsed.vaults === 'object') {
      for (const key of Object.keys(parsed.vaults)) {
        const item = parsed.vaults[key]
        if (item?.path && existsSync(item.path)) {
          vaults.push({
            path: normalize(item.path),
            name: basename(item.path),
            isOpen: Boolean(item.open),
          })
        }
      }
    }
    return vaults
  } catch {
    return []
  }
}

/**
 * 获取首选激活的 Vault（优先 open: true 的，其次按路径）
 */
export function resolveActiveVault(config: Config): { path: string; name: string } | null {
  if (config.customVaultPath && existsSync(config.customVaultPath)) {
    const norm = normalize(config.customVaultPath)
    return { path: norm, name: basename(norm) }
  }

  if (config.autoDetectVault !== false) {
    const vaults = detectObsidianVaults()
    const openVault = vaults.find(v => v.isOpen) || vaults[0]
    if (openVault) {
      return { path: openVault.path, name: openVault.name }
    }
  }

  return null
}

/**
 * 校验路径是否在安全允许的 Vault 范围内，且未被排除
 */
export function isPathAllowed(relPath: string, vaultPath: string, excludePatterns?: string): boolean {
  const full = resolve(vaultPath, relPath)
  const normRel = relative(vaultPath, full).replace(/\\/g, '/')

  // 不得跳出 Vault 根目录
  if (normRel.startsWith('..') || resolve(full) !== full) {
    return false
  }

  // 基础系统与隐私目录物理拦截
  const defaultExcludes = ['.obsidian/', '.git/']
  for (const ex of defaultExcludes) {
    if (normRel === ex || normRel.startsWith(ex)) return false
  }

  if (!excludePatterns) return true

  const userPatterns = excludePatterns
    .split(/\r?\n/)
    .map(p => p.trim())
    .filter(Boolean)

  for (const pattern of userPatterns) {
    const cleanP = pattern.replace(/^\/+|\/+$/g, '')
    if (!cleanP) continue
    if (normRel === cleanP || normRel.startsWith(cleanP + '/') || normRel.endsWith('/' + cleanP)) {
      return false
    }
  }

  return true
}

/**
 * 读取当前 Obsidian 的活动笔记（解析 .obsidian/workspace.json）
 */
export function readActiveNoteFromWorkspace(vaultPath: string): string | null {
  const workspaceFile = join(vaultPath, '.obsidian', 'workspace.json')
  if (!existsSync(workspaceFile)) return null

  try {
    const text = readFileSync(workspaceFile, 'utf8')
    const data = JSON.parse(text)

    // 尝试遍历 main 节点查找当前 active leaf
    let activeFile: string | null = null

    const findActiveFile = (node: any): boolean => {
      if (!node) return false
      if (node.type === 'leaf' && node.state?.type === 'markdown' && node.state?.state?.file) {
        if (!activeFile) {
          activeFile = node.state.state.file
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          if (findActiveFile(child)) return true
        }
      }
      return false
    }

    findActiveFile(data.main)

    // 如果遍历找到，且有 lastOpenFiles，再 double check
    if (!activeFile && Array.isArray(data.lastOpenFiles) && data.lastOpenFiles.length > 0) {
      activeFile = data.lastOpenFiles[0]
    }

    return activeFile
  } catch {
    return null
  }
}
