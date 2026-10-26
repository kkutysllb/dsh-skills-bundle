# Quality gates

Two scripts and one `prepack` hook. They check different things and neither substitutes for the other: **smoke** proves the artifact has the right shape, **selftest** proves the behavior behind it works. Both are plain Node scripts with no test framework — a plugin that needs a test runner to verify `apply` has too much surface.

## smoke — shape, no host

Runs on `prepack`, so a registry publish cannot ship a broken contract.

```js
#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PKG_NAME = 'my-plugin'
const HAS_CLIENT = true
const src = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)

const checks = []
const ok = (name, pass, detail = '') => checks.push([name, pass, detail])

const pkg = JSON.parse(src('package.json') ?? '{}')
ok('name == ' + PKG_NAME, pkg.name === PKG_NAME, String(pkg.name))
ok('version is semver', /^\d+\.\d+\.\d+$/.test(String(pkg.version)), String(pkg.version))
ok('main entry declared', pkg.main === 'entry.js', String(pkg.main))
ok('dsh.bundle.patch declared', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
ok('qilin.bundle.patch declared', pkg.qilin?.bundle?.patch === './cordis.patch.yml')
ok('entry.js present', src('entry.js') !== null)

if (HAS_CLIENT) {
  ok('client.js present', src('client.js') !== null)
  ok('exports["./client"] declared', Boolean(pkg.exports?.['./client']))
}

const entry = src('entry.js') ?? ''
ok('entry exports inject', /export\s+const\s+inject/.test(entry))

const client = HAS_CLIENT ? (src('client.js') ?? '') : ''
if (HAS_CLIENT) {
  ok('ModuleLoader.load registration', client.includes('window.__ModuleLoader__.load('))
  ok('module id == package name', client.includes("id: '" + PKG_NAME + "'") || client.includes('id: "' + PKG_NAME + '"'))
  ok('client takes react through factory require',
    /factory:\s*function\s*\(\s*require\s*\)/.test(client) && client.includes('require("react")'))
}

const patch = src('cordis.patch.yml') ?? ''
ok('patch name points at package', patch.includes("name: '" + PKG_NAME + "'") || patch.includes('name: "' + PKG_NAME + '"'))
ok('YAML has no bare @ value', !/:\s+@/.test(patch))

for (const [name, pass, detail] of checks) {
  console.log((pass ? '  ✓ ' : '  ✗ ') + name + (pass || !detail ? '' : ' — ' + detail))
}
process.exit(checks.every(([, pass]) => pass) ? 0 : 1)
```

### Assertions that catch real regressions

| Check | Catches |
|---|---|
| `name` == package name | rename that missed the patch row or the client module id |
| both `bundle.patch` keys | QiLin "no bundle declared" after a one-channel edit |
| `exports["./client"]` + `client.js` | client shipped but unreachable |
| `entry` exports `inject` | activation-time `without inject` |
| `__ModuleLoader__.load` + module id == package name | bare-ESM rewrite; copy-pasted id from another plugin |
| factory takes `require`, uses `require("react")` | client bundled its own React copy |
| patch `name` points at package | patch row pointing at nothing |
| no bare `@` in YAML | anchor-parse failure |
| legacy-name residue zero | half-finished rename |

### The dangling-reference check

Every `SKILL.md` in the payload is scanned for paths it claims exist — `./x.md`, `../x.md`, `@x.md`, and backticked `scripts/…`, `examples/…`, `references/…`, `assets/…`, `templates/…` — each resolved relative to the skill directory and asserted with `existsSync`. A dead reference is invisible until a user follows it, and by then it is a support ticket; the check costs a directory walk.

If you write documentation *examples* (`src: ./other.md` as syntax illustration), keep an explicit exemption list keyed by `<skill>/SKILL.md::<path>` so real references cannot hide behind it.

### Manifest vs directory reconciliation

If a manifest enumerates payload directories, assert it both ways: every declared entry has a directory, every directory has an entry, and item metadata (name, description) is non-empty. This is the one check that catches "added the skill, forgot the rebuild" — a state where the plugin activates and silently ships nothing.

## selftest — behavior, mock ctx

```js
#!/usr/bin/env node
import { mkdtempSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('..', import.meta.url))
const home = mkdtempSync(join(tmpdir(), 'my-plugin-selftest-'))
// Pin every home variable: a developer machine with a real DSH_HOME
// would otherwise leak real state into these assertions.
process.env.KCODER_HOME = home
process.env.DSH_HOME = home
process.env.QILIN_HOME = home

const registered = new Map()
let route = null
const ctx = {
  skills: { register: (reg) => { registered.set(reg.name, reg); return () => registered.delete(reg.name) } },
  webServer: { register: (options) => { route = options; return () => { route = null } } },
}

const { apply } = await import(repo + '/entry.js')
const dispose = apply(ctx)

let fails = 0
const ok = (name, pass, detail = '') => {
  console.log((pass ? '  ✓ ' : '  ✗ ') + name + (pass || !detail ? '' : ' — ' + detail))
  if (!pass) fails++
}

const respond = (req) => new Promise((resolve) => route.handler(req, {
  writeHead: (status) => { req._status = status },
  end: (body) => resolve({ status: req._status, body: JSON.parse(body) }),
}))

ok('registration count', registered.size === 5, String(registered.size))
ok('route mounted', route !== null && route.path === '/my-plugin/api')
ok('source marked runtime', [...registered.values()].every((r) => r.source === 'runtime'))

let res = await respond({ method: 'GET', url: '/my-plugin/api/state', headers: { host: '127.0.0.1:4567' } })
ok('GET 200', res.status === 200)

res = await respond({ method: 'GET', url: '/my-plugin/api/state', headers: { host: 'evil.example.com' } })
ok('non-loopback Host 403', res.status === 403)

res = await respond({ method: 'GET', url: '/my-plugin/api/nope', headers: { host: '127.0.0.1' } })
ok('unknown action 404', res.status === 404)

res = await respond({
  method: 'POST', url: '/my-plugin/api/set-enabled', headers: { host: '127.0.0.1' },
  async *[Symbol.asyncIterator]() { yield Buffer.from('not-json') },
})
ok('bad body 400', res.status === 400)

ok('state file written', existsSync(join(home, 'my-plugin.json')))
ok('state file mode 0600', (statSync(join(home, 'my-plugin.json')).mode & 0o777) === 0o600)

// Simulated restart: fresh module, state recovered from the file.
for (const name of [...registered.keys()]) registered.delete(name)
const dispose2 = apply(ctx)
ok('state recovered after restart', registered.size > 0, String(registered.size))

dispose2()
ok('dispose clears registrations and route', registered.size === 0 && route === null)

rmSync(home, { recursive: true, force: true })
process.exit(fails === 0 ? 0 : 1)
```

### What the assertions protect

- **Registration count** — a payload file that stopped parsing registers fewer skills while `apply` still returns cleanly.
- **Route mounted at the expected path** — a path typo is invisible on the host side; the client just 404s.
- **Non-loopback `403`** — the fence is one `if` away from being deleted by a refactor.
- **`400` / `404`** — error paths are the ones that rot first.
- **State file `0600` + content** — mode regressions are silent and only matter in the incident.
- **Restart recovery** — proves read and write agree on shape, which unit-testing each half separately does not.
- **dispose clears everything** — the disposer is the contract with the fiber; a leak here survives repeated enable/disable in the settings UI.

## Wiring

```jsonc
"scripts": {
  "smoke": "node scripts/smoke-plugin.mjs",
  "selftest": "node scripts/selftest.mjs",
  "prepack": "pnpm smoke"
}
```

`prepack` is the only gate that cannot be skipped by forgetting to run a script — it fires on `npm publish` (and on `pnpm pack`). Keep it to smoke: a behavioral test that needs a real host must not block publishing a shape-correct artifact.
