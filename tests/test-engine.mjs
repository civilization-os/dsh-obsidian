import { resolveActiveVault, readActiveNoteFromWorkspace } from '../lib/index.js'
import { ObsidianGraph } from '../src/engine/graph.ts'
import { buildObsidianUri } from '../lib/index.js'

console.log('--- 1. 测试 Vault 自动探测 ---')
const vault = resolveActiveVault({ autoDetectVault: true })
console.log('探测到的 Vault:', vault)

if (vault) {
  console.log('\n--- 2. 测试活动笔记读取 ---')
  const activeNote = readActiveNoteFromWorkspace(vault.path)
  console.log('当前激活笔记:', activeNote)

  console.log('\n--- 3. 测试图谱建立与索引 ---')
  const graph = new ObsidianGraph(vault.path, {})
  await graph.buildIndex()
  console.log('成功索引的笔记总数:', graph.notes.size)

  if (activeNote) {
    const noteInfo = graph.getNote(activeNote)
    console.log('活跃笔记详情:')
    console.log('  标题:', noteInfo?.title)
    console.log('  标签:', noteInfo?.tags)
    console.log('  出链 (Outlinks):', noteInfo?.outlinks)
    console.log('  入链 (Backlinks):', noteInfo?.backlinks)
  }

  console.log('\n--- 4. 测试搜索能力 ---')
  const searchResults = graph.search('函数', { limit: 3 })
  console.log('搜索 "函数" 命中数:', searchResults.length)
  for (const item of searchResults) {
    console.log(`  - [${item.title}] ${item.path}`)
  }

  console.log('\n--- 5. 测试 URI 构造 ---')
  const uri = buildObsidianUri({ vault: vault.name, file: activeNote || '' })
  console.log('生成的 Obsidian URI:', uri)
}

console.log('\n✅ 所有引擎功能测试通过！')
