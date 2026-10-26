#!/usr/bin/env node
/**
 * 插件形态冒烟（node scripts/smoke-plugin.mjs）——npm publish 前由
 * prepack 自动执行，任何 FAIL 中断发布。
 *
 * 校验面：package.json 契约（name/version/main/dsh.bundle.patch/
 * qilin.bundle.patch/exports["./client"]）、产物在位（entry/client/
 * ['skills/manifest.json']/）、模块 id 注册（__ModuleLoader__.load({id})）、
 * cordis.patch.yml 的 name 指向、旧名/旧锚点零残留。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_NAME = 'dsh-skills-bundle'
const HAS_CLIENT = true
const INTACT = ['skills/manifest.json']
const KEEP_LEGACY = [] // 跨层持久化协议锚点（豁免旧名残留检查）

const src = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)

const checks = []
const ok = (name, pass, detail = '') => checks.push([name, pass, detail])

// 1) package.json 契约
const pkgRaw = src('package.json')
ok('package.json 存在', pkgRaw !== null)
const pkg = pkgRaw ? JSON.parse(pkgRaw) : {}
ok('name == ' + PKG_NAME, pkg.name === PKG_NAME, String(pkg.name))
ok('version 合法', /^\d+\.\d+\.\d+$/.test(String(pkg.version)), String(pkg.version))
ok('main 入口声明', pkg.main === 'entry.js', String(pkg.main))
ok('dsh.bundle.patch 声明', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
ok('qilin.bundle.patch 声明', pkg.qilin?.bundle?.patch === './cordis.patch.yml')

// 2) 产物在位
ok('entry.js 存在', src('entry.js') !== null)
if (HAS_CLIENT) {
  ok('client.js 存在', src('client.js') !== null)
  ok('exports["./client"] 声明', Boolean(pkg.exports?.['./client']))
}
for (const f of INTACT) ok('intact: ' + f, existsSync(join(ROOT, f)))

// 3) 模块 id 注册
const entry = src('entry.js') ?? ''
ok('entry inject 导出', /export\s+const\s+inject/.test(entry))
const client = HAS_CLIENT ? (src('client.js') ?? '') : ''
if (HAS_CLIENT) {
  ok('ModuleLoader.load 注册', client.includes('window.__ModuleLoader__.load('))
  ok('模块 id == 包名', client.includes("id: '" + PKG_NAME + "'") || client.includes('id: "' + PKG_NAME + '"'))
  ok('client 经 factory require 取 react', /factory:\s*function\s*\(\s*require\s*\)/.test(client) && client.includes('require("react")'))
  ok('client 注册 settings.section 插槽', client.includes('"settings.section"'))
}

// 3.5) manifest.optional 与 skills/optional/ 目录对账（client 侧无法读盘，
//      设置分区与条件注册都消费这份清单——漏生成即 UI 与注册面失真）
try {
  const manifest = JSON.parse(src('skills/manifest.json') ?? '{}')
  const optionalDirs = existsSync(join(ROOT, 'skills/optional'))
    ? readdirSync(join(ROOT, 'skills/optional'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : []
  const declared = (manifest.optional ?? []).map((item) => item.dir.replace(/^optional\//, ''))
  ok('manifest.optional 与 optional/ 目录一一对应',
    declared.length === optionalDirs.length && optionalDirs.every((name) => declared.includes(name)),
    `manifest=${declared.length} dirs=${optionalDirs.length}`)
  ok('manifest.optional 条目元数据齐备',
    (manifest.optional ?? []).every((item) => typeof item.name === 'string' && item.name !== '' && typeof item.description === 'string' && item.description !== ''),
    '每条需含非空 name 与 description')
  const coreNames = new Set((manifest.skills ?? []).map((item) => item.name))
  const optionalNames = (manifest.optional ?? []).map((item) => item.name)
  ok('core 与 optional 技能名零交集', optionalNames.every((name) => !coreNames.has(name)),
    optionalNames.filter((name) => coreNames.has(name)).join(', '))
  ok('entry.js 声明 optional 注册面', entry.includes('manifest.optional') && entry.includes('kcoder-skills.json'))
} catch (error) {
  ok('manifest.optional 对账可解析', false, String(error))
}

// 3.6) 技能 frontmatter 合规（Agent Skills 规范硬约束）：name ≤64 且小写字母/
//      数字/连字符（首尾不为连字符），description 非空且 ≤1024 字符。只覆盖
//      注册面（core 与 optional 的直接技能目录）——foundry 等目录内子技能是
//      文档子技能，不单独注册、不适用本断言。
try {
  const skillDirs = []
  for (const base of [join(ROOT, 'skills'), join(ROOT, 'skills', 'optional')]) {
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (existsSync(join(base, entry.name, 'SKILL.md'))) skillDirs.push(join(base, entry.name))
    }
  }
  const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const violations = []
  for (const dir of skillDirs) {
    const rel = relative(ROOT, dir)
    const md = readFileSync(join(dir, 'SKILL.md'), 'utf8')
    const end = md.startsWith('---\n') ? md.indexOf('\n---\n', 4) : -1
    const fm = end === -1 ? '' : md.slice(4, end)
    const name = (/^name:\s*(.+?)\s*$/m.exec(fm)?.[1] ?? '').replace(/^["']|["']$/g, '')
    const quoted = /^description:\s*"((?:[^"\\]|\\.)*)"\s*$/m.exec(fm)
    const plain = /^description:\s*(\S.*?)\s*$/m.exec(fm)
    const description = quoted !== null ? quoted[1].replace(/\\"/g, '"') : (plain !== null ? plain[1] : '')
    if (end === -1) violations.push(`${rel}: 缺 frontmatter`)
    else if (name === '') violations.push(`${rel}: 缺 name`)
    else if (name.length > 64) violations.push(`${rel}: name 超 64 字符`)
    else if (!NAME_RE.test(name)) violations.push(`${rel}: name 非小写数字连字符（${name}）`)
    if (description.trim() === '') violations.push(`${rel}: 缺 description`)
    else if (description.length > 1024) violations.push(`${rel}: description 超 1024 字符（${description.length}）`)
  }
  ok('技能 frontmatter 符合 Agent Skills 规范', violations.length === 0, violations.join('; '))
  const manifestParsed = JSON.parse(src('skills/manifest.json') ?? '{}')
  ok('规范断言覆盖注册面全部技能',
    skillDirs.length === (manifestParsed.skills?.length ?? 0) + (manifestParsed.optional?.length ?? 0),
    `扫描 ${skillDirs.length} 个`)
} catch (error) {
  ok('技能 frontmatter 合规可解析', false, String(error))
}

// 4) cordis.patch.yml name 指向
const patch = src('cordis.patch.yml') ?? ''
ok('patch name 指向新包名', patch.includes("name: '" + PKG_NAME + "'") || patch.includes('name: "' + PKG_NAME + '"'))
ok('YAML 无裸 @ 值（patch 行，@ 为 anchor 保留字须引号）', !/:\s+@/.test(patch))

// 5) 旧名/旧锚点零残留（scripts/release 不属于交付面，豁免）
const legacy = ['@kcoder/git-panel', '@kcoder/stats-panel', '@kcoder/terminal',
  '@kcoder/language-bundle', '@kcoder/skills-bundle', 'kc-git-panel', 'kc-stats-panel', 'kc-terminal']
  .filter((n) => !KEEP_LEGACY.includes(n))
const files = ['package.json', 'entry.js', 'cordis.patch.yml', 'README.md']
if (HAS_CLIENT) files.push('client.js')
let residue = []
for (const f of files) {
  const s = src(f)
  if (s === null) continue
  for (const n of legacy) if (s.includes(n)) residue.push(f + ' → ' + n)
}
ok('旧名/旧锚点零残留', residue.length === 0, residue.join('; '))

// 6) 输出
let fail = 0

/* SKILL.md 伴随文件引用一致性（防悬空引用,2026-09-11 visual-companion 教训）*/
for (const skillDir of existsSync(join(ROOT, 'skills')) ? readdirSync(join(ROOT, 'skills')) : []) {
  const skillMdPath = join(ROOT, 'skills', skillDir, 'SKILL.md')
  if (!existsSync(skillMdPath)) continue
  const md = readFileSync(skillMdPath, 'utf8')
  for (const m of md.matchAll(/`?(skills\/[a-z0-9-]+\/[A-Za-z0-9._-]+\.(?:md|json))`?/g)) {
    const present = existsSync(join(ROOT, m[1]))
    console.log(`\x1b[${present ? 32 : 31}m${present ? 'PASS' : 'FAIL'}\x1b[0m  SKILL.md 引用存在：${m[1]}`)
    if (!present) fail++
  }
}

/* SKILL.md 相对引用存在性（2026-10-25 断链教训：./xxx.md、@xxx.md 与
 * scripts|examples|references|assets|templates/ 前缀引用不带 skills/ 前缀，
 * 上面的全路径检查看不见——internal-comms examples/、SDD 三个派单模板、
 * TDD testing-anti-patterns.md、webapp-testing scripts/ 曾全部静默悬空）。
 * 递归覆盖 optional 与嵌套子技能；`<技能名>/<file>` 形态按已知技能目录解析。 */
const FILE_REF = '(?:[A-Za-z0-9._/-]+\\.(?:md|json|py|txt|sh|html))'
const RELATIVE_DIRS = new Set(['scripts', 'examples', 'references', 'assets', 'templates'])
// 文档示例豁免：这些"引用"是讲解语法的样例，不是文件指针
const REF_EXEMPT = new Set([
  'skills/optional/slidev/SKILL.md::other.md', // `src: ./other.md` 是 slidev 导入语法示例
  'skills/optional/dsh-plugin-authoring/SKILL.md::package.json', // npm exports 映射里的包说明符，非文件路径
])
{
  const skillsRoot = join(ROOT, 'skills')
  const skillMdFiles = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'SKILL.md') skillMdFiles.push(full)
    }
  }
  if (existsSync(skillsRoot)) walk(skillsRoot)

  // 已知技能目录名 → 解析根（skills/ 或 skills/optional/）
  const knownSkillRoots = new Map()
  for (const base of [skillsRoot, join(skillsRoot, 'optional')]) {
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && !knownSkillRoots.has(entry.name)) knownSkillRoots.set(entry.name, dirname(base))
    }
  }

  for (const skillMd of skillMdFiles) {
    const baseDir = dirname(skillMd)
    const displayBase = relative(ROOT, baseDir)
    const md = readFileSync(skillMd, 'utf8')
    const refs = []
    // `./x.md`（(?<!\.) 避免咬到 ../ 的尾巴）；`../../x.md` 整段捕获按父目录解析；
    // `@x.md`；反引号包裹的 scripts|examples|references|assets|templates 前缀或
    // `<技能名>/` 前缀路径。命中键在 EXEMPT 里的视为文档示例而非文件引用。
    for (const m of md.matchAll(new RegExp('(?<!\\.)\\./(' + FILE_REF + ')', 'g'))) refs.push([m[1], baseDir])
    for (const m of md.matchAll(new RegExp('((?:\\.\\./)+' + FILE_REF + ')', 'g'))) refs.push([m[1], baseDir])
    for (const m of md.matchAll(new RegExp('@(' + FILE_REF + ')', 'g'))) refs.push([m[1], baseDir])
    for (const m of md.matchAll(new RegExp('`(' + FILE_REF + ')`', 'g'))) {
      const firstSegment = m[1].split('/')[0]
      if (RELATIVE_DIRS.has(firstSegment)) refs.push([m[1], baseDir])
      else if (knownSkillRoots.has(firstSegment)) refs.push([m[1], knownSkillRoots.get(firstSegment)])
    }
    const seen = new Set()
    for (const [rel, resolveBase] of refs) {
      const key = relative(ROOT, skillMd) + '::' + rel
      if (seen.has(key) || REF_EXEMPT.has(key)) continue
      seen.add(key)
      const present = existsSync(join(resolveBase, rel))
      console.log(`\x1b[${present ? 32 : 31}m${present ? 'PASS' : 'FAIL'}\x1b[0m  相对引用存在：${rel}（${displayBase}）`)
      if (!present) fail++
    }
  }
}

for (const [name, pass, detail] of checks) {
  console.log((pass ? '  ✓ ' : '  ✗ ') + name + (pass || !detail ? '' : ' — ' + detail))
  if (!pass) fail++
}
console.log('[smoke] ' + (checks.length - fail) + '/' + checks.length + ' 项通过')
process.exit(fail === 0 ? 0 : 1)
