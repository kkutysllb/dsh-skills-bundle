---
name: dsh-plugin-authoring
description: Use when authoring a dsh/QiLin/KCoder plugin (host cordis plugin with an optional web-client extension), or when debugging plugin activation, skill registration, slot/locale wiring, fenced HTTP APIs, state persistence, bundle packaging, profile install or release failures in those hosts
---

# dsh Plugin Authoring

## Overview

A dsh/QiLin/KCoder plugin is a **cordis fiber plus a package**. The fiber: `name`, `inject`, `apply(ctx)` returning a disposer. The package: a `package.json` contract, a `cordis.patch.yml` bundle layer, a zero-build ESM payload. Everything else — a client extension, an HTTP data plane, a state file — is a layer on that skeleton.

Two invariants at every layer:

1. **Every registration returns a disposer, and every disposer runs** — `apply` returns one function that unwinds everything, idempotently.
2. **Zero build.** Ship the executed artifact; a bundler taxes every installer (`prepare` authorization, git-source empty shell, lockfile drift). The client gets React from the host via `require("react")`, so even a UI half needs none.

Read before writing your own: `dsh-skills-bundle/entry.js` (registration + fenced API + persistence), `dsh-skills-bundle/client.js` (ModuleLoader + slot + locale), `dsh-animations/entry.js` (host-only).

## Step 0 — Map the error to the layer

Failures name their own layer. Read the message before touching code.

| Symptom | Cause |
|---|---|
| `cannot get property "skills" without inject` | service used in `apply` but absent from the `inject` export (client: also check `dsh.client.inject`) |
| `client.js loaded without registering` | bare ESM `export` — the loader never saw `__ModuleLoader__.load` |
| `failed to import` on activation | package hand-placed in the shared profile `node_modules` (reserved zone) |
| no bundle declared | QiLin manager reads only the native `qilin.bundle.patch` key |
| `duplicate loader entry id` | row mounted twice, or an aggregator reused the `id` |
| `minimum release age`, `Ignored build scripts` | pnpm install policy, not your code |

## Step 1 — Choose the shape

**Host-only** when the capability is model-facing (skills, tools, prompt sections, routes): `entry.js` + patch. **Host + client** when a UI surface exists (settings section, panel, overlay): add `client.js` + `dsh.client`. Either way **zero-build** — commit the executed artifact; build only for a dependency you must vendor.

Decide once, in writing: the client half doubles the inject, packaging and failure surfaces, and a plugin whose only UI is a toggle usually does not need one.

## Step 2 — Host contract

```js
export const name = 'my-plugin'                 // == patch name == package name
export const inject = ['skills', 'webServer']   // every ctx service touched

export function apply(ctx) {
  const disposers = []
  disposers.push(ctx.skills.register({
    name: 'my-skill', description: '...', source: 'runtime',
    content,                                    // frontmatter stripped
    resourceBase: { kind: 'directory', path: skillDir },
  }))
  const routeDispose = ctx.webServer?.register?.({ /* Step 5 */ })
  if (typeof routeDispose === 'function') disposers.push(routeDispose)
  return () => { for (const d of disposers) { try { d() } catch {} } disposers.length = 0 }
}
```

- **`inject` lists what you touch**: an undeclared service throws before your logic runs. Optional ones (`webServer`, `systemPrompt`, `slots`) still belong in the export — then double-guard the call, so a host lacking them degrades instead of failing activation.
- **`name` is the cordis id**, not a display name: it must match the patch row and the package name, or smoke fails.
- **Registration shape.** `source: 'runtime'` marks a plugin-provided skill. `content` is the body **with frontmatter stripped** — the host does not parse YAML for you. `resourceBase` is what relative references resolve against: wrong base, dead `assets/` links at runtime while the repo looks fine.
- **Diagnose on stdout.** A function-style `ctx` may have no ready logger and `info` is often filtered: one line on activation, one per state change.

Full host and client skeletons: `references/plugin-skeletons.md`.

## Step 3 — Client contract (only if you need UI)

The client bundle is **hand-maintained**, and must self-register:

```js
window.__ModuleLoader__.load({
  id: 'my-plugin',                      // === package name
  factory: function (require) {
    var module = { exports: {} }; var exports = module.exports
    var React = require('react')        // host-provided; never bundle your own
    function apply(ctx) { /* Step 4 */ }
    exports.apply = apply
    exports.inject = ['slots', 'locale'] // cordis SERVICE names
    return module.exports
  },
})
```

- **Bare ESM `export` does not register** — the loader reports `loaded without registering`. Keep the factory form, an ES5 subset (`var`, `function`, `React.createElement`), and `return module.exports` last: this runs in someone else's browser, outside your toolchain.
- **Two `inject` declarations, both required**: `exports.inject` names cordis services, `package.json` → `dsh.client.inject` names the engine packages providing them. Missing either throws `cannot get property ... without inject`.
- **The client must never take the host down**: no top-level throw; wrap registrations and probes in `try/catch` and warn on skip.

## Step 4 — Slots, locale, effects

```js
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section', id: 'my-section', order: 60,
  label: () => t('nav'),                 // thunk: follows the current language
}, MySection))
```

- `ctx.slots.inject(name, cb)` is a **soft probe**: `cb` runs only when the host has that slot. Still wrap it in `try/catch` and return early — a host without the slot must keep your host-side registrations.
- `id` is the stable dedupe/override handle, `order` places the nav row, `label` is a function so a language switch re-renders it.
- **locale**: `ctx.locale.register(ns, { zh, en })`, then `t = ctx.locale.bind(ns)` — bind at `apply` time, not module scope, and keep a `navigator.language` fallback so a host without `ctx.locale` renders one language instead of `undefined`.
- **`ctx.effect(fn, label)`** owns non-registration side effects (injected `<style>`, listeners): `fn` returns the remover, the fiber runs it on disable. Guard against double mount so styles are not duplicated.

## Step 5 — Data plane, when the client cannot see host state

Client code cannot read the disk or host memory, and the host's settings RPC serves no third-party namespace. The escape hatch is a route you own:

```js
ctx.webServer.register({ kind: 'prefix', path: '/my-plugin/api', handler: async (req, res) => {
  if (!isLoopbackHost(req.headers)) return writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
  /* method + action routing, body validation */
}})
```

- **Host loopback trust boundary**: accept only `127.0.0.1`, `localhost`, `::1`, `[::1]` after stripping the port from `req.headers.host`; everything else `403` before any work. Same fence as the engine's own gateway — it makes "local-only" true rather than aspirational.
- **Contract**: GET reads, POST writes; `{ ok: true, ... }` on success, `{ ok: false, error: { code, message } }` otherwise; `400` bad body, `404` unknown action. Parse the URL against a dummy origin; read the body by iterating the request, never assume `content-length`.
- **Validate against the catalog, not just the type**: filter requested names through what exists, so a stale client cannot resurrect a removed capability. **Never leak** keys, home paths or stack traces.

Handler, fence, state module: `references/data-plane-and-state.md`.

## Step 6 — State persistence

- **Home chain**: `KCODER_HOME` → `DSH_HOME` → legacy `QILIN_HOME` → `~/.kcoder`. New variables win; the legacy one is read once for migration, then abandoned.
- **File**: `<product>-<thing>.json` in that private namespace, `JSON.stringify(..., null, 2)` + trailing newline, `mode: 0o600` at write time.
- **Tolerate everything at read** (missing, unparsable, wrong-typed, unknown → empty set, never throw) and **degrade at write** (a failed write leaves the change valid for this session only).
- **Filter persisted names against the live catalog**: after a release removes a skill, a stale name must vanish silently rather than crash the state sync.

## Step 7 — Package and dual-channel declaration

```jsonc
"type": "module", "main": "entry.js",
"exports": { ".": "./entry.js", "./client": "./client.js", "./cordis.patch.yml": "./cordis.patch.yml", "./package.json": "./package.json" },
"files": ["entry.js", "client.js", "cordis.patch.yml", "skills", "README.md"],
"dsh":   { "bundle": { "patch": "./cordis.patch.yml" }, "client": { "bundle": "./client.js", "inject": ["@deepseek-ai/dsh-client-ui-slots"], "platform": "web" } },
"qilin": { "bundle": { "patch": "./cordis.patch.yml" } },
"scripts": { "smoke": "node scripts/smoke-plugin.mjs", "prepack": "pnpm smoke" }
```

- **Both channels, same file.** QiLin's manager reads only the native `qilin.bundle.patch`; DSH reads `dsh.*`. Without the `qilin` block the package is invisible to QiLin while still activating under DSH.
- **The patch is `- insert: [{ id, name }]`**: `id` is the handle later layers override or disable, `name` must equal the package name. Quote values starting with `@` (bare `@` is a YAML anchor).
- **`files` is a payload whitelist**: anything omitted does not ship, and the failure appears only after publish.

Annotated contract and peer rationale: `references/package-contract.md`.

## Step 8 — Install: rules learned the hard way

1. **Install only through the plugin manager** (`dsh plugin --profile web add <pkg>`, `qilin plugin --profile qilin add <pkg>`). It lands in the profile-private `node_modules`, the first hop of bare-specifier resolution; hand-placing a directory in the shared `profiles/node_modules` hits a reserved zone and dies with `failed to import`.
2. **Profile installs run pnpm's supply-chain policy**: `minimumReleaseAge` defaults to 24h, so a version published ten minutes ago is rejected by design. Wait, re-run once, or add an exclude.
3. **`minimumReleaseAgeExclude` accepts bare package names only.** An entry with a version (`pkg@1.2.3`) is a dead entry: silently ignored, install keeps failing, file looks right. (Verified 2026-10-26.)
4. **When an install fails, the offending package is often not yours**: a peer or transitive dependency trips the policy and your name never appears. Fix the package actually named.
5. **Keep the engine peer optional** (`peerDependenciesMeta.optional: true`) or omit it: a wide non-optional peer range makes pnpm's peer auto-install resolve a prerelease and pull the **whole engine tree** into the profile — silent pollution, worse than an error.
6. **The git protocol may be blocked** while HTTPS/codeload works; prefer the tarball over `git clone` for a large repo. After install, restart the engine — a client-only change needs a hard browser refresh instead.

## Step 9 — Quality gates

Two committed scripts; `prepack` runs smoke, so a broken artifact cannot reach a registry.

- **smoke** — shape only, no host: package name/version/`main`, both `bundle.patch` keys, `exports["./client"]`, `entry.js` exports `inject`, `client.js` calls `__ModuleLoader__.load` with `id` == package name and takes React through the factory, patch `name` points at the package, zero legacy-name residue, and **every relative path a SKILL.md cites exists**.
- **selftest** — behavior on a mock `ctx`: registration count, route mounted at the expected path, non-loopback `403`, GET/POST round-trip, `400`/`404`, state file `0600` with expected content, re-`apply` recovering after a simulated restart, disposer clearing registrations and route. Pin every home env var to a temp dir, or a developer's real `DSH_HOME` leaks into the assertions.

Scripts and the assertion-to-regression table: `references/quality-gates.md`.

## Step 10 — Distribution

- Mirror the development source with an **exclusion-based** script: only repo-root toolchain directories are excluded; payload is excluded by nothing.
- **The silent failure**: when a rule swallows payload, mirror and check apply the same rule — both lose the file, both report consistent, and every cited path is dead. Keep an invariant assertion that walks the payload with **no exclusions** and diffs it against what the rule kept.
- **The mirror repo may gate commits** (a pre-commit hook requiring its README plugin list in the same commit). Assume it does.
- **Release order**: source commit → mirror sync commit → push both → tag → `npm publish` (prepack smoke) → release notes.

## Step 11 — Done checklist

- [ ] `name` consistent across package / patch row / client module id; `inject` covers every service used on both halves
- [ ] `apply` returns an idempotent disposer; every registration collected; migration runs once
- [ ] client self-registers via `__ModuleLoader__`, ES5 subset, `return module.exports`, no bare export
- [ ] slot registration soft-probes; locale registered and bound with fallback; styles via `ctx.effect`
- [ ] route fenced to loopback; `403`/`400`/`404` exercised; no secrets or internal paths in responses
- [ ] state file `0600`, read tolerant, write degrading, stale names filtered
- [ ] `dsh.bundle.patch` **and** `qilin.bundle.patch` → the same patch file
- [ ] smoke + selftest green, `prepack` wired to smoke, every cited relative path exists
- [ ] mirror reconciled, README/counts updated, release order followed
