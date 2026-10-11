export interface Config {
  autoDetectVault?: boolean
  customVaultPath?: string
  watchActiveNote?: boolean
  enableUriJump?: boolean
  dailyNotesFolder?: string
  defaultNewNoteFolder?: string
  autoManageFrontmatter?: boolean
  wikilinkFormat?: 'shortest' | 'relative'
  excludePatterns?: string
  safeWriteMode?: 'direct' | 'backup_on_overwrite'
}

export interface NoteFrontmatter {
  title?: string
  aliases?: string[]
  tags?: string[]
  created?: string
  updated?: string
  [key: string]: any
}

export interface NoteInfo {
  path: string          // relative to vault root, e.g. "基础科学/数学.md"
  fullPath: string      // absolute path
  title: string         // note title
  frontmatter: NoteFrontmatter
  tags: string[]
  outlinks: string[]    // list of note paths/names referenced by this note
  backlinks: string[]   // list of note paths referencing this note
  mtime: number         // modification timestamp
  size: number
}

export interface VaultStatus {
  connected: boolean
  vaultName: string
  vaultPath: string
  totalNotes: number
  activeNote: string | null
  activeNoteTitle: string | null
  lastUpdated: number
}

export interface SearchMatch {
  path: string
  title: string
  tags: string[]
  snippet?: string
  mtime: number
}
