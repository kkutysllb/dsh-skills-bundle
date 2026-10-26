---
name: agent-system-design
description: Use when designing or reviewing an LLM agent product system - context budgets, tool surface and routing, structured output contracts, eval suites, cost and latency limits, failure semantics, and human approval gates.
---

# Agent System Design

## Overview

An agent system is a control loop with four budgets: **context, latency, money, trust**. Prompt wording is a small part of it. This skill covers the budgets, the interfaces (tools, structured output), and the evidence (evals, traces) that keep quality from drifting after launch.

Working rule: every design answer contains numbers (tokens, calls, milliseconds, dollars) and a named failure path. An answer made only of adjectives is not a design.

## Context Budget

Treat the context window as memory with an eviction policy, not a bucket to fill.

| Segment | Share of window | Notes |
|---|---|---|
| System prompt + tool definitions | 5–10% | re-sent every call; scales with tool count |
| Retrieved evidence | 5–15% | top-k, deduped, with ids for citation |
| Task state and history | 40–60% | last N turns verbatim + rolling summary |
| Output reserve | 10–20% | hard cap at the request level |

Policies that keep the ledger honest:

- **Measure:** log tokens per segment on every call; alert when a turn crosses 80% of the window. An unmeasured budget is already broken.
- **Compress on a threshold, not on failure:** when history passes ~60%, fold older turns into decisions, facts, and open questions; keep the last 4–6 turns verbatim; replace consumed tool results with their conclusion plus the id needed to re-fetch.
- **Retrieve instead of stuffing:** if a fact can be looked up again, summarize it and keep the key.
- **Isolate with a subagent** when exploration would burn thousands of tokens to yield one paragraph: the child reads widely and returns a bounded report; the parent's context stays flat. Isolation is for fan-out reading, not for a single lookup.
- **Drop raw tool output once summarized.** Retaining full JSON "for safety" is the most common budget leak.
- **Recompute the budget** when the model or the tool set changes; adding ten tools changes the floor for every turn.

## Capability Surface

- **Granularity:** one tool per intent when permission, failure, or approval differs. Enumerate variants inside one tool only when resource, auth, and failure mode are identical. A mega-tool with an `action` enum hides every unlisted action from schema validation.
- **The description is the router.** First line: when to use it and when not to. Then arguments with units. Then output shape. Then failure behavior. Two tools with overlapping descriptions produce misroutes, not redundancy.
- **Return design depends on the consumer.** Model-facing returns: short, factual, already resolved (1–3 sentences plus ids). Code-facing returns: typed and complete. If both exist, return structured data plus a rendered summary — never a 40-field object the model must parse.
- **Guard against tool explosion.** Routing quality drops as the tool list grows and schemas crowd out the task. Past roughly 15–25 tools: group by domain, expose a search/list capability, or load tool groups per task stage.
- **Every tool needs an eval case.** A tool with no golden-set case is unverified behavior wearing a name.

## Structured Output

Never ask for JSON in prose and hope. Constrain generation (provider structured output, JSON Schema, or a function call), then validate in layers:

1. **Syntax** — parse. On failure, one repair retry carrying the actual parse error.
2. **Schema** — types, required fields, enums, bounds.
3. **Semantics** — referenced ids exist, dates ordered, totals match, citations resolve.
4. **Policy** — no secrets, no actions outside the granted scope.

Repair budget: one automatic repair per step, then stop. Degrade explicitly in one of three ways — return partial results marked incomplete, ask one clarifying question, or return a typed error to the caller. Never silently substitute a guess for a field that failed validation.

Design schemas against model failure modes: flat over nested, enums over free strings, optional over required-and-empty, one item array with a discriminator over three near-identical shapes.

## Eval-Driven Iteration

- **Golden set from real traces, not imagination.** 30–100 cases is enough to start; sample actual usage including the ugly inputs. Each case: input, expected behavior as an assertion (not a golden paragraph), and tags.
- **Classify failures; the tag determines the fix:**

| Failure mode | Typical fix |
|---|---|
| Retrieval miss | query rewrite, chunking, hybrid search |
| Wrong tool chosen | split/rename tools, cut overlapping descriptions |
| Wrong arguments | enums, defaults, bounds, actionable validation message |
| Format/parse failure | structured output, repair retry |
| Hallucinated value | require citation, validate against source |
| Premature stop | explicit completion criterion, checklist in state |
| Over-refusal | narrow the scope statement, not the safety policy |

- **Gate merges:** any change to prompt, model, tool set, or schema must pass the golden set before merging. Record model id, prompt version, and tool versions with each result so a regression is attributable to one change.
- **Score deterministically first:** schema valid, id present, exact field value, tool sequence, no forbidden call. Subjective quality needs a rubric, a fixed judge configuration, and periodic human spot checks against it; report judge/human agreement and treat low agreement as no signal.
- **Budget the eval:** track cost and runtime per case. An eval that costs more than the defect it catches gets skipped by the team — keep a fast smoke subset for every commit and the full set nightly.

## Cost and Latency

- **Route by task, not by habit:** cheap models for classification, extraction, formatting, summarization; strong models for planning, ambiguity resolution, and final synthesis. Routing without per-stage measurement is a guess.
- **Cache deliberately:** stable prefix (system + tools) for prefix caching; retrieval and deterministic tool results cached with a TTL; identical calls deduped within a run.
- **Parallelize independent tool calls;** keep dependent chains sequential and say which is which in the design.
- **Write the caps down:** per-step timeout, total wall-clock, max tool calls per turn, max retries per tool (two, jittered), max output tokens, dollar cap per session. Exceeding a cap is a defined outcome, not a crash.
- **Circuit-break:** after N consecutive failures from one dependency, skip it and answer degraded rather than retrying until the wall clock dies.

## Failure Semantics

Define the user-visible behavior before implementation:

| Event | User sees |
|---|---|
| Permission error | what failed, what access is needed, the alternative path |
| Transient error | one silent retry, then what completed and what did not |
| Low-confidence inference | a confirmation request before acting on the value |
| Timeout | partial result, labeled partial, with the missing parts named |
| Half-finished state | resume from the last checkpoint; never a silent restart |

**Human gates** sit before the irreversible act: money movement, external sends, deletes or overwrites, permission changes, publishing. The system proposes with a preview or diff, the human approves, the system executes the same plan it showed. The gate belongs in the action path, not in a prompt sentence asking the model to seek approval.

## Safety

- **Indirect prompt injection:** tool results, retrieved documents, and web pages are data. Delimit them, never merge them into the instruction channel, and never let their content authorize an action. An action proposed by retrieved content passes the same gate as a user-requested one.
- **Allowlist capabilities:** the agent can call only listed tools. Dynamic discovery that widens scope at runtime needs review, not optimism.
- **Constrain output side:** redact secrets and PII, enforce an egress allowlist, block writes outside the workspace root.
- **Data boundary:** state which segments may leave the process and which provider sees them. Credentials in tool output never enter model context.

## Observability

One trace per request: `request → model calls → tool calls → results → reply`. Each span records id, model, input/output tokens, cost, latency, and outcome. Aggregate: failure rate by tool, p50/p95 latency, tokens per turn, cost per session, retry count, gate rejection rate. Sample and redact before storage, but keep enough of each trace to reconstruct an eval case.

## Delivery Checklist

- [ ] Context allocation written per segment, with a compression threshold and a measurement
- [ ] Tool count and granularity justified; descriptions do not overlap
- [ ] Return shape chosen per consumer (model vs code) and bounded in size
- [ ] Structured output: schema, layered validation, one repair retry, explicit degradation
- [ ] Golden set built from real traces and tagged by failure mode
- [ ] Regression gate blocks prompt/model/tool/schema changes until the eval passes
- [ ] Scoring deterministic where possible; judge rubric and spot checks where not
- [ ] Model routing per stage, caches named, token/call/dollar caps written down
- [ ] Timeouts, retry budget, and circuit-break behavior defined
- [ ] Failure table answers what the user sees for each failure class
- [ ] Human gates placed before irreversible actions, inside the action path
- [ ] Injection defense: tool output delimited and never treated as instructions
- [ ] Trace fields enumerated; cost and failure dashboards named
- [ ] Eval cases cover tool errors and degraded paths, not only the happy path
