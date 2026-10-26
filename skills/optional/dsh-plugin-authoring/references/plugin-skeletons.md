# Plugin skeletons

Two complete, minimal-but-real skeletons. Trim the layers you do not need; do not trim the disposer discipline.

## Host: `entry.js`

```js
// Zero-dependency ESM. Resolved directly from profile node_modules — no build step.
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Stable cordis plugin name; must equal package name and patch `name`. */
export const name = 'my-plugin'

/** Every ctx service touched below. Omitting one throws "without inject". */
export const inject = ['skills', 'webServer']

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const SKILLS_DIR = join(ROOT, 'skills')
const STATE_FILE = 'my-plugin.json'

/** Product-private state directory: engine home, with legacy fallback. */
function homeDir() {
  for (const key of ['KCODER_HOME', 'DSH_HOME']) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  const legacy = process.env.QILIN_HOME
  if (typeof legacy === 'string' && legacy.trim() !== '') return legacy
  return join(homedir(), '.kcoder')
}

/** The host does not parse YAML for you: strip the frontmatter block first. */
function stripFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return raw
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return raw
  return raw.slice(end + 5).replace(/^\n+/, '')
}

function readState() {
  try {
    const parsed = JSON.parse(readFileSync(join(homeDir(), STATE_FILE), 'utf8'))
    return Array.isArray(parsed?.enabled) ? parsed.enabled.filter((n) => typeof n === 'string') : []
  } catch {
    return []            // missing, corrupt, wrong shape: empty set, never throw
  }
}

function writeState(enabled) {
  try {
    writeFileSync(join(homeDir(), STATE_FILE), `${JSON.stringify({ enabled }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,        // owner-only: this is user data
    })
  } catch {
    // read-only home etc.: the change stays valid for this session only
  }
}

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

/** Route handler: fence first, then actions. Full version in data-plane-and-state.md. */
async function apiHandler(req, res) {
  const raw = req.headers?.host
  const host = (Array.isArray(raw) ? raw[0] : raw ?? '').toLowerCase().replace(/:\d+$/, '')
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    return send(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
  }
  return send(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown action' } })
}

export function apply(ctx) {
  const manifest = JSON.parse(readFileSync(join(SKILLS_DIR, 'manifest.json'), 'utf8'))
  const disposers = []

  for (const item of manifest.skills ?? []) {
    const dir = join(SKILLS_DIR, item.dir)
    disposers.push(ctx.skills.register({
      name: item.name,
      description: item.description,
      source: 'runtime',
      content: stripFrontmatter(readFileSync(join(dir, 'SKILL.md'), 'utf8')),
      // relative references inside `content` resolve against this directory
      resourceBase: { kind: 'directory', path: dir },
    }))
  }

  // Optional service: guard the call so a host without it still activates.
  const disposeRoute = ctx.webServer?.register?.({ kind: 'prefix', path: '/my-plugin/api', handler: apiHandler })
  if (typeof disposeRoute === 'function') disposers.push(disposeRoute)

  console.log(`my-plugin: ${disposers.length} registrations`)
  return () => {
    for (const dispose of disposers) { try { dispose() } catch {} }
    disposers.length = 0
  }
}
```

Notes that matter more than they look:

- `ROOT` from `import.meta.url` — never `process.cwd()`. The host runs from its own working directory.
- Payload read at `apply` time, not module scope: a broken payload should fail activation loudly, but a *disabled* plugin should not pay for it.
- If a manifest is your metadata source, the manifest is a build artifact — regenerate it whenever a payload directory changes, and let the smoke gate reconcile it against the directories on disk.

## Client: `client.js`

```js
/**
 * Hand-maintained client bundle. NOT compiled.
 * Bare ESM `export` does not register: the loader reports
 * "loaded without registering". Must call __ModuleLoader__.load and
 * return module.exports.
 */
window.__ModuleLoader__.load({
  id: "my-plugin",                       // === package name
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");        // provided by the host, never bundled

    var NS = "myPlugin";
    var SECTION_ID = "my-plugin-section";

    var zh = { /* same three keys, translated: nav, title, failed */ };
    var en = { nav: "My plugin", title: "My plugin", failed: "Failed to load" };

    /* Fallback translation: browser language only — the behaviour on hosts
     * that have no locale service. apply() rebinds this through ctx.locale. */
    var t = function (key) {
      var lang = (typeof navigator !== "undefined" && navigator.language || "").toLowerCase().indexOf("zh") === 0 ? zh : en;
      return lang[key] || key;
    };

    /* Scoped styles; the returned remover is handed to ctx.effect. */
    function ensureStyles() {
      if (document.getElementById("myp-styles") !== null) return null;
      var style = document.createElement("style");
      style.id = "myp-styles";
      style.textContent = ".myp-intro{margin:0 0 16px;font-size:13px;opacity:.66}";
      document.head.append(style);
      return function () { style.remove(); };
    }

    function fetchState() {
      return fetch("/my-plugin/api/state", { headers: { accept: "application/json" } })
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
        .then(function (payload) {
          if (payload && payload.ok) return payload;
          throw new Error(payload && payload.error ? payload.error.message : "bad payload");
        });
    }

    function Section() {
      var state = React.useState({ status: "loading", error: null });
      var snapshot = state[0], setState = state[1];
      React.useEffect(function () {
        fetchState()
          .then(function (payload) { setState({ status: "ready", data: payload, error: null }); })
          .catch(function (e) { setState({ status: "error", error: e && e.message }); });
      }, []);
      if (snapshot.status === "error") {
        return React.createElement("p", { className: "myp-intro" }, t("failed"));
      }
      return React.createElement("p", { className: "myp-intro" }, t("title"));
    }
    Section.displayName = "MyPluginSection";

    var inject = ["slots", "locale"];    // cordis SERVICE names

    function apply(ctx) {
      if (ctx && ctx.locale && typeof ctx.locale.register === "function" && typeof ctx.locale.bind === "function") {
        ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); },
          "my-plugin: locale dictionaries");
        t = ctx.locale.bind(NS);
      }
      var removeStyles = ensureStyles();
      if (removeStyles !== null && typeof ctx.effect === "function") {
        ctx.effect(function () { return removeStyles; }, "my-plugin: styles");
      }
      // Soft probe: a host without this slot skips the section, nothing else breaks.
      if (!ctx.slots || typeof ctx.slots.inject !== "function") return;
      try {
        ctx.slots.inject("settings.section", function () {
          return ctx.slots.register({
            name: "settings.section",
            id: SECTION_ID,
            order: 60,
            label: function () { return t("nav"); },
          }, Section);
        });
      } catch (error) {
        console.warn("[my-plugin] no settings.section slot on this host:", error && error.message);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
```

## Why the client looks like ES5

The factory runs inside the host's loader, not through your toolchain. Any dependency on a bundler assumption (top-level `import`, JSX, optional chaining in older engines) is a runtime failure in someone else's browser that you cannot reproduce locally. `var`, `function`, `Object.assign` and `React.createElement` are the subset that has never broken. React comes from `require("react")` — the host's copy — so hooks are available and your bundle stays dependency-free.
