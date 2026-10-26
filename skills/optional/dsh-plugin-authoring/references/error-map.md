# Error map

Every host failure below names its own layer. Match the message first; only then open the file it points at.

| Symptom | Layer | Cause | Fix |
|---|---|---|---|
| `cannot get property "skills" without inject` | host / client | the service is used in `apply` but absent from the named `inject` export. On the client, `exports.inject` (cordis service names) and `package.json` → `dsh.client.inject` (engine packages) are **two separate declarations**; either one missing produces this | add the missing name to *both* the export and the manifest when the service comes from an engine package |
| `client.js loaded without registering` | client | the file is a normal ESM module (`export function apply`). The loader inspects the module for a `__ModuleLoader__.load({ id, factory })` call; a module that never calls it is rejected | rewrite in the factory form and `return module.exports` |
| `failed to import` at activation | package | the package directory was hand-placed in the *shared* profile `node_modules`. That directory is an install-reserved zone after the runtime/enforce resolution change: packages intended to be resolved there are skipped | remove the copy, install with the plugin manager so it lands in the profile-private `node_modules` |
| no bundle declared | package | the manager looked for its own channel key and found nothing. QiLin reads **only** `qilin.bundle.patch`; DSH reads `dsh.*` | declare both keys, pointing at the same `cordis.patch.yml` |
| `duplicate loader entry id` | package | two layers mount the same `id`, or an aggregator package mounts you under the id you also mount yourself | keep one mount; if an aggregator owns it, detect an enabled mount of your own package and stand down |
| `minimum release age` | install | pnpm refuses a version younger than `minimumReleaseAge` (default 24h) | wait 24h, re-run once, or add a `minimumReleaseAgeExclude` entry |
| install fails naming a package that is not yours | install | a peer or transitive dependency trips the policy; your package never appears in the error | fix the package actually named, not your own version |
| `Ignored build scripts` | install | pnpm blocked a dependency's install script | `pnpm approve-builds --all` in the profile directory, then rebuild |
| plugin activates but does nothing; only an `stderr` line about disabling a profile plugin | package | a compatibility gate skipped the whole bundle. There is no UI banner | check the engine version range in your manifest against the host |
| two copies of the same UI panel | package | a stale manual `insert` in the profile's own `cordis.patch.yml` survives alongside the bundle-provided mount | delete the manual row |

## Triage order

1. **Did activation even happen?** A missing activation line in the host's stdout means a packaging or mount problem (`failed to import`, no bundle declared, duplicate id) — not a code problem.
2. **Did the service exist?** `without inject` is never a logic bug: it is a declaration that was not made.
3. **Did registration return?** A registration that threw mid-`apply` leaves a half-mounted plugin with no disposer — the settings UI then toggles something that cannot be unregistered.
4. **Only then** read your own handler.

## Silent failures worth remembering

- A compatibility gate can skip an entire bundle with one stderr line and no user-visible signal — the surface simply never appears. If a plugin "isn't there", check the gate before the code.
- Payload omitted from the `files` whitelist ships as a package that activates successfully with zero capabilities.
- A state file written before a rename still exists; if the read path filters persisted names against the live catalog, the stale ones disappear without an error. That is intended behaviour, not a bug report.
