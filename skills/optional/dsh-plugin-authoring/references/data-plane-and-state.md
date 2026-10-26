# Fenced data plane and state persistence

The client half runs in a browser: it cannot read the disk, and the host's own settings RPC serves only its own namespaces. When a UI needs host state, the host exposes a small HTTP API that the plugin owns end to end.

## The route

```js
const BASE = '/my-plugin/api'

ctx.webServer.register({
  kind: 'prefix',              // everything under `path` routes here
  path: BASE,
  handler: async (req, res) => {
    if (!isLoopbackHost(req.headers)) return writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
    const method = (req.method ?? 'GET').toUpperCase()
    const pathname = new URL(req.url ?? '/', 'http://plugin.internal').pathname
    const action = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : ''
    ...
  },
})
```

- `kind: 'prefix'` + a namespaced `path` (`/<package>/api`) keeps you clear of the engine's own routes.
- `webServer.register` returns a disposer; push it into the plugin's disposer array.
- Parse the URL against a **dummy origin** — `req.url` is a path, not an absolute URL.

## The trust boundary

```js
/** Loopback-only: same fence the engine's own /api gateway applies. */
function isLoopbackHost(headers) {
  const raw = headers?.host
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return false
  const host = value.toLowerCase().replace(/:\d+$/, '')
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
}
```

Why `Host` and not `Origin`: the client is same-origin, so a cross-origin page cannot set `Host`, but it can reach a loopback server whose address it guessed. A LAN-facing deployment must not inherit this API — the fence is what makes "local-only" true rather than aspirational. Reject before doing any work: `403` with a generic body, no detail about what exists behind the fence.

## Response contract

```js
function writeJson(res, status, payload) {
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(payload))
  } catch {
    // client vanished mid-write: nowhere left to report
  }
}
```

| Case | Status | Body |
|---|---|---|
| success | 200 | `{ ok: true, ... }` |
| malformed / wrong-typed body | 400 | `{ ok: false, error: { code: 'bad-request', message: '...' } }` |
| unknown action | 404 | `{ ok: false, error: { code: 'not-found', ... } }` |
| non-loopback host | 403 | `{ ok: false, error: { code: 'forbidden', ... } }` |

Every response is JSON, including errors — a client that always parses gets a usable message, and a browser never renders an HTML error page over your UI.

## Reading a body

```js
async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}
```

Never trust `content-length`, and never assume the stream is small. Parse in a `try`; treat an unparsable body as `400`, not as a crash:

```js
let requested
try {
  const body = JSON.parse((await readBody(req)) || '{}')
  requested = Array.isArray(body?.enabled) ? body.enabled.filter((n) => typeof n === 'string') : null
} catch { requested = null }
if (requested === null) return writeJson(res, 400, badRequest)
```

## Validate against the catalog, not just the type

A well-typed body can still carry names that do not exist. Filter against the live catalog before acting:

```js
enabled = new Set(requested.filter((name) => optionalByName.has(name)))
```

That single line is what keeps a stale or hostile client from registering arbitrary names, and what makes a removed skill disappear silently instead of erroring.

## What never crosses the wire

- API keys, tokens, credentials — even masked; the UI only needs "configured / not configured".
- Absolute filesystem paths inside the user's home.
- Stack traces, raw error objects, dependency names and versions.
- The existence of resources the caller is not allowed to touch (return `403`/`404` uniformly).

## State file

```js
const STATE_FILE = 'my-plugin.json'   // product-private namespace under the home dir

function homeDir() {
  for (const key of ['KCODER_HOME', 'DSH_HOME']) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  const legacy = process.env.QILIN_HOME
  if (typeof legacy === 'string' && legacy.trim() !== '') return legacy
  return join(homedir(), '.kcoder')
}
```

```js
function readEnabled() {
  const parse = (path) => {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(parsed?.enabled) ? parsed.enabled.filter((n) => typeof n === 'string') : undefined
  }
  try {
    const enabled = parse(join(homeDir(), STATE_FILE))
    if (enabled !== undefined) return enabled        // current location wins
  } catch { /* absent or corrupt: fall through to migration */ }
  try {
    const enabled = parse(join(legacyHome(), STATE_FILE))
    if (enabled !== undefined) { writeEnabled(enabled); return enabled }  // migrate once
  } catch { /* nothing to migrate */ }
  return []
}

function writeEnabled(enabled) {
  try {
    writeFileSync(join(homeDir(), STATE_FILE), `${JSON.stringify({ enabled }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 })
  } catch { /* read-only home: valid for this session only */ }
}
```

Semantics worth preserving verbatim:

- **Resolution order** `KCODER_HOME → DSH_HOME → legacy QILIN_HOME → ~/.kcoder`. New variables win; the legacy one is read for migration, then abandoned.
- **Migration is write-through but non-fatal.** A failed migration write still returns the migrated value for this run.
- **Missing, corrupt, wrong-typed all mean "empty"**, never an exception. The file is user data in a user-writable directory; assume nothing.
- **`0600` on write.** The document may record user choices; the mode is the only thing protecting it in a shared machine.
- **Write failure degrades, not fails.** The in-memory change stays valid; activation continues.

## Testing the pair

A `ctx` with two stubs (`skills.register`, `webServer.register`) is enough to exercise everything: mount the route, call its handler with a fake `req` that is an async iterable of chunks and a fake `res` that records `writeHead`/`end`, and assert the status and body. Pin all three home env vars to a temp directory first — otherwise a developer machine with a real `DSH_HOME` set will leak real state into the assertions and produce a test that passes locally and fails on CI.
