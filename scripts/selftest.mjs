// scripts/selftest.mjs — 宿主侧行为自测（mock ctx 跑 entry.js apply 全流程）。
//
// 断言面：core 注册数、路由挂载与 Host 回环 fence、catalog/set-enabled
// 全流程、启用集持久化与跨"重启"恢复、dispose 清场。发布前随 smoke 一起跑。
import { fileURLToPath } from "node:url"
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repo = fileURLToPath(new URL("..", import.meta.url))
const home = mkdtempSync(join(tmpdir(), 'kcs-selftest-'))
process.env.QILIN_HOME = home

const registered = new Map() // name -> { source }
let route = null
const ctx = {
  skills: {
    register: (reg) => {
      registered.set(reg.name, reg)
      return () => registered.delete(reg.name)
    },
  },
  webServer: {
    register: (options) => {
      route = options
      return () => { route = null }
    },
  },
}

const { apply } = await import(repo + '/entry.js')
const dispose = apply(ctx)

let fails = 0
const ok = (name, pass, detail = '') => {
  console.log((pass ? '  ✓ ' : '  ✗ ') + name + (pass || !detail ? '' : ' — ' + detail))
  if (!pass) fails++
}

ok('core 31 注册', registered.size === 31, String(registered.size))
ok('路由挂载 /kcoder-skills/api', route !== null && route.path === '/kcoder-skills/api')
ok('源标记 runtime', [...registered.values()].every((r) => r.source === 'runtime'))

// GET catalog
const respond = (req) => new Promise((resolve) => route.handler(req, {
  writeHead: (status, headers) => { req._status = status },
  end: (body) => resolve({ status: req._status, body: JSON.parse(body) }),
}))

let res = await respond({ method: 'GET', url: '/kcoder-skills/api/catalog', headers: { host: '127.0.0.1:4567' } })
ok('catalog 200', res.status === 200)
ok('catalog core=31 optional=40', res.body.core.length === 31 && res.body.optional.length === 40)
ok('初始全未启用', res.body.optional.every((s) => !s.enabled))

// fence：非回环 Host 拒绝
res = await respond({ method: 'GET', url: '/kcoder-skills/api/catalog', headers: { host: 'evil.example.com' } })
ok('非回环 Host 403', res.status === 403)

// POST set-enabled 启用 2 个
res = await respond({
  method: 'POST', url: '/kcoder-skills/api/set-enabled', headers: { host: '127.0.0.1' },
  async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ enabled: ['xlsx', 'pptx'] })) },
})
ok('set-enabled 200 且回显', res.status === 200 && JSON.stringify(res.body.enabled) === '["xlsx","pptx"]')
ok('启用集就地生效', registered.has('xlsx') && registered.has('pptx') && registered.size === 33)
ok('状态文件落盘 0600', existsSync(join(home, 'kcoder-skills.json')))
const persisted = JSON.parse(readFileSync(join(home, 'kcoder-skills.json'), 'utf8'))
ok('持久化内容正确', JSON.stringify(persisted.enabled) === '["xlsx","pptx"]')

// catalog 反映启用态
res = await respond({ method: 'GET', url: '/kcoder-skills/api/catalog', headers: { host: 'localhost:1' } })
ok('catalog 反映启用态', res.body.optional.filter((s) => s.enabled).map((s) => s.name).sort().join(',') === 'pptx,xlsx')

// 未知方法 404；坏 body 400
res = await respond({ method: 'GET', url: '/kcoder-skills/api/nope', headers: { host: '127.0.0.1' } })
ok('未知方法 404', res.status === 404)
res = await respond({
  method: 'POST', url: '/kcoder-skills/api/set-enabled', headers: { host: '127.0.0.1' },
  async *[Symbol.asyncIterator]() { yield Buffer.from('not-json') },
})
ok('坏 body 400', res.status === 400)

// 未知技能名被过滤（防注入无关名字）
res = await respond({
  method: 'POST', url: '/kcoder-skills/api/set-enabled', headers: { host: '127.0.0.1' },
  async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ enabled: ['xlsx', 'not-a-skill'] })) },
})
ok('未知名过滤', registered.size === 32 && !registered.has('not-a-skill'))

// 重新激活（新引擎进程）：从持久化恢复
for (const name of [...registered.keys()]) registered.delete(name)
const dispose2 = apply(ctx)
ok('重启后从状态恢复 1 个', registered.size === 32 && registered.has('xlsx'), String(registered.size))

// dispose 清场
dispose2()
ok('dispose 清空注册与路由', registered.size === 0 && route === null)

rmSync(home, { recursive: true, force: true })
console.log(fails === 0 ? '[selftest] ALL PASS' : `[selftest] ${fails} FAIL`)
process.exit(fails === 0 ? 0 : 1)
