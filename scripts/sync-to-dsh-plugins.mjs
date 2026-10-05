#!/usr/bin/env node
/**
 * 本仓 → dsh-plugins 真源镜像同步。
 *
 * 方向：本仓（开发真源）→ ../dsh-plugins/dsh-skills-bundle/（分发镜像）。
 * 镜像为排除式：工具链（scripts/release/.gitignore）不入镜像，
 * 其余（产物 + 契约 + 文档）全量镜像。
 *
 * 用法：
 *   node scripts/sync-to-dsh-plugins.mjs          # 执行镜像（rm+cp 重建）
 *   node scripts/sync-to-dsh-plugins.mjs --check  # 对账：零差异 exit 0；有差异列详情 exit 1
 *
 * 环境变量：KCODER_PLUGINS_DIR 可覆盖 dsh-plugins 仓位置（缺省 ../dsh-plugins）。
 *
 * 发版约定：本仓改动推送前先跑本脚本同步镜像并在 dsh-plugins 仓提交推送，
 * 保证两个安装入口（独立仓 / dsh-plugins 子目录）内容一致。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const PLUGINS_DIR = process.env.KCODER_PLUGINS_DIR
  ? resolve(process.env.KCODER_PLUGINS_DIR)
  : resolve(REPO_ROOT, '..', 'dsh-plugins')
const MIRROR = join(PLUGINS_DIR, 'dsh-skills-bundle')

/**
 * 排除式镜像：任意深度——**非载荷**（版本控制配置、依赖安装、系统杂物）。
 * 这些名字出现在任何深度都注定不进分发面，与技能载荷无关。
 */
const EXCLUDE_ANY_DEPTH = new Set(['.git', '.gitignore', 'node_modules', '.DS_Store'])

/**
 * 排除式镜像：**仅仓库根**——本仓工具链（scripts/ 与 release/ 不入分发面）。
 *
 * ⚠ 必须只在根生效（2026-10-05 修）：此前这两个名字在任意深度被排除，
 * 于是各技能自带的 `skills/<name>/scripts/*.py` —— 媒体类技能的**实际执行体**
 * ——被静默剔除出镜像。后果是三层（真源/镜像/KCoder bundle）都只有 SKILL.md，
 * 而 SKILL.md 里的调用路径（`.../skills/image-generation/scripts/generate.py`）
 * 条条是死的，且所有静态检查（含本脚本的 --check 与 KCoder 的
 * `smoke:bundle-profile`）全绿：两侧用同一份排除规则，会**一致地一起错**。
 */
const EXCLUDE_ROOT_ONLY = new Set(['scripts', 'release'])

function listFiles(root) {
  const out = []
  const walk = (dir, depth) => {
    for (const name of readdirSync(dir)) {
      if (EXCLUDE_ANY_DEPTH.has(name)) continue
      if (depth === 0 && EXCLUDE_ROOT_ONLY.has(name)) continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full, depth + 1)
      else out.push(full)
    }
  }
  walk(root, 0)
  return out
}

/** 无排除遍历（不变量自检用）。 */
function allFiles(root) {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(full)
    }
  }
  walk(root)
  return out
}

/**
 * 分发载荷不变量：`skills/` 下的**载荷**文件一个都不允许被排除规则命中。
 *
 * 为什么值得单列一条断言：排除规则的失效是**静默且双侧一致**的——镜像端与
 * 对账端用同一份 `listFiles`，被吞掉的文件在两边同时消失，`--check` 报「与
 * 真源一致」，KCoder 的 `sync-bundles --check` 也报一致（它比的是镜像副本），
 * 直到用户在真机上跑 SKILL.md 里的命令才炸「No such file」。本断言用**无排除
 * 遍历**做对照，差额只允许是 `EXCLUDE_ANY_DEPTH` 里的非载荷名——其余任何
 * 一个文件被吞掉都说明排除规则过界（2026-10-05 事故）。
 */
function assertSkillsUnexcluded() {
  const skillsRoot = join(REPO_ROOT, 'skills')
  if (!existsSync(skillsRoot)) return
  const kept = new Set(listFiles(REPO_ROOT).map((f) => relative(REPO_ROOT, f)))
  const dropped = allFiles(skillsRoot)
    .filter((f) => !EXCLUDE_ANY_DEPTH.has(basename(f)))
    .map((f) => relative(REPO_ROOT, f))
    .filter((rel) => !kept.has(rel))
    .sort()
  if (dropped.length > 0) {
    console.error(`[sync-to-dsh-plugins] 分发载荷被排除规则吞掉（${dropped.length} 个文件）：`)
    for (const rel of dropped.slice(0, 10)) console.error('  - ' + rel)
    if (dropped.length > 10) console.error(`  … 另有 ${dropped.length - 10} 个`)
    console.error('  处置：排除规则只应命中仓库根的工具链（见 EXCLUDE_ROOT_ONLY），skills/ 载荷零排除。')
    process.exit(1)
  }
}

assertSkillsUnexcluded()

function diffMirror() {
  if (!existsSync(MIRROR)) return { missing: true, onlySrc: [], onlyDst: [], changed: [] }
  const srcFiles = new Map()
  for (const f of listFiles(REPO_ROOT)) srcFiles.set(relative(REPO_ROOT, f), readFileSync(f))
  const dstFiles = new Map()
  for (const f of listFiles(MIRROR)) {
    const rel = relative(MIRROR, f)
    if (srcFiles.has(rel)) dstFiles.set(rel, readFileSync(f))
    else dstFiles.set(rel, null)
  }
  const onlySrc = [], onlyDst = [], changed = []
  for (const [rel, buf] of srcFiles) {
    if (!dstFiles.has(rel)) onlySrc.push(rel)
    else if (!dstFiles.get(rel).equals(buf)) changed.push(rel)
  }
  for (const [rel, buf] of dstFiles) if (buf === null) onlyDst.push(rel)
  return { missing: false, onlySrc, onlyDst, changed }
}

const check = process.argv.includes('--check')
const d = diffMirror()

if (check) {
  if (!existsSync(PLUGINS_DIR)) {
    console.warn('[sync-to-dsh-plugins] dsh-plugins 仓不在位（纯独立仓分发？），跳过对账')
    process.exit(0)
  }
  if (d.missing || d.onlySrc.length || d.onlyDst.length || d.changed.length) {
    console.error('[sync-to-dsh-plugins] 镜像与真源不一致：')
    if (d.missing) console.error('  镜像目录不存在：' + MIRROR)
    for (const f of d.onlySrc) console.error('  仅真源有: ' + f)
    for (const f of d.onlyDst) console.error('  仅镜像有: ' + f)
    for (const f of d.changed) console.error('  内容不同: ' + f)
    process.exit(1)
  }
  console.log('[sync-to-dsh-plugins] 镜像对账通过：与真源一致')
  process.exit(0)
}

if (!existsSync(PLUGINS_DIR)) {
  console.error('[sync-to-dsh-plugins] 未找到 dsh-plugins 仓：' + PLUGINS_DIR)
  console.error('  克隆后重跑，或用 KCODER_PLUGINS_DIR 指定位置')
  process.exit(1)
}
rmSync(MIRROR, { recursive: true, force: true })
mkdirSync(MIRROR, { recursive: true })
for (const f of listFiles(REPO_ROOT)) {
  const rel = relative(REPO_ROOT, f)
  const target = join(MIRROR, rel)
  mkdirSync(dirname(target), { recursive: true })
  cpSync(f, target)
}
console.log('[sync-to-dsh-plugins] 镜像已重建：' + MIRROR)
