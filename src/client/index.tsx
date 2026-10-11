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
      description: () => 'Obsidian 知识库与 MOC 地图看板',
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
  const [mocs, setMocs] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  // 结构化 Capture 状态
  const [captureCategory, setCaptureCategory] = useState<'Work' | 'Ideas'>('Work')
  const [captureEntry, setCaptureEntry] = useState('')
  const [captureKnowledge, setCaptureKnowledge] = useState('')
  const [captureFeedback, setCaptureFeedback] = useState('')
  const [loading, setLoading] = useState(false)

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

  const fetchMocs = async () => {
    try {
      const res = await fetch('/dsh-obsidian/api/mocs')
      if (res.ok) {
        const data = await res.json()
        setMocs(data.mocs || [])
      }
    } catch {}
  }

  useEffect(() => {
    fetchStatus()
    fetchActive()
    fetchMocs()
    const timer = setInterval(() => {
      fetchStatus()
      fetchActive()
      fetchMocs()
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
    if (!captureEntry.trim()) return
    setLoading(true)
    try {
      const knowledgeList = captureKnowledge.trim()
        ? captureKnowledge.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
        : undefined

      const res = await fetch('/dsh-obsidian/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry: captureEntry.trim(),
          category: captureCategory,
          generatedKnowledge: captureCategory === 'Work' ? knowledgeList : undefined,
          ideas: captureCategory === 'Ideas' ? knowledgeList : undefined,
        }),
      })
      if (res.ok) {
        setCaptureFeedback('已结构化沉淀至今日日志！')
        setCaptureEntry('')
        setCaptureKnowledge('')
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
                ? `🟢 已连接 (${status.totalNotes} 笔记 / ${status.totalMocs || 0} MOC)`
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

      {/* 🗺️ MOC 语义知识地图导航 */}
      {mocs.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span>🗺️ MOC 知识地图（导航中枢）</span>
            <span style={styles.badgeCount}>{mocs.length} 个地图</span>
          </div>
          <div style={styles.mocGrid}>
            {mocs.map((moc) => (
              <div
                key={moc.path}
                style={styles.mocItem}
                onClick={() => handleOpenObsidian(moc.path)}
                title={`查看 ${moc.title} (关联 ${moc.totalLinks} 个节点)`}
              >
                <div style={styles.mocTitle}>📌 {moc.title}</div>
                <div style={styles.mocMeta}>
                  {moc.domain ? <span style={styles.domainTag}>{moc.domain}</span> : null}
                  <span>{moc.totalLinks} 节点</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 结构化 Daily 孵化器输入 */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span>⚡ 今日日志孵化入口（拒绝流水账）</span>
        </div>

        {/* 分类切换 */}
        <div style={styles.categoryToggle}>
          <button
            type="button"
            style={captureCategory === 'Work' ? styles.catBtnActive : styles.catBtn}
            onClick={() => setCaptureCategory('Work')}
          >
            🛠️ Work (工作实战)
          </button>
          <button
            type="button"
            style={captureCategory === 'Ideas' ? styles.catBtnActive : styles.catBtn}
            onClick={() => setCaptureCategory('Ideas')}
          >
            💡 Ideas (灵感思考)
          </button>
        </div>

        <form onSubmit={handleCapture} style={styles.captureForm}>
          <input
            style={styles.input}
            placeholder={captureCategory === 'Work' ? '解决的问题/任务简述...' : '灵感或架构设计构想...'}
            value={captureEntry}
            onChange={(e) => setCaptureEntry(e.target.value)}
            disabled={loading}
          />
          <input
            style={styles.inputSub}
            placeholder={captureCategory === 'Work' ? '提炼产生的原子知识（逗号分隔，如 Kafka Direct Memory）' : '衍生的课题设计（如 Agent Memory Architecture）'}
            value={captureKnowledge}
            onChange={(e) => setCaptureKnowledge(e.target.value)}
            disabled={loading}
          />
          <button type="submit" style={styles.btnCapture} disabled={loading || !captureEntry.trim()}>
            {loading ? '沉淀中...' : '沉淀至 Daily 并建链 ↵'}
          </button>
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

          {/* YAML 属性徽标 */}
          <div style={styles.frontmatterTags}>
            {activeNote.frontmatter?.type && (
              <span style={styles.attrType}>type: {activeNote.frontmatter.type}</span>
            )}
            {activeNote.frontmatter?.domain && (
              <span style={styles.attrDomain}>domain: {activeNote.frontmatter.domain}</span>
            )}
            {activeNote.frontmatter?.status && (
              <span style={styles.attrStatus}>status: {activeNote.frontmatter.status}</span>
            )}
          </div>

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
        <div style={styles.cardHeader}>🔍 知识库检索</div>
        <input
          style={styles.input}
          placeholder="关键词、双链或标签过滤..."
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
                <div style={styles.resultPath}>
                  {item.type ? `[${item.type}] ` : ''}{item.path}
                </div>
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
  badgeCount: {
    fontSize: 10,
    padding: '1px 5px',
    borderRadius: 4,
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    color: '#c4b5fd',
  },
  mocGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: 6,
  },
  mocItem: {
    padding: '6px 8px',
    borderRadius: 6,
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    border: '1px solid rgba(139, 92, 246, 0.25)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  mocTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#c4b5fd',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mocMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: '#94a3b8',
  },
  domainTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: '1px 4px',
    borderRadius: 3,
  },
  categoryToggle: {
    display: 'flex',
    gap: 6,
  },
  catBtn: {
    flex: 1,
    padding: '4px 6px',
    fontSize: 11,
    borderRadius: 5,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
  },
  catBtnActive: {
    flex: 1,
    padding: '4px 6px',
    fontSize: 11,
    borderRadius: 5,
    border: '1px solid rgba(139, 92, 246, 0.5)',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: '#c4b5fd',
    fontWeight: 600,
    cursor: 'pointer',
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
  frontmatterTags: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  attrType: {
    fontSize: 10,
    padding: '1px 5px',
    borderRadius: 3,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#93c5fd',
  },
  attrDomain: {
    fontSize: 10,
    padding: '1px 5px',
    borderRadius: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#6ee7b7',
  },
  attrStatus: {
    fontSize: 10,
    padding: '1px 5px',
    borderRadius: 3,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    color: '#fcd34d',
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
    flexDirection: 'column',
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
  inputSub: {
    width: '100%',
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.1))',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    color: '#cbd5e1',
    fontSize: 11,
    outline: 'none',
    boxSizing: 'border-box',
  },
  btnCapture: {
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 5,
    border: 'none',
    backgroundColor: '#7c3aed',
    color: '#fff',
    cursor: 'pointer',
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
