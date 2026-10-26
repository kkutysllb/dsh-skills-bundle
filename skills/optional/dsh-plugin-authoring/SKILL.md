---
name: dsh-plugin-authoring
description: Use when authoring a dsh/QiLin/KCoder plugin (host cordis plugin with an optional web-client extension), or when debugging plugin activation, skill registration, slot/locale wiring, fenced HTTP APIs, state persistence, bundle packaging, profile install or release failures in those hosts
---

# dsh Plugin Authoring

## Overview

A dsh/QiLin/KCoder plugin is a **cordis fiber plus a package**. The fiber: `name`, `inject`, `apply(ctx)` returning a disposer. The package: a `package.json` contract, a `cordis.patch.yml` bundle layer, a zero-build ESM payload. A client extension, an HTTP data plane, a state file — each is a layer on that skeleton.

Two invariants at every layer: **every registration returns a disposer** (and `apply` returns one function that runs them all, idempotently), and **zero build** — ship the executed artifact; the client gets React from the host via `require("react")`, so even a UI half needs none.

Read `dsh-skills-bundle/entry.js` (registration + fenced API + persistence), `dsh-skills-bundle/client.js` (ModuleLoader + slot + locale) and `dsh-animations/entry.js` (host-only) before writing your own.

## Step 0 — Map the error to the layer

Read the message first — failures name their own layer.

| Symptom | Cause |
|---|---|
| `cannot get property "skills" without inject` | service used in `apply`, missing from the `inject` export |
| `client.js loaded without registering` | bare ESM `export`; the loader never saw `__ModuleLoader__.load` |
| `failed to import` on activation | package hand-placed in the shared profile `node_modules` (reserved zone) |

Full index (duplicate mounts, missing channel key, pnpm policy, silent skips): `references/error-map.md`.

## Step 1 — Choose the shape

**Host-only** when the capability is model-facing (skills, tools, prompt sections, routes): `entry.js` + patch. **Host + client** when a UI surface exists (settings section, panel, overlay): add `client.js` + `dsh.client`. Either way **zero-build** — commit the artifact; build only for a dependency you must vendor.

Decide once, in writing: the client half doubles the inject, packaging and failure surfaces.

## Step 2 — Host contract

```js
export const name = 'my-plugin'                 // == patch name == package name
export const inject = ['skills', 'webServer']   // every ctx service touched

export function apply(ctx) {
  const disposers = []
  disposers.push(ctx.skills.register({
    name: 'my-skill', description: '...', source: 'runtime',
    content,                          // frontmatter stripped
    resourceBase: { kind: 'directory', path: skillDir },
  }))
  const routeDispose = ctx.webServer?.register?.({ /* Step 5 */ })
  if (typeof routeDispose === 'function') disposers.push(routeDispose)
  return () => { for (const d of disposers) { try { d() } catch {} } disposers.length = 0 }
}
```

- **`inject` lists what you touch**: an undeclared service throws before your logic runs, and `name` is the cordis id (not a display name) — it must match the patch row and the package name, or smoke fails.
- **Optional services still go in the export**, then double-guard the call (`ctx.webServer?.register?.`), so a host build lacking one degrades instead of failing activation.
- **Registration shape.** `source: 'runtime'` marks a plugin-provided skill; `content` is the body **with frontmatter stripped** (the host does not parse YAML for you); `resourceBase` is what relative references resolve against — wrong base, dead `assets/` links at runtime while the repo looks fine.
- **Diagnose on stdout**: a function-style `ctx` may have no ready logger and `info` is often filtered. Log activation and each change.

Full host and client skeletons: `references/plugin-skeletons.md`.

## Step 3 — Client contract (only if you need UI)

The client bundle is **hand-maintained**, and must self-register:

```js
window.__ModuleLoader__.load({
  id: 'my-plugin',                    // === package name
  factory: function (require) {
    var module = { exports: {} }; var exports = module.exports
    var React = require('react')      // host-provided; never bundle your own
    exports.apply = function apply(ctx) { /* Step 4 */ }
    exports.inject = ['slots', 'locale']   // cordis SERVICE names
    return module.exports
  },
})
```

- **Bare ESM `export` does not register** — the loader reports `loaded without registering`. Keep the factory form, an ES5 subset (`var`, `function`, `React.createElement`), and `return module.exports` last: this runs outside your toolchain.
- **Two `inject` declarations, both required**: `exports.inject` names cordis services, `package.json` → `dsh.client.inject` names the engine packages providing them. Missing either throws `cannot get property ... without inject`.
- **The client must never take the host down**: no top-level throw; wrap registrations and probes in `try/catch`.

## Step 4 — Slots, locale, effects

Register with `ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id, order, label: () => t('nav') }, Section))`.

- `ctx.slots.inject(name, cb)` is a **soft probe**: `cb` runs only when the host has that slot. Still wrap it in `try/catch` and return early — a host without the slot must keep your host-side registrations. `id` is the dedupe/override handle, `order` places the nav row, and `label` is a function so a language switch re-renders it.
- **locale**: `ctx.locale.register(ns, { zh, en })`, then `t = ctx.locale.bind(ns)` — bind at `apply` time, not module scope, and keep a `navigator.language` fallback so a host without the service renders one language instead of `undefined`.
- **`ctx.effect(fn, label)`** owns non-registration side effects (injected `<style>`, listeners): `fn` returns the remover, the fiber runs it on disable. Guard against double mount.

## Step 5 — Data plane, when the client cannot see host state

The client cannot read the disk or host memory, and the host's settings RPC serves no third-party namespace. The escape hatch is a route you own: `ctx.webServer.register({ kind: 'prefix', path: '/my-plugin/api', handler })`.

- **Host loopback trust boundary**: the handler fences first — accept only `127.0.0.1`, `localhost`, `::1`, `[::1]` after stripping the port from `req.headers.host`; `403` everything else before any work. Same fence as the engine's own gateway.
- **Contract**: GET reads, POST writes; `{ ok: true, ... }` / `{ ok: false, error: { code, message } }`; `400` bad body, `404` unknown action. Parse the URL against a dummy origin, read the body by iterating the request (never assume `content-length`), **validate against the catalog, not just the type**, and **never leak** keys, home paths or stack traces.

Handler, fence, state module: `references/data-plane-and-state.md`.

## Step 6 — State persistence

- **Home chain**: `KCODER_HOME` → `DSH_HOME` → legacy `QILIN_HOME` → `~/.kcoder`. New variables win; the legacy one is read once for migration.
- **File**: `<product>-<thing>.json` in that private namespace, `JSON.stringify(..., null, 2)` + trailing newline, `mode: 0o600`.
- **Tolerate everything at read** (missing, unparsable, wrong-typed, unknown → empty set, never throw), **degrade at write** (a failed write leaves the change valid for this session), and **filter persisted names against the live catalog** — a stale name from a removed capability must vanish silently, not crash the sync.

## Step 7 — Package and dual-channel declaration

`type: module`; `main` + `exports` (`"."`, `"./client"`, `"./cordis.patch.yml"`, `"package.json"`); `files` whitelist; `dsh.bundle.patch` **and** the same `qilin.bundle.patch`; `dsh.client` with `bundle`, `inject` (engine packages), `platform: 'web'`; `scripts.smoke` + `scripts.prepack: pnpm smoke`.

- **Both channels, same file.** QiLin's manager reads only the native `qilin.bundle.patch`; DSH reads `dsh.*`. Without the `qilin` block the package is invisible to QiLin while still activating under DSH.
- **The patch is `- insert: [{ id, name }]`**: `id` is the handle later layers override or disable, `name` must equal the package name. Quote values starting with `@` (bare `@` is a YAML anchor).
- **`files` is a payload whitelist**: anything omitted does not ship; you find out after publish.

Annotated contract and peer rationale: `references/package-contract.md`.

## Step 8 — Install: rules learned the hard way

1. **Install only through the plugin manager** (`dsh plugin --profile web add <pkg>`, `qilin plugin --profile qilin add <pkg>`), which lands the package in the profile-private `node_modules`, the first hop of resolution. The shared `profiles/node_modules` is a reserved zone: a package there dies with `failed to import`.
2. **Profile installs run pnpm's supply-chain policy**: `minimumReleaseAge` defaults to 24h, so a version published ten minutes ago is rejected by design — wait, re-run once, or add an exclude. That exclude list accepts **bare package names only**: an entry carrying a version (`pkg@1.2.3`) is a dead entry — silently ignored, install keeps failing, file looks right (verified 2026-10-26).
3. **When an install fails, the offending package is often not yours** — a peer or transitive dependency trips the policy and your name never appears. Fix the one actually named.
4. **Keep the engine peer optional** (`peerDependenciesMeta.optional: true`) or omit it: a wide non-optional range makes pnpm's peer auto-install pull the **whole engine tree** into the profile — silent pollution, worse than an error.
5. **The git protocol may be blocked** while HTTPS/codeload works; prefer the tarball over `git clone` for a large repo. After install, restart the engine — a client-only change needs a hard browser refresh instead.

## Step 9 — Quality gates

Two committed scripts; `prepack` runs smoke so a broken artifact never ships.

- **smoke** — shape only, no host: name/version/`main`, both `bundle.patch` keys, `exports["./client"]`, `inject` exported, `__ModuleLoader__.load` id == package name, React through the factory, patch `name` pointing at the package, zero legacy-name residue, and **every relative path a SKILL.md cites exists**.
- **selftest** — behavior on a mock `ctx`: registration count, route at the expected path, non-loopback `403`, GET/POST round-trip, `400`/`404`, state file `0600` with expected content, recovery after a simulated restart, disposer clearing registrations and route. Pin every home env var to a temp dir, or a real `DSH_HOME` leaks into the assertions.

Scripts and the assertion-to-regression table: `references/quality-gates.md`.

## Step 10 — Distribution

- Mirror the development source with an **exclusion-based** script: only repo-root toolchain directories are excluded; payload is excluded by nothing.
- **The silent failure**: when a rule swallows payload, mirror and check apply the same rule — both lose the file, both report consistent, every cited path is dead. Keep an invariant assertion that walks the payload with **no exclusions** and diffs it against what the rule kept. The mirror repo may also gate commits on its README list; assume it does.
- **Release order**: source commit → mirror sync commit → push both → tag → `npm publish` (prepack smoke) → release notes.

## Step 11 — Done checklist

- [ ] `name` consistent across package / patch row / client module id; both halves' `inject` covers every service used
- [ ] `apply` returns an idempotent disposer; every registration collected; migration runs once
- [ ] client self-registers via `__ModuleLoader__` (ES5 subset); slots soft-probe, locale bound with fallback, styles via `ctx.effect`
- [ ] route fenced to loopback with `403`/`400`/`404` exercised; state file `0600`, stale names filtered
- [ ] `dsh.bundle.patch` **and** `qilin.bundle.patch` → the same patch file
- [ ] smoke + selftest green, `prepack` wired to smoke, mirror reconciled
