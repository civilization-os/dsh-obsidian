import { useState, useEffect } from 'react'
import type { Context } from '@deepseek-ai/cordis'

export const inject = ['slots', 'sidebarRightTabs']
const TAB_ID = 'dsh-obsidian'
const TAB_KIND = 'sidebar-obsidian'

interface OfficialContext extends Context {
  slots: any
  sidebarRightTabs: any
}

export function apply(ctx: Context): void {
  const official = ctx as OfficialContext

  ctx.effect(() => official.sidebarRightTabs?.register?.({
    id: TAB_ID,
    kind: TAB_KIND,
    priority: 'extension',
    title: () => 'Obsidian',
    guide: [{
      order: 205,
      title: () => 'Obsidian',
      description: () => 'Obsidian 知识库与双链看板',
      icon: ObsidianIcon,
    }],
  }), 'dsh-obsidian: tab definition')

  ctx.effect(() => official.slots?.inject?.('sidebar.right.pane.tab', () => official.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
  }, ObsidianPanel)), 'dsh-obsidian: tab body')

  ctx.effect(() => official.slots?.inject?.('sidebar.right.pane.tab.title', () => official.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: TAB_ID,
  }, ObsidianTabTitle)), 'dsh-obsidian: tab title')
}

function ObsidianTabTitle(): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <ObsidianIcon size={15} />
      <span>Obsidian</span>
    </div>
  )
}

function ObsidianPanel(): JSX.Element {
  const [status, setStatus] = useState<any>(null)
  const [activeNote, setActiveNote] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [captureText, setCaptureText] = useState('')
  const [captureFeedback, setCaptureFeedback] = useState('')
  const [loading, setLoading] = useState(false)

  // 轮询或加载状态
  const fetchStatus = async () => {
    try {
      const res = await fetch('/dsh-obsidian/api/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch {}
  }

  const fetchActive = async () => {
    try {
      const res = await fetch('/dsh-obsidian/api/active')
      if (res.ok) {
        const data = await res.json()
        setActiveNote(data)
      }
    } catch {}
  }

  useEffect(() => {
    fetchStatus()
    fetchActive()
    const timer = setInterval(() => {
      fetchStatus()
      fetchActive()
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  const handleOpenObsidian = async (path?: string) => {
    try {
      await fetch('/dsh-obsidian/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
    } catch {}
  }

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!captureText.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/dsh-obsidian/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: captureText.trim() }),
      })
      if (res.ok) {
        setCaptureFeedback('已记入今日日记！')
        setCaptureText('')
        setTimeout(() => setCaptureFeedback(''), 2500)
        fetchStatus()
      }
    } catch {
      setCaptureFeedback('记录失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (q: string) => {
    setSearchQuery(q)
    if (!q.trim()) {
      setSearchResults([])
      return
    }
    try {
      const res = await fetch(`/dsh-obsidian/api/search?q=${encodeURIComponent(q.trim())}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.results || [])
      }
    } catch {}
  }

  return (
    <div style={styles.container}>
      {/* 头部状态 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <ObsidianIcon size={20} />
          <div>
            <div style={styles.vaultTitle}>{status?.vaultName || 'Obsidian 知识库'}</div>
            <div style={styles.vaultSubtitle}>
              {status?.connected
                ? `🟢 已连接 (${status.totalNotes} 篇笔记)`
                : '⚪ 未检测到运行中的 Vault'}
            </div>
          </div>
        </div>
        {status?.connected && (
          <button
            style={styles.btnSecondary}
            onClick={() => handleOpenObsidian()}
            title="在系统客户端中打开"
          >
            客户端 ↗
          </button>
        )}
      </div>

      {/* 快捷收集箱 */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>⚡ 快速记录至今日日记</div>
        <form onSubmit={handleCapture} style={styles.captureForm}>
          <input
            style={styles.input}
            placeholder="记下即时待办或灵感，回车归档..."
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            disabled={loading}
          />
        </form>
        {captureFeedback && <div style={styles.feedback}>{captureFeedback}</div>}
      </div>

      {/* 当前活跃笔记与知识图谱关系 */}
      {activeNote?.active ? (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span>📄 当前正在查看的笔记</span>
            <button
              style={styles.btnLink}
              onClick={() => handleOpenObsidian(activeNote.path)}
            >
              聚焦 ↗
            </button>
          </div>
          <div style={styles.noteTitle}>{activeNote.title}</div>
          <div style={styles.notePath}>{activeNote.path}</div>

          {activeNote.tags?.length > 0 && (
            <div style={styles.tagList}>
              {activeNote.tags.map((tag: string) => (
                <span key={tag} style={styles.tagBadge}>#{tag}</span>
              ))}
            </div>
          )}

          {/* 出链 */}
          {activeNote.outlinks?.length > 0 && (
            <div style={styles.sectionBlock}>
              <div style={styles.subSectionTitle}>🔗 引用了 (Outlinks, {activeNote.outlinks.length})</div>
              <div style={styles.linkList}>
                {activeNote.outlinks.map((link: string) => (
                  <div
                    key={link}
                    style={styles.linkItem}
                    onClick={() => handleOpenObsidian(link)}
                  >
                    [[{link}]]
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 反向入链 */}
          {activeNote.backlinks?.length > 0 && (
            <div style={styles.sectionBlock}>
              <div style={styles.subSectionTitle}>🔙 被引用 (Backlinks, {activeNote.backlinks.length})</div>
              <div style={styles.linkList}>
                {activeNote.backlinks.map((link: string) => (
                  <div
                    key={link}
                    style={styles.linkItem}
                    onClick={() => handleOpenObsidian(link)}
                  >
                    [[{link}]]
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={styles.cardMuted}>
          <span>💡 Obsidian 客户端无打开中的笔记</span>
        </div>
      )}

      {/* 知识库极速搜索 */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>🔍 知识库速查</div>
        <input
          style={styles.input}
          placeholder="输入关键词、双链或标签搜索..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {searchResults.length > 0 && (
          <div style={styles.searchResults}>
            {searchResults.map((item) => (
              <div
                key={item.path}
                style={styles.searchResultItem}
                onClick={() => handleOpenObsidian(item.path)}
              >
                <div style={styles.resultTitle}>{item.title}</div>
                <div style={styles.resultPath}>{item.path}</div>
                {item.snippet && <div style={styles.resultSnippet}>{item.snippet}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ObsidianIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L3 8.5L5 19L12 22L19 19L21 8.5L12 2Z" fill="#7C3AED" stroke="#9333EA" fillOpacity="0.18" />
      <path d="M12 2L12 22" stroke="#A855F7" strokeLinecap="round" />
      <path d="M5 19L12 12L19 19" stroke="#C084FC" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: 'var(--text-normal, #e0e0e0)',
    fontSize: 13,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  vaultTitle: {
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--text-title, #ffffff)',
  },
  vaultSubtitle: {
    fontSize: 11,
    color: 'var(--text-muted, #999)',
  },
  card: {
    backgroundColor: 'var(--card-bg, rgba(255, 255, 255, 0.04))',
    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
    borderRadius: 8,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cardMuted: {
    backgroundColor: 'var(--card-bg, rgba(255, 255, 255, 0.02))',
    border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.08))',
    borderRadius: 8,
    padding: 12,
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--text-muted, #888)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--text-muted, #aaa)',
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#a78bfa',
  },
  notePath: {
    fontSize: 11,
    color: 'var(--text-muted, #777)',
    wordBreak: 'break-all',
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  tagBadge: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    color: '#c4b5fd',
  },
  sectionBlock: {
    marginTop: 6,
    paddingTop: 6,
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
  subSectionTitle: {
    fontSize: 11,
    color: 'var(--text-muted, #888)',
    marginBottom: 4,
  },
  linkList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  linkItem: {
    fontSize: 11,
    color: '#818cf8',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: 4,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  captureForm: {
    display: 'flex',
    gap: 6,
  },
  input: {
    width: '100%',
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    color: '#fff',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box',
  },
  btnSecondary: {
    padding: '4px 8px',
    fontSize: 11,
    borderRadius: 5,
    border: '1px solid rgba(139, 92, 246, 0.4)',
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    color: '#c4b5fd',
    cursor: 'pointer',
  },
  btnLink: {
    border: 'none',
    background: 'none',
    color: '#a78bfa',
    fontSize: 11,
    cursor: 'pointer',
    padding: 0,
  },
  feedback: {
    fontSize: 11,
    color: '#34d399',
  },
  searchResults: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 220,
    overflowY: 'auto',
    marginTop: 4,
  },
  searchResultItem: {
    padding: '6px 8px',
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  resultTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: '#e2e8f0',
  },
  resultPath: {
    fontSize: 10,
    color: '#64748b',
  },
  resultSnippet: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
}
