---
name: mcp-server-authoring
description: Use when designing, implementing, reviewing, or debugging an MCP server - tool surface and JSON Schemas, result and error contracts, stdio versus HTTP transport, auth, security boundaries, contract tests, and versioning.
---

# MCP Server Authoring

## Overview

An MCP (Model Context Protocol) server is not a wrapper around existing code. It is **a contract a model reads**. The model never sees your implementation — only tool names, descriptions, JSON Schemas, and returned results. Design those four artifacts, then write the code that satisfies them.

Corollary: every review finding must name the artifact it applies to (a tool name, a schema field, an error code, a transport choice). "The server is well designed" is not a finding.

## Decide Whether a Server Should Exist

Build a server only when the capability must outlive a single run or be shared across processes:

| Situation | Do this |
|---|---|
| Data is needed once, in this session | Inline script or a direct command |
| One process, one user, one agent, no reuse | A local function or CLI the agent already has |
| The work is a fixed pipeline with no model choice | A script with a stable interface |
| Several clients (editor, web, CLI) need one capability | Server |
| State must persist across sessions, or jobs run long | Server |
| Dependencies/permissions must be isolated from the host | Server |

A server costs a second process, a transport, an auth story, a version line, and a test harness. If no right-column reason applies, that cost buys nothing.

## Tool Surface Design

**Few and orthogonal.** One tool = one intent. Split when permission, failure mode, or approval differs; merge when only an enum value differs.

- Merge: `search_issues(scope: "open" | "closed")` — same resource, same auth, same failure.
- Split: `read_file` vs `write_file` — different blast radius.
- Never ship `manage_project(action, payload)`. The model now has to guess a schema the JSON Schema cannot describe, and every unknown action is an unvalidated path.

**Names.** `verb_noun`, lowercase snake_case, stable across versions. The name is the first prompt the model reads: `get_invoice` beats `invoice_tool`. Do not ship synonyms (`fetch`/`get`/`read`) across tools — they compete for the same intent and produce misroutes.

**Descriptions are prompts.** Four parts, in order:

1. When to use it, and which other tool is correct instead.
2. Each parameter's meaning, unit, format, accepted range.
3. What comes back, including shape, ordering, and empty-result behavior.
4. Failure modes and side effects: mutation, irreversibility, cost, rate limits, retention.

```yaml
name: search_logs
description: >
  Search application logs in a time window. Use for incident triage when raw
  lines are needed; use query_metrics for aggregates instead. Returns up to
  `limit` entries newest-first with timestamp, level, service, message.
  No matches returns entries: [] (not an error). Read-only. Lines older than
  the retention window return error code retention_exceeded.
inputSchema:
  type: object
  additionalProperties: false
  required: [service, since]
  properties:
    service: {type: string, enum: [api, worker, scheduler]}
    since:   {type: string, format: date-time}
    limit:   {type: integer, minimum: 1, maximum: 500, default: 100}
```

**Schema rules — encode the contract in JSON Schema, not in prose:**

- `enum` for closed sets; `default` for optional-with-fallback; `minimum`/`maximum`/`maxLength` for bounds; `format` where checkable.
- Keep `required` minimal; an optional field means the server can proceed without it.
- `additionalProperties: false`, so a typo is an error instead of a silent no-op.
- No universal `options` / `config` / `params` object — it defers all validation to runtime.
- Model one choice as one field: `sort: "asc" | "desc"`, not `reverse` + `sort_by` + `case_sensitive`.
- Never accept a credential as a parameter. One tool family, one credential scope.

## Return and Error Contract

**Content.** Return the smallest thing that answers the question. Structured fields for code, one or two sentences for the model:

- `content: [{type: "text", text: "3 failing jobs in api since 10:02Z, oldest 41m"}]` plus `structuredContent` when the client supports it.
- Never dump a raw upstream payload "just in case". Truncate with an explicit marker and a documented way to continue.
- Bound every list. Unbounded output is a context leak, not a convenience.

**Pagination.** Opaque cursor, not an offset the caller computes. `limit` bounded (e.g. 1–200, default 50). End of list is an absent/`null` cursor — never an empty page that reads as success. Cursors expire; say so in the description.

**Error classes.** The caller's reaction differs, so the code must differ:

| Code | Retry | Caller action |
|---|---|---|
| `invalid_argument` | no | fix args; surface allowed values |
| `not_found` | no | stop; the id is wrong |
| `permission_denied` | no | escalate or change scope |
| `rate_limited` | yes, with backoff | wait and retry |
| `transient` | yes | retry idempotent call, then degrade |
| `timeout` | maybe | retry once, then report partial |
| `internal` | maybe | report with trace id |

Every error carries `code`, a human `message`, `retryable: bool`, and `details` (offending field, allowed values). Never a stack trace, SQL, absolute path, or token.

**Writes.** Accept an idempotency key so a retried call does not duplicate. Return the created id and whether the write actually happened. Do not hide a mutation inside a read-looking tool.

**Timeouts.** Server deadline shorter than the client's. On deadline, return `timeout` with partial progress — never hold the request open.

## Transport and Lifecycle

| | stdio | Streamable HTTP |
|---|---|---|
| Clients | one, local | many, remote |
| Auth | process env / OS user | token or OAuth per request |
| Ops | no port, no deploy | TLS, sessions, scaling, resumability |
| Choose when | developer machine, single agent | shared service, multi-client |

Start with stdio. Move to HTTP only for a stated remote or multi-client requirement, and budget the auth work with it.

- **stdio:** the protocol owns stdout. Logs go to **stderr** only; one stray print corrupts the stream. Exit non-zero on startup failure, and keep the process alive while the client is connected.
- **HTTP:** validate `Origin`, bind and expire sessions, state whether resumption is supported, cap body size, set request timeouts, return 405 for unsupported methods.
- **Auth:** secret from env or a secret store, never a tool argument. As a resource server, validate token audience and expiry, map scopes to tools, fail closed. The OAuth flow belongs to the host/client, not to a tool.

**Primitives — pick by who invokes them:**

- **Tools** — model-invoked actions, including anything with a side effect.
- **Resources** — read-only, addressable data the client may attach as context (docs, schemas, fixtures). Prefer a resource over a tool that returns static text.
- **Prompts** — user-invoked templates for a human click. If a human triggers it, it is not a tool.

## Security

- **Path traversal:** resolve to a real absolute path, then assert containment inside an allowlisted root using a separator-aware prefix check. Reject `..`, symlinks escaping the root, and model-supplied absolute paths.
- **Command injection:** pass argv arrays to exec, never a shell string. If a shell is unavoidable, allowlist the binary and argument shapes; no interpolation of model-supplied text.
- **SSRF:** for any fetch of a model-supplied URL — allowlist scheme and hosts, block loopback/link-local/metadata ranges, re-validate after each redirect, cap redirects, set connect and read timeouts.
- **Secrets:** never in schema defaults, `examples`, descriptions, logs, or error text. Scan log lines for token patterns before writing; redact headers.
- **Least privilege:** read-only by default. Destructive tools need an explicit scope plus a confirmation gate. One credential per tool family, never a god token shared by all tools.
- **Output redaction:** mask PII and secret shapes, cap output bytes, and strip internal identifiers before content enters the model's context.

## Testing

1. **Inspector, by hand:** list tools, then for each — one valid call, one invalid enum, one missing required field. Read the errors as the model will read them.
2. **Scripted contract tests** over the real transport: happy path, invalid argument, not found, permission, timeout (slow upstream), oversized output (assert the truncation marker), pagination walk at 0 / 1 / many items.
3. **Schema is the contract:** snapshot every tool's JSON Schema; a diff fails the build and must be declared compatible or breaking.
4. **Failure injection:** kill the upstream mid-call; assert the error is classified and no internal detail leaks.

Contract tests assert behavior, not implementation: they must pass against a stub server that satisfies the documented contract.

## Observability and Versioning

- One trace id per request, echoed in errors; propagate a client-supplied id when present.
- One structured log line per tool call: tool, duration, outcome, result bytes, argument digest. Log full arguments only when they contain no secrets and sampling allows.
- **Compatible:** new optional parameter or field, new tool, widened accepted range, clearer message.
- **Breaking:** renamed/removed tool or parameter, changed unit or default, changed error code for the same condition, changed ordering or pagination semantics. Ship a new tool name or `/v2` and keep the old one through a stated deprecation window.
- Advertise server version; clients cache capability lists, so announce changes rather than mutating silently.

## Delivery Checklist

- [ ] Necessity argued: no cheaper script or CLI would do the job
- [ ] Each tool has one intent; read-only and destructive tools separated
- [ ] Names verb-led and stable; no synonym collisions across tools
- [ ] Descriptions cover when to use, arg meaning/units, return shape, failure modes
- [ ] Schemas use enums, defaults, bounds, `additionalProperties: false`; no god object, no credential args
- [ ] Every list bounded; cursor pagination documented and terminated correctly
- [ ] Errors use the class table and carry `retryable`; no internal detail leaks
- [ ] Writes take an idempotency key; duplicate-call behavior is stated
- [ ] Deadlines on both sides; timeout returns partial progress
- [ ] Transport matches client count; stdout clean under stdio; auth validated server-side
- [ ] Path containment, argv exec, SSRF allowlist, and secret redaction each have a test
- [ ] Inspector pass plus scripted happy/invalid/timeout/oversized tests exist
- [ ] Schema snapshot gate runs in CI
- [ ] Trace id and one structured log line per call
- [ ] Versioning policy written; breaking changes have a migration path
