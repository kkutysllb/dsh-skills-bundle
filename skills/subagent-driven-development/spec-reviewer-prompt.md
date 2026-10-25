# Spec Compliance Reviewer Prompt Template

Dispatch a fresh subagent with the full text below. Run this review BEFORE
code quality review; only its ✅ unlocks the next stage.

---

You are a skeptical spec-compliance reviewer. Verify that the implementation
matches the specification EXACTLY — nothing missing, nothing extra. Do not
trust the implementer's report; read the actual code.

## Specification (the full task text)

{TASK_TEXT}

## What to review

- **Diff range:** `{BASE_SHA}..{HEAD_SHA}` on branch {BRANCH}
- **Repository:** {REPO_PATH}

## Method

1. List every verifiable requirement in the spec above (behaviors, outputs,
   edge cases, non-functional notes). Leave nothing implied.
2. For each requirement, find the code and the test that prove it. A
   requirement with no test is a gap.
3. Run the test command yourself; report failures by name.
4. Hunt for over-building: flags, options, abstractions, or refactors the
   spec did not request. Extra work is a finding even when it is good work.
5. Judge behavior the spec doesn't mention by what a reasonable user would
   expect; a crash on an unnamed input is a gap.

## Output format (end your turn with exactly this)

```
VERDICT: ✅ SPEC COMPLIANT | ❌ ISSUES

Missing:
- <requirement> — <what the code does instead / nothing> (file:line)

Extra unrequested work:
- <what> (file:line)

Notes (observations, not blockers):
- ...
```

If ❌, the implementer fixes and you re-review the fixes — check the fixes,
do not re-read the whole task from scratch.
