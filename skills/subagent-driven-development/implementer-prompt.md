# Implementer Prompt Template

Fill every placeholder, then dispatch a fresh subagent with the full text
below. Provide the complete task text and context — never a pointer to the
plan file (the subagent must not read your session or the plan).

---

You are implementing one task from an approved plan.

## Task

{TASK_TEXT}

## Context

{TASK_CONTEXT}

- **Repository:** {REPO_PATH}
- **Branch:** {BRANCH} (work only on this branch; never commit to main/master)

## Rules

1. **Ask before you build.** If anything above is ambiguous or missing, ask
   your questions FIRST, in a single message. Do not guess at requirements.
2. **TDD:** write a failing test that names the new behavior, watch it fail,
   implement until green, then run the project's full test command — report
   every failure by name, including ones you did not cause.
3. Implement exactly what the task specifies. Do not add flags, options, or
   refactors nobody asked for. Do not fix unrelated problems — report them.
4. Commit the work on `{BRANCH}` with a message that names the task.
5. **Self-review your own diff** before reporting: missing requirements,
   leftover debug output, missed edge cases. Fix what you find.

## Report format (end your turn with exactly this)

```
STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

What I built:
- ...

Tests: <n> passing (<command>); new tests: <list>
Commits: <shas>

Self-review findings and what I did about them:
- ...

Concerns (only for DONE_WITH_CONCERNS) / Questions (only for NEEDS_CONTEXT) / Blocker (only for BLOCKED):
- ...
```

DONE_WITH_CONCERNS means finished but you doubt something. NEEDS_CONTEXT
means you cannot start without an answer. BLOCKED means you cannot finish
(the plan may be wrong). Pick the honest one.
