export type NoteType = 'knowledge' | 'moc' | 'concept' | 'project' | 'daily' | 'resource'
export type NoteStatus = 'draft' | 'growing' | 'stable' | 'archived'

export interface NoteFrontmatter {
  title?: string
  type?: NoteType
  domain?: string
  status?: NoteStatus
  created?: string
  updated?: string
  tags?: string[]
  related?: string[]
  aliases?: string[]
  [key: string]: any
}

export interface MocTopic {
  heading: string
  links: string[]
}

export interface MocInfo {
  path: string
  title: string
  domain?: string
  topics: MocTopic[]
  totalLinks: number
}

export interface NoteInfo {
  path: string          // relative to vault root, e.g. "基础科学/数学.md"
  fullPath: string      // absolute path
  title: string         // note title
  frontmatter: NoteFrontmatter
  tags: string[]
  outlinks: string[]    // list of note paths/names referenced by this note
  backlinks: string[]   // list of note paths referencing this note
  isMoc: boolean        // whether this note is a Map of Content
  mtime: number         // modification timestamp
  size: number
}

export interface VaultStatus {
  connected: boolean
  vaultName: string
  vaultPath: string
  totalNotes: number
  totalMocs: number
  activeNote: string | null
  activeNoteTitle: string | null
  lastUpdated: number
}

export interface SearchMatch {
  path: string
  title: string
  type?: NoteType
  domain?: string
  status?: NoteStatus
  tags: string[]
  snippet?: string
  mtime: number
}

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
