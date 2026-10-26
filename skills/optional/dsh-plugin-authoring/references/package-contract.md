# Package contract

What the host actually reads, in order, when a plugin is installed:

1. the **profile install** resolves the package specifier into profile-private `node_modules`;
2. the **manager** reads the channel key (`qilin.bundle.patch` for QiLin, `dsh.bundle.patch` for DSH) to find the bundle layer;
3. the **bundle layer** (`cordis.patch.yml`) inserts a row `{ id, name }`;
4. the **entry** named by `name` is imported and its `name` / `inject` / `apply` are used;
5. for web, the **client** half is fetched from `dsh.client.bundle` and self-registers in the browser.

Any missing link is a different, confusing error. That is why the contract is checked mechanically before publishing.

## package.json — annotated

```jsonc
{
  "name": "my-plugin",              // must equal entry `name` and patch `name`
  "version": "1.0.0",               // semver, immutable once published
  "type": "module",                 // ESM entry; no transpile step downstream
  "main": "entry.js",
  "exports": {
    ".": "./entry.js",                       // required: the host imports the package root
    "./client": "./client.js",               // required when a client half exists
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": [                        // payload whitelist — forget an entry, it does not ship
    "entry.js",
    "client.js",
    "cordis.patch.yml",
    "skills",
    "README.md",
    "LICENSE"
  ],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "bundle": "./client.js",
      "inject": [
        "@deepseek-ai/dsh-client-locale",     // engine packages, not cordis services
        "@deepseek-ai/dsh-client-ui-slots"
      ],
      "platform": "web"
    }
  },
  "qilin": {
    "bundle": { "patch": "./cordis.patch.yml" },  // QiLin manager reads ONLY this key
    "client": { "bundle": "./client.js", "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-slots"], "platform": "web" }
  },
  "scripts": {
    "smoke": "node scripts/smoke-plugin.mjs",
    "selftest": "node scripts/selftest.mjs",
    "sync:mirror": "node scripts/sync-to-dsh-plugins.mjs",
    "sync:check": "node scripts/sync-to-dsh-plugins.mjs --check",
    "prepack": "pnpm smoke"         // registry publish is gated on the shape check
  },
  "peerDependencies": { "@deepseek-ai/dsh": ">=0.1.0-rc.5 <1.0.0" },
  "peerDependenciesMeta": { "@deepseek-ai/dsh": { "optional": true } }
}
```

### Why each field earns its place

- `main` + `exports["."]`: the manager imports the package root by name. A package that only has `main` works on old resolvers and breaks on strict ESM resolution; declare both.
- `exports["./client"]`: the web host fetches the client half through the package's export map, not by guessing a filename.
- `files`: npm publishes exactly this list plus `package.json`. A missing `skills/` means the skill registrations find no content and the plugin activates "successfully" with zero capabilities.
- `dsh.client.inject`: the engine **packages** that must be loaded before your client's factory runs. It is the packaging-level twin of `exports.inject` (cordis **service** names). Omitting one side gives `cannot get property ... without inject`.
- `prepack`: the only release gate that cannot be skipped by forgetting to run a script.

### Peer dependencies

Keep the engine peer **optional** and bound it, or leave it out. A wide non-optional range (`>=0.1.0-rc.5 <0.2.0`) makes pnpm's peer auto-install resolve a prerelease and pull the whole engine tree (hundreds of packages) into the user's profile — silently. Prerelease versions only satisfy comparators on the same `[major, minor, patch]` tuple, so a range written against a dotted prerelease effectively never matches and pnpm "fixes" it for you by installing something else.

## cordis.patch.yml — annotated

```yaml
# bundle layer: mounted by the manager right after the web app bundle.
# Local layers (a profile's own cordis.patch.yml, a --patch override)
# may override or disable this row by its `id`.

- insert:
    - id: my-plugin          # stable handle; must be unique among mounted rows
      name: 'my-plugin'      # package name to import; quote it
```

Rules:

- Exactly one `insert` row per plugin. `id` is the override handle — never derive it from a path or a version.
- Quote values that begin with `@` (a bare `@` is a YAML anchor) and quote anything with `:` or `#`.
- The row's `name` must be the package name, byte-identical to `package.json`. A mismatch makes the row point at nothing.
- Mounting twice (same `id` from two layers) is a hard error: `duplicate loader entry id`. If an aggregator package mounts you under a different `id`, either it owns the mount or you do — detect an already-enabled mount of your own package and stand down.

## Feature flags via config

If the plugin needs an on/off switch, take it as the second `apply` argument and return a no-op disposer immediately:

```js
export function apply(ctx, config = {}) {
  if (config.enabled === false) return () => {}
  ...
}
```

This is what the bundle config surface calls into. It costs two lines and makes the plugin safe to mount disabled.
