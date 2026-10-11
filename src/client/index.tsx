import { useState, useEffect, useRef, useCallback } from 'react'
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

  // 注册右侧栏 Obsidian 标签页
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

  // 在设置中心注册插件设置卡片
  ctx.effect(() => official.slots?.inject?.('settings.plugins.card', () => official.slots.register({
    name: 'settings.plugins.card',
    key: TAB_ID,
  }, ObsidianSettingsCard)), 'dsh-obsidian: settings card')
}

function ObsidianTabTitle(): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <ObsidianIcon size={14} />
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
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2000)
  }, [])

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
      showToast(path ? `已在 Obsidian 中打开 ${path}` : '已激活 Obsidian 客户端')
    } catch {
      showToast('无法呼起客户端')
    }
  }

  const handleMention = (e: React.MouseEvent, noteName: string) => {
    e.stopPropagation()
    const text = `[[${noteName}]]`
    const ok = insertMentionToComposer(text)
    showToast(ok ? `已引用 ${text}` : `已复制 ${text}`)
    if (!ok) {
      try { navigator.clipboard.writeText(text) } catch {}
    }
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
        setCaptureFeedback('已成功沉淀至今日日志并自动建链！')
        setCaptureEntry('')
        setCaptureKnowledge('')
        setTimeout(() => setCaptureFeedback(''), 3000)
        fetchStatus()
      }
    } catch {
      setCaptureFeedback('记录失败，请检查网络')
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
    <div className="dsh-obsidian-root">
      <GlobalObsidianStyle />

      {/* 状态吐司提醒 */}
      {toast && (
        <div className="dsh-obsidian-toast">{toast}</div>
      )}

      {/* 顶部状态栏 */}
      <header className="dsh-obsidian-header">
        <div className="dsh-obsidian-header-info">
          <div className="dsh-obsidian-status-line">
            <span className={`dsh-obsidian-dot ${status?.connected ? 'is-online' : 'is-offline'}`} />
            <span className="dsh-obsidian-vault-name" title={status?.vaultPath || '未连接'}>
              {status?.vaultName || 'Obsidian 知识库'}
            </span>
            {status?.connected && (
              <span className="dsh-obsidian-badge-count">
                {status.totalNotes} 笔记 · {mocs.length} MOC
              </span>
            )}
          </div>
          <div className="dsh-obsidian-sub-path" title={status?.vaultPath}>
            {status?.vaultPath || '未检测到活跃的 Obsidian 库'}
          </div>
        </div>

        <div className="dsh-obsidian-header-actions">
          <button
            type="button"
            className="dsh-obsidian-btn-secondary"
            onClick={() => { fetchStatus(); fetchActive(); fetchMocs() }}
            title="刷新状态"
          >
            ↻
          </button>
          {status?.connected && (
            <button
              type="button"
              className="dsh-obsidian-btn-secondary"
              onClick={() => handleOpenObsidian()}
              title="在桌面客户端中激活 Obsidian"
            >
              客户端 ↗
            </button>
          )}
        </div>
      </header>

      {/* 🗺️ MOC 语义知识地图导航 */}
      {mocs.length > 0 && (
        <section className="dsh-obsidian-card">
          <div className="dsh-obsidian-card-header">
            <div className="dsh-obsidian-card-title">
              <span className="dsh-obsidian-icon-prefix">🗺️</span>
              <span>MOC 知识地图（导航中枢）</span>
            </div>
            <span className="dsh-obsidian-badge-tag">{mocs.length} 个地图</span>
          </div>

          <div className="dsh-obsidian-moc-grid">
            {mocs.map((moc) => (
              <div
                key={moc.path}
                className="dsh-obsidian-moc-item"
                onClick={() => handleOpenObsidian(moc.path)}
                title={`查看 ${moc.title} (关联 ${moc.totalLinks} 个节点)`}
              >
                <div className="dsh-obsidian-moc-name">
                  <span style={{ color: '#e11d48', marginRight: 3 }}>📌</span>
                  <span>{moc.title}</span>
                </div>
                <div className="dsh-obsidian-moc-meta">
                  {moc.domain ? (
                    <span className="dsh-obsidian-domain-tag">{moc.domain}</span>
                  ) : <span />}
                  <span className="dsh-obsidian-links-count">{moc.totalLinks} 节点</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ⚡ 今日日志孵化入口（拒绝流水账） */}
      <section className="dsh-obsidian-card">
        <div className="dsh-obsidian-card-header">
          <div className="dsh-obsidian-card-title">
            <span className="dsh-obsidian-icon-prefix">⚡</span>
            <span>今日日志孵化入口（拒绝流水账）</span>
          </div>
        </div>

        {/* 分段模式切换 */}
        <div className="dsh-obsidian-seg">
          <button
            type="button"
            className={`dsh-obsidian-seg-btn ${captureCategory === 'Work' ? 'is-active' : ''}`}
            onClick={() => setCaptureCategory('Work')}
          >
            <span>🛠️</span> Work (工作实战)
          </button>
          <button
            type="button"
            className={`dsh-obsidian-seg-btn ${captureCategory === 'Ideas' ? 'is-active' : ''}`}
            onClick={() => setCaptureCategory('Ideas')}
          >
            <span>💡</span> Ideas (灵感思考)
          </button>
        </div>

        <form onSubmit={handleCapture} className="dsh-obsidian-capture-form">
          <div className="dsh-obsidian-input-wrap">
            <input
              className="dsh-obsidian-input"
              placeholder={captureCategory === 'Work' ? '解决的问题/任务简述（如: 解决 Kafka Direct Memory OOM）...' : '灵感构想（如: AI Agent Memory 统一架构）...'}
              value={captureEntry}
              onChange={(e) => setCaptureEntry(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="dsh-obsidian-input-wrap">
            <input
              className="dsh-obsidian-input-sub"
              placeholder={captureCategory === 'Work' ? '提炼产生的原子知识（逗号分隔，如: Kafka Direct Memory, JSON Streaming Parse）' : '衍生的课题设计（如: Agent Memory Architecture）'}
              value={captureKnowledge}
              onChange={(e) => setCaptureKnowledge(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="dsh-obsidian-btn-primary"
            disabled={loading || !captureEntry.trim()}
          >
            {loading ? '沉淀中...' : '沉淀至 Daily 并建链 ↵'}
          </button>
        </form>

        {captureFeedback && (
          <div className="dsh-obsidian-feedback">{captureFeedback}</div>
        )}
      </section>

      {/* 📄 当前正在查看的笔记 */}
      {activeNote?.active ? (
        <section className="dsh-obsidian-card">
          <div className="dsh-obsidian-card-header">
            <div className="dsh-obsidian-card-title">
              <span className="dsh-obsidian-icon-prefix">📄</span>
              <span>当前正在查看的笔记</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="dsh-obsidian-btn-mini"
                onClick={(e) => handleMention(e, activeNote.title)}
                title="引用此笔记至对话框"
              >
                @引用
              </button>
              <button
                type="button"
                className="dsh-obsidian-btn-mini is-primary"
                onClick={() => handleOpenObsidian(activeNote.path)}
                title="在 Obsidian 中打开"
              >
                聚焦 ↗
              </button>
            </div>
          </div>

          <div className="dsh-obsidian-active-body">
            <div className="dsh-obsidian-note-title">{activeNote.title}</div>
            <div className="dsh-obsidian-note-path" title={activeNote.path}>{activeNote.path}</div>

            {/* YAML 规范属性徽章 */}
            {activeNote.frontmatter && (
              <div className="dsh-obsidian-attr-row">
                {activeNote.frontmatter.type && (
                  <span className="dsh-obsidian-attr-pill attr-type">
                    type: {activeNote.frontmatter.type}
                  </span>
                )}
                {activeNote.frontmatter.domain && (
                  <span className="dsh-obsidian-attr-pill attr-domain">
                    domain: {activeNote.frontmatter.domain}
                  </span>
                )}
                {activeNote.frontmatter.status && (
                  <span className="dsh-obsidian-attr-pill attr-status">
                    status: {activeNote.frontmatter.status}
                  </span>
                )}
              </div>
            )}

            {/* 标签列表 */}
            {activeNote.tags?.length > 0 && (
              <div className="dsh-obsidian-tags-row">
                {activeNote.tags.map((tag: string) => (
                  <span key={tag} className="dsh-obsidian-tag-item">#{tag}</span>
                ))}
              </div>
            )}

            {/* 出链引用 */}
            {activeNote.outlinks?.length > 0 && (
              <div className="dsh-obsidian-links-section">
                <div className="dsh-obsidian-links-title">
                  <span>🔗 引用了 (Outlinks, {activeNote.outlinks.length})</span>
                </div>
                <div className="dsh-obsidian-links-list">
                  {activeNote.outlinks.map((link: string) => (
                    <div
                      key={link}
                      className="dsh-obsidian-link-row"
                      onClick={() => handleOpenObsidian(link)}
                      title={`在 Obsidian 中打开 [[${link}]]`}
                    >
                      <span className="dsh-obsidian-link-label">[[{link}]]</span>
                      <div className="dsh-obsidian-link-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="dsh-obsidian-btn-ghost"
                          onClick={(e) => handleMention(e, link)}
                          title="一键 @ 引用到当前会话"
                        >
                          @引用
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 反向入链 */}
            {activeNote.backlinks?.length > 0 && (
              <div className="dsh-obsidian-links-section">
                <div className="dsh-obsidian-links-title">
                  <span>🔙 被引用 (Backlinks, {activeNote.backlinks.length})</span>
                </div>
                <div className="dsh-obsidian-links-list">
                  {activeNote.backlinks.map((link: string) => (
                    <div
                      key={link}
                      className="dsh-obsidian-link-row"
                      onClick={() => handleOpenObsidian(link)}
                      title={`在 Obsidian 中打开 [[${link}]]`}
                    >
                      <span className="dsh-obsidian-link-label">[[{link}]]</span>
                      <div className="dsh-obsidian-link-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="dsh-obsidian-btn-ghost"
                          onClick={(e) => handleMention(e, link)}
                          title="一键 @ 引用到当前会话"
                        >
                          @引用
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="dsh-obsidian-card-muted">
          <span>💡 Obsidian 客户端当前未聚焦或无打开中的笔记</span>
        </section>
      )}

      {/* 🔍 知识库检索 */}
      <section className="dsh-obsidian-card">
        <div className="dsh-obsidian-card-header">
          <div className="dsh-obsidian-card-title">
            <span className="dsh-obsidian-icon-prefix">🔍</span>
            <span>知识库检索</span>
          </div>
          {searchResults.length > 0 && (
            <span className="dsh-obsidian-badge-tag">{searchResults.length} 条匹配</span>
          )}
        </div>

        <div className="dsh-obsidian-search-box">
          <input
            className="dsh-obsidian-input"
            placeholder="关键词、双链或标签过滤..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="dsh-obsidian-clear-btn"
              onClick={() => handleSearch('')}
              title="清除搜索"
            >
              ✕
            </button>
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="dsh-obsidian-search-results">
            {searchResults.map((item) => (
              <div
                key={item.path}
                className="dsh-obsidian-search-item"
                onClick={() => handleOpenObsidian(item.path)}
              >
                <div className="dsh-obsidian-search-item-header">
                  <span className="dsh-obsidian-search-item-title">{item.title}</span>
                  <button
                    type="button"
                    className="dsh-obsidian-btn-ghost"
                    onClick={(e) => handleMention(e, item.title)}
                    title="引用此笔记"
                  >
                    @引用
                  </button>
                </div>
                <div className="dsh-obsidian-search-item-path">
                  {item.type ? `[${item.type}] ` : ''}{item.path}
                </div>
                {item.snippet && (
                  <div className="dsh-obsidian-search-item-snippet">{item.snippet}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * 插入 @引用 到 DSH 官方输入框（兼容 Lexical contenteditable 与 textarea）
 */
function insertMentionToComposer(text: string): boolean {
  if (typeof document === 'undefined') return false

  const candidates = [
    document.querySelector<HTMLElement>('[data-composer-input="true"]'),
    document.querySelector<HTMLElement>('[data-composer-input]'),
    document.querySelector<HTMLElement>('[data-composer-card] [contenteditable="true"]'),
    document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]'),
    document.querySelector<HTMLTextAreaElement>('textarea:not([readonly])'),
  ].filter(Boolean) as HTMLElement[]

  const target = candidates[0]
  if (!target) return false

  target.focus()

  if (target.getAttribute('contenteditable') === 'true' || target.isContentEditable) {
    const sel = window.getSelection()
    if (sel) {
      let isInTarget = false
      if (sel.rangeCount > 0) {
        const anchor = sel.anchorNode
        if (anchor && (anchor === target || target.contains(anchor))) {
          isInTarget = true
        }
      }
      if (!isInTarget) {
        const range = document.createRange()
        range.selectNodeContents(target)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }

    let success = false
    try {
      success = document.execCommand('insertText', false, text)
    } catch {}

    if (!success) {
      try {
        const evt = new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text,
        })
        target.dispatchEvent(evt)
        success = true
      } catch {}
    }
    return success
  }

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const start = target.selectionStart ?? target.value.length
    const end = target.selectionEnd ?? target.value.length
    const prev = target.value
    let success = false
    try {
      target.selectionStart = start
      target.selectionEnd = end
      success = document.execCommand('insertText', false, text)
    } catch {}

    if (!success) {
      const next = prev.slice(0, start) + text + prev.slice(end)
      target.value = next
      target.selectionStart = target.selectionEnd = start + text.length
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
      target.dispatchEvent(new Event('change', { bubbles: true }))
      success = true
    }
    return success
  }

  return false
}

/**
 * 设置面板中的插件卡片
 */
function ObsidianSettingsCard(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<any>(null)

  useEffect(() => {
    fetch('/dsh-obsidian/api/status')
      .then(res => res.json())
      .then(data => setStatus(data))
      .catch(() => {})
  }, [])

  return (
    <div className={`dsh-obsidian-settings-card ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="dsh-obsidian-settings-header"
        onClick={() => setOpen(!open)}
      >
        <div className="dsh-obsidian-settings-head-left">
          <div className="dsh-obsidian-settings-title-row">
            <ObsidianIcon size={16} />
            <span className="dsh-obsidian-settings-title">Obsidian 知识图谱</span>
            <span className="dsh-obsidian-badge-version">v0.1.0</span>
          </div>
          <div className="dsh-obsidian-settings-desc">
            双向链接自动解析、MOC 结构化地图导航与 Daily 工作/灵感双链孵化器。
          </div>
        </div>
        <span className={`dsh-obsidian-chevron ${open ? 'is-open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="dsh-obsidian-settings-body">
          <div className="dsh-obsidian-settings-row">
            <div className="dsh-obsidian-row-text">
              <div className="dsh-obsidian-row-label">知识库连接状态</div>
              <div className="dsh-obsidian-row-hint">
                {status?.connected
                  ? `已自动关联本地 Vault: ${status?.vaultName || '默认库'}`
                  : '未检测到正在运行的 Obsidian 实例'}
              </div>
            </div>
            <div className="dsh-obsidian-row-ctrl">
              <span className={`dsh-obsidian-tag-status ${status?.connected ? 'is-online' : 'is-offline'}`}>
                {status?.connected ? '已连接' : '未连接'}
              </span>
            </div>
          </div>

          <div className="dsh-obsidian-settings-row">
            <div className="dsh-obsidian-row-text">
              <div className="dsh-obsidian-row-label">知识库本地绝对路径</div>
              <div className="dsh-obsidian-row-hint" style={{ wordBreak: 'break-all' }}>
                {status?.vaultPath || 'C:\\...\\ObsidianVault'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ObsidianIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <path d="M12 2L3 8.5L5 19L12 22L19 19L21 8.5L12 2Z" fill="#7C3AED" stroke="#9333EA" fillOpacity="0.18" />
      <path d="M12 2L12 22" stroke="#A855F7" strokeLinecap="round" />
      <path d="M5 19L12 12L19 19" stroke="#C084FC" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 遵循 DSH 官方标准的全局 CSS 样式
 */
function GlobalObsidianStyle(): JSX.Element {
  return (
    <style>{`
/* 基础根容器 */
.dsh-obsidian-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #17233c);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  overflow-y: auto;
  position: relative;
  padding: 12px;
  gap: 12px;
}

/* 顶部状态栏 */
.dsh-obsidian-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-2, rgba(100, 120, 150, 0.04));
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.16));
  border-radius: 10px;
}
.dsh-obsidian-header-info {
  flex: 1;
  min-width: 0;
}
.dsh-obsidian-status-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-obsidian-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dsh-obsidian-dot.is-online {
  background: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}
.dsh-obsidian-dot.is-offline {
  background: #94a3b8;
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.2);
}
.dsh-obsidian-vault-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-obsidian-sub-path {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}
.dsh-obsidian-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 卡片 */
.dsh-obsidian-card {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.16));
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  box-sizing: border-box;
}
.dsh-obsidian-card-muted {
  background: var(--dsw-alias-bg-layer-2, rgba(100, 120, 150, 0.02));
  border: 1px dashed var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.18));
  border-radius: 10px;
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
}

.dsh-obsidian-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dsh-obsidian-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-obsidian-icon-prefix {
  font-size: 13px;
}

/* 徽章 Badge */
.dsh-obsidian-badge-count {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  background: var(--dsw-alias-interactive-bg-hover, rgba(100, 120, 150, 0.08));
  padding: 1px 6px;
  border-radius: 99px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.12));
}
.dsh-obsidian-badge-tag {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #6f7f9b);
  background: var(--dsw-alias-interactive-bg-hover, rgba(100, 120, 150, 0.08));
  padding: 2px 7px;
  border-radius: 99px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.14));
}

/* MOC 栅格 */
.dsh-obsidian-moc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}
.dsh-obsidian-moc-item {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(112, 72, 232, 0.04));
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.16));
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all .15s ease;
  box-sizing: border-box;
}
.dsh-obsidian-moc-item:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #7048e8) 10%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #7048e8) 40%, transparent);
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}
.dsh-obsidian-moc-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-obsidian-moc-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
}
.dsh-obsidian-domain-tag {
  background: var(--dsw-alias-bg-layer-3, rgba(100, 120, 150, 0.08));
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.14));
  padding: 1px 4px;
  border-radius: 4px;
  color: var(--dsw-alias-label-secondary, #6f7f9b);
}
.dsh-obsidian-links-count {
  font-weight: 500;
}

/* 分段切换按钮（Segmented Control） */
.dsh-obsidian-seg {
  display: flex;
  padding: 2px;
  gap: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(100, 120, 150, 0.08));
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.16));
}
.dsh-obsidian-seg-btn {
  flex: 1;
  padding: 6px 12px;
  font-size: 11.5px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6f7f9b);
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.dsh-obsidian-seg-btn:hover {
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-obsidian-seg-btn.is-active {
  background: var(--dsw-alias-bg-layer-3, #ffffff);
  color: var(--dsw-alias-brand-primary, #4b70e2);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Daily Capture 表单 */
.dsh-obsidian-capture-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-obsidian-input-wrap {
  width: 100%;
}

/* 标准输入框 */
.dsh-obsidian-input {
  box-sizing: border-box;
  width: 100%;
  padding: 7px 10px;
  font-size: 12px;
  line-height: 1.4;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(118, 137, 166, 0.28));
  background: var(--dsw-alias-bg-layer-3, #ffffff);
  color: var(--dsw-alias-label-primary, inherit);
  outline: none;
  transition: all 0.15s ease;
}
.dsh-obsidian-input::placeholder {
  color: var(--dsw-alias-label-tertiary, #9aa5b5);
}
.dsh-obsidian-input:focus {
  border-color: var(--dsw-alias-brand-primary, #4b70e2);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 18%, transparent);
}

/* 次级输入框 */
.dsh-obsidian-input-sub {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 10px;
  font-size: 11.5px;
  line-height: 1.4;
  border-radius: 7px;
  border: 1px dashed var(--dsw-alias-border-l2, rgba(118, 137, 166, 0.28));
  background: var(--dsw-alias-interactive-bg-hover, rgba(100, 120, 150, 0.04));
  color: var(--dsw-alias-label-primary, inherit);
  outline: none;
  transition: all 0.15s ease;
}
.dsh-obsidian-input-sub::placeholder {
  color: var(--dsw-alias-label-tertiary, #9aa5b5);
}
.dsh-obsidian-input-sub:focus {
  background: var(--dsw-alias-bg-layer-3, #ffffff);
  border-style: solid;
  border-color: var(--dsw-alias-brand-primary, #4b70e2);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 18%, transparent);
}

/* 主操作按钮 */
.dsh-obsidian-btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 550;
  border-radius: 7px;
  border: none;
  background: var(--dsw-alias-brand-primary, #4b70e2);
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.dsh-obsidian-btn-primary:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-0.5px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.14);
}
.dsh-obsidian-btn-primary:active:not(:disabled) {
  transform: translateY(0);
}
.dsh-obsidian-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 次级/辅助按钮 */
.dsh-obsidian-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.2));
  background: var(--dsw-alias-interactive-bg-hover, rgba(100, 120, 150, 0.06));
  color: var(--dsw-alias-label-secondary, #6f7f9b);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-obsidian-btn-secondary:hover {
  background: var(--dsw-alias-interactive-bg-active, rgba(100, 120, 150, 0.12));
  color: var(--dsw-alias-label-primary, inherit);
  border-color: var(--dsw-alias-border-l2, rgba(118, 137, 166, 0.35));
}

.dsh-obsidian-btn-mini {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-size: 10.5px;
  border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.2));
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6f7f9b);
  cursor: pointer;
  transition: all 0.12s ease;
}
.dsh-obsidian-btn-mini:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(100, 120, 150, 0.1));
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-obsidian-btn-mini.is-primary {
  color: var(--dsw-alias-brand-primary, #4b70e2);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 30%, transparent);
}

.dsh-obsidian-btn-ghost {
  border: none;
  background: transparent;
  color: var(--dsw-alias-brand-primary, #4b70e2);
  font-size: 10.5px;
  padding: 2px 5px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.85;
  transition: all 0.12s ease;
}
.dsh-obsidian-btn-ghost:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 12%, transparent);
}

/* 反馈提示 */
.dsh-obsidian-feedback {
  font-size: 11px;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  padding: 4px 8px;
  border-radius: 6px;
  animation: fadeIn 0.2s ease-in;
}

/* 当前活跃笔记面板 */
.dsh-obsidian-active-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-obsidian-note-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-brand-primary, #7048e8);
}
.dsh-obsidian-note-path {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  word-break: break-all;
}

/* YAML 属性 Pill 徽章 */
.dsh-obsidian-attr-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dsh-obsidian-attr-pill {
  font-size: 10.5px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid transparent;
}
.dsh-obsidian-attr-pill.attr-type {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
  border-color: rgba(59, 130, 246, 0.2);
}
.dsh-obsidian-attr-pill.attr-domain {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  border-color: rgba(16, 185, 129, 0.2);
}
.dsh-obsidian-attr-pill.attr-status {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
  border-color: rgba(245, 158, 11, 0.2);
}

/* 标签行 */
.dsh-obsidian-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.dsh-obsidian-tag-item {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(112, 72, 232, 0.08));
  color: var(--dsw-alias-brand-primary, #7048e8);
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.15));
}

/* 引用双链列表 */
.dsh-obsidian-links-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.12));
}
.dsh-obsidian-links-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #6f7f9b);
  margin-bottom: 2px;
}
.dsh-obsidian-links-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-obsidian-link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(100, 120, 150, 0.04));
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.12s ease;
}
.dsh-obsidian-link-row:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 8%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 25%, transparent);
}
.dsh-obsidian-link-label {
  font-size: 11.5px;
  color: var(--dsw-alias-brand-primary, #4b70e2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-obsidian-link-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 检索框与结果 */
.dsh-obsidian-search-box {
  position: relative;
  display: flex;
  align-items: center;
}
.dsh-obsidian-clear-btn {
  position: absolute;
  right: 8px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  cursor: pointer;
  font-size: 11px;
  padding: 2px;
}
.dsh-obsidian-clear-btn:hover {
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-obsidian-search-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}
.dsh-obsidian-search-item {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(100, 120, 150, 0.04));
  border: 1px solid var(--dsw-alias-border-l1, rgba(118, 137, 166, 0.14));
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: all 0.12s ease;
}
.dsh-obsidian-search-item:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4b70e2) 8%, transparent);
  border-color: var(--dsw-alias-brand-primary, #4b70e2);
}
.dsh-obsidian-search-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.dsh-obsidian-search-item-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-obsidian-search-item-path {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
}
.dsh-obsidian-search-item-snippet {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #6f7f9b);
  font-style: italic;
  margin-top: 2px;
}

/* 吐司通知 */
.dsh-obsidian-toast {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--dsw-alias-label-primary, #1f2328);
  color: var(--dsw-alias-bg-base, #ffffff);
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 999;
  pointer-events: none;
  animation: fadeIn 0.15s ease-out;
}

/* 设置卡片样式 */
.dsh-obsidian-settings-card {
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  background: var(--dsw-alias-bg-layer-3, #ffffff);
  border-radius: 12px;
  transition: border-color .16s, background .16s;
  box-sizing: border-box;
}
.dsh-obsidian-settings-card.is-open {
  background: var(--dsw-alias-bg-layer-2, #f7f8fa);
  border-color: var(--dsw-alias-label-dimmed, #c8ccd4);
}
.dsh-obsidian-settings-header {
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  border-radius: 12px;
}
.dsh-obsidian-settings-head-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.dsh-obsidian-settings-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-obsidian-badge-version {
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
}
.dsh-obsidian-settings-desc {
  font-size: 12.5px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
}
.dsh-obsidian-chevron {
  font-size: 14px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
  transition: transform .16s ease;
}
.dsh-obsidian-chevron.is-open {
  transform: rotate(180deg);
}
.dsh-obsidian-settings-body {
  border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  margin: 0 16px;
  padding: 8px 0 12px;
}
.dsh-obsidian-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
}
.dsh-obsidian-row-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.dsh-obsidian-row-label {
  font-size: 13px;
  font-weight: 550;
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-obsidian-row-hint {
  font-size: 11.5px;
  color: var(--dsw-alias-label-tertiary, #8c9ba5);
}
.dsh-obsidian-tag-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.dsh-obsidian-tag-status.is-online {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}
.dsh-obsidian-tag-status.is-offline {
  background: rgba(148, 163, 184, 0.12);
  color: #64748b;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
    `}</style>
  )
}
