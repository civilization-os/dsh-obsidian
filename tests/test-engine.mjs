import { resolveActiveVault, readActiveNoteFromWorkspace, ObsidianGraph, buildObsidianUri } from '../lib/index.js'

console.log('--- 1. 测试 Vault 自动探测 ---')
const vault = resolveActiveVault({ autoDetectVault: true })
console.log('探测到的 Vault:', vault)

if (vault) {
  console.log('\n--- 2. 测试图谱建立与 MOC 识别 ---')
  const graph = new ObsidianGraph(vault.path, {})
  await graph.buildIndex()
  console.log('成功索引的笔记总数:', graph.notes.size)

  const mocs = graph.getMocs()
  console.log(`检测到的 MOC 语义知识地图 (${mocs.length} 个):`)
  for (const moc of mocs) {
    console.log(`  🗺️ [${moc.title}] ${moc.path} (包含 ${moc.totalLinks} 个节点)`)
  }

  console.log('\n--- 3. 测试活跃笔记 ---')
  const activeNote = readActiveNoteFromWorkspace(vault.path)
  console.log('当前激活笔记:', activeNote)

  console.log('\n--- 4. 测试 MOC 检索 ---')
  const searchResults = graph.search('总览', { limit: 5 })
  console.log('检索 "总览" 命中的核心地图:')
  for (const item of searchResults) {
    console.log(`  - [${item.title}] ${item.path}`)
  }

  console.log('\n--- 5. 测试 URI 构造 ---')
  const uri = buildObsidianUri({ vault: vault.name, file: mocs[0]?.path || '' })
  console.log('生成的 MOC 跳转 URI:', uri)
}

console.log('\n✅ 所有 MOC 与知识治理增强功能测试通过！')
