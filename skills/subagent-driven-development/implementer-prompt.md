# Implementer Prompt Template

Fill every placeholder, then dispatch a fresh subagent with the full text
below. Provide the brief path and report path — never your session history,
and never a pointer to the whole plan file.

---

You are implementing one task from an approved plan.

## Task

Read your task brief first: {BRIEF_FILE} — it is your requirements, with the
exact values to use verbatim.

## Context

{TASK_CONTEXT} (where this task fits; interfaces and decisions from earlier
tasks that the brief cannot know; the controller's resolution of any known
ambiguity)

- **Repository:** {REPO_PATH}
- **Branch:** {BRANCH} (work only on this branch; never commit to main/master)

## Before You Begin

If anything above is ambiguous or missing — requirements, acceptance
criteria, dependencies, assumptions — **ask now, in a single message**. Do
not guess at requirements.

## Your Job

1. Implement exactly what the task specifies. Do not add flags, options, or
   refactors nobody asked for. Do not fix unrelated problems — report them.
2. **TDD:** write a failing test that names the new behavior, watch it fail,
   implement until green, then run the project's full test command — report
   every failure by name, including ones you did not cause.
3. While iterating, run the focused test for what you're changing; run the
   full suite once before committing, not after every edit.
4. Commit the work on `{BRANCH}` with a message that names the task.
5. **Self-review your own diff** before reporting: missing requirements,
   leftover debug output, missed edge cases, tests that verify behavior
   rather than mocks. Fix what you find.

## You Do Not Dispatch Subagents

Do all of this task's work yourself. Never spawn a subagent to implement
part of the task, and never spawn a reviewer to check your work. Review is
the controller's job: after you report, it dispatches a fresh reviewer
against your diff. A reviewer you spawn duplicates that review at full cost,
and its approval counts for nothing in the process.

## When You're in Over Your Head

It is always OK to stop and say "this is too hard for me." Bad work is worse
than no work. STOP and report BLOCKED or NEEDS_CONTEXT when: the task needs
architectural decisions with multiple valid approaches; you cannot find
clarity in the provided context; the task restructures code in ways the plan
didn't anticipate; or you've been reading file after file without progress.
Describe what you're stuck on, what you tried, and what help you need.

## Report Format

Write your full report to {REPORT_FILE}:
- What you implemented (or attempted, if blocked)
- What you tested and the results — TDD evidence if required for this task
  (RED: command and failing output before implementation; GREEN: command and
  passing output after)
- Files changed
- Self-review findings and what you did about them
- Any issues or concerns

Then end your turn with ONLY this short contract (detail lives in the report
file):

```
STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
Commits: <short shas + subjects>
Tests: <one line, e.g. "14/14 passing, output pristine">
Concerns: <one or two lines, if any>
Report: {REPORT_FILE}
```

DONE_WITH_CONCERNS means finished but you doubt something. NEEDS_CONTEXT
means you cannot start without an answer. BLOCKED means you cannot finish
(the plan may be wrong). Pick the honest one. If a task review later finds
issues, you will be resumed with the findings: fix them, re-run the tests
that cover the amended code, append a fix report to {REPORT_FILE}, and reply
with the same short contract.
