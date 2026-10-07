// scripts/gen-manifest.mjs — 生成 skills/manifest.json 的 optional 批。
//
// core 批（manifest.skills）是人工精选 + 适配脚本产出的单一事实源，本脚本
// **从不改写**；只扫描 skills/optional/*/SKILL.md 的 frontmatter（name/
// description），生成/刷新 manifest.optional。随包不注册的长尾批由此获得
// 与 core 同源的元数据（设置页「可选技能」分区与 entry.js 的条件注册都
// 消费这份清单，client 侧无法读盘）。
//
// frontmatter 解析与 KCoder desktop/main/skills-catalog.ts 同口径：行级
// 极简解析——顶层标量（name）、双引号字符串（description，\" 转义）与
// >- 折叠块；嵌套字段（hooks 等）不消费。
//
// 用法：node scripts/gen-manifest.mjs（幂等；optional 目录删了对应条目
// 也会同步移除）。
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKILLS_DIR = join(ROOT, 'skills')
const MANIFEST_PATH = join(SKILLS_DIR, 'manifest.json')

/** 行级解析 SKILL.md 的 frontmatter：只取 name 与 description。 */
function frontmatterOf(skillDir) {
  const raw = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
  if (!raw.startsWith('---\n')) return null
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return null
  const lines = raw.slice(4, end).split('\n')
  const out = {}
  for (let i = 0; i < lines.length; i++) {
    const name = /^name:\s*(.+?)\s*$/.exec(lines[i])
    if (name !== null) { out.name = name[1].trim(); continue }
    const quoted = /^description:\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(lines[i])
    if (quoted !== null) {
      out.description = quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n')
      continue
    }
    // 折叠块（>- / >）与普通标量（裸文本，可缩进续行）都按"多行并一句"收敛
    const blockish = /^description:\s*(>-?\s*)?$/.exec(lines[i]) ?? /^description:\s*(\S.*?)\s*$/.exec(lines[i])
    if (blockish !== null) {
      const body = [blockish[1] ?? '']
      for (i++; i < lines.length; i++) {
        if (/^\S/.test(lines[i])) { i--; break }
        body.push(lines[i].trim())
      }
      out.description = body.filter((line) => line !== '').join(' ')
    }
  }
  return out
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
const optional = []
for (const dir of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name !== 'optional') continue
  const optionalDir = join(SKILLS_DIR, 'optional')
  for (const entry of readdirSync(optionalDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue
    const skillDir = join(optionalDir, entry.name)
    if (!existsSync(join(skillDir, 'SKILL.md'))) continue
    const meta = frontmatterOf(skillDir)
    if (meta === null || meta.name === undefined || meta.description === undefined) {
      throw new Error(`skills/optional/${entry.name}/SKILL.md frontmatter 缺 name 或 description`)
    }
    optional.push({ dir: `optional/${entry.name}`, name: meta.name, description: meta.description })
  }
}

manifest.optional = optional
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`gen-manifest: skills=${manifest.skills.length} optional=${optional.length} → ${MANIFEST_PATH}`)
