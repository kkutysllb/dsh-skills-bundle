---
name: executing-plans
description: Use when executing a written implementation plan end to end on a multi-step task, with a progress ledger and a final review
---

# Executing Plans

## Overview

Execute the whole plan yourself, task by task, in this session — no implementer subagent per task, no reviewer per task. One fresh-context review of the whole branch at the end. **Do not pause between tasks to check in**: run the entire plan, then report once.

**Why inline (the two-route trade-off):** subagent-driven development pays a fresh implementer and a fresh reviewer on every task, each re-reading the codebase from zero — it buys a review gate on every task. Inline execution pays one context (yours) plus one reviewer at the end — it buys speed and cost. What it gives up is a fresh context per task and a second pair of eyes per task; this skill recovers both by other means: the spec is the brief, the ledger is your memory, TDD is the per-task gate, and the final reviewer is the second pair of eyes. Prefer the subagent-driven-development skill instead when the user wants a review gate on every task, or the plan is long enough that its later tasks would run on a compacted context (the ledger keeps inline recoverable even then — but the last tasks get the least of you).

**Core principle:** the plan already did the thinking. Execute it exactly, prove each step with a test you watched fail and then pass, and leave a record that survives your own forgetting.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

## Setup

1. **Isolation.** Never start implementation on a main/master branch without the user's explicit consent. Create or verify an isolated branch or worktree (the using-git-worktrees skill, if available).
2. **Read the plan once**, and the design doc it names in its Spec line. The spec is the binding authority; the plan is its argument; conflicts inside the plan resolve against the spec. A plan with no reachable spec gets a ledger note saying so — rulings made without one are provisional.
3. **Ledger.** Create `plans/YYYY-MM-DD-<slug>-progress.md` next to the plan (same slug), first line: `# Progress ledger — plan: <plan file path>`. Context does not survive compaction; an executor that loses its place re-implements work whose commits already exist. If a ledger naming your plan already exists, tasks with a `Task N: complete` line are DONE — do not redo them; resume at the first task without one, trusting the ledger and `git log` over your recollection. A ledger naming a different plan belongs to that plan: leave it alone.
4. **Todos.** Create one todo per task with your engine's todo tool — that is the live view; the ledger is the record.
5. **TDD.** Load the test-driven-development skill before Task 1. It governs every step below; a plan whose steps already say "write the failing test first" does not exempt you.
6. **Pre-flight scan.** For every task that consumes what an earlier task produces, one ledger row: the two tasks, what one produces versus what the other consumes, what you found. Tasks sharing nothing get no row. Rule on each conflict now, with the spec as authority, and record the ruling beside its row.

## The Task Loop

For each task:

1. **Take it.** Mark the todo in_progress and re-read that task's steps in the plan — exact values, signatures, and test cases, not your memory of them (memory keeps summaries; the plan has the real ones).
2. **Work the steps in order under TDD.** A test step's code is written and run first. Watching it fail is a step, not a formality — a test that passes before the implementation exists is a finding about the test.
3. **Compare every `Expected:`.** Run each verification command, read the output, compare. **Matches** → next step. **The code is wrong** → debug to the cause; never patch the symptom to make the output match. **The plan is wrong** (a step contradicts the spec, an interface doesn't match what an earlier task produced, a command that cannot work) → rule on the smallest change that satisfies the spec, ledger it as `Task N: Ruling: <finding> — <what you decided and why>`, and continue. Later tasks touching the same interface read the ruling from the ledger, not from your memory.
4. **Commit as the plan's commit steps say.**
5. **Completion contract** — before the ledger line, all true with evidence from this session, not inferred from a diff looking right: every test the task names exists, ran, and you read the output; the final test run passed; every `Expected:` line was compared against real output; every deviation has a `Ruling:` line. If any item is missing, the task is not complete. (The verification-before-completion skill governs the claim.)
6. **Record.** Append `Task N: complete (commits <range>, tests: <command> → <result>)` to the ledger — in the same message as the commit, never as its own errand; compaction does not wait for a convenient moment. Mark the todo complete and take the next task.

## Rulings, Not Stalls

Conflicts, ambiguities, plan defects — decide them. The spec is binding, the plan is its argument, and your judgment settles what neither answers. Deviating without a ledgered ruling is a decision made in secret.

**Stop and ask (never guess) only for these:** an irreversible or destructive operation; a security-sensitive action; a side effect outside this branch that norms say to ask about first (a merge, a push to a shared branch, a publish); a plan so broken that every path forward is a guess; a blocker you cannot resolve (missing dependency, the same verification failing repeatedly, an instruction you cannot interpret). Stopping is not failure — forcing through a blocker is.

## Final Review

After the last task's ledger line — never between tasks:

- Assemble a review package: the merge-base diff of the branch, the plan, the spec, the plan's Review Focus section verbatim, and pointers to the ledger's `Ruling:` lines so the reviewer can weigh your calls.
- **With a subagent tool:** dispatch a fresh subagent as reviewer (your most capable option) on the package. Same author, same blind spots — this is the one fresh context the whole run buys. Do not skip it or replace it with your own read of the diff.
- **Without a subagent tool:** perform the review yourself as a separate pass after the last task, write `Final review: self-review (no subagent tool)` to the ledger, and disclose it in your final message — a self-review by the author is weaker, and the user decides whether that is enough.

Then sort findings before acting on any. Re-grade first by effect: a finding's grade is what a reasonable person using this software gets if it ships, not whether the spec names the input that triggers it.

- **Critical and Important** enter ONE fix pass: each fix is verified TDD-style — write the test that reproduces the finding, watch it fail, make it pass, run the whole suite — recorded as `Final: fixed <finding> — <test> RED→GREEN, suite N/N`. No second reviewer; the covering tests and green suite answer "addressed" and "broke nothing".
- **Minor** goes to the ledger as `Final: minor (deferred): <one-liner>` and to the final message under "Deferred minors". Minors never enter the fix pass.
- A finding you decide not to fix is a ruling: `Final: Ruling: <finding> — <why the code stands> — <cost if wrong>`. There is no second fix pass.

## Finish

Your final message is the only place decisions taken on the user's behalf reach them. Include: every `Ruling:` line under "Rulings I made" (with what each costs if wrong), every deferred minor under "Deferred minors", and the self-review disclosure if there was one. Then use the finishing-a-development-branch skill to complete the work.

## Remember

- Review the plan critically first; read the spec with it
- Follow plan steps exactly; never skip a verification or an `Expected:` comparison
- Keep the ledger current — one line per task, alongside the commit
- Stop when blocked, don't guess; ledger every ruling
- One final review at the end, not progress reports along the way
