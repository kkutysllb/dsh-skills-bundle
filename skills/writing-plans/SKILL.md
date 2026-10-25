---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write implementation plans for an engineer who has not seen this codebase or this spec. Assume they write idiomatic code in the project's language once they know the exact interface and the exact test, and that they will make a reasonable choice wherever the plan leaves one open. What they cannot know is what YOU decided: which files, which names and signatures, which values from the spec, which tests prove each task. Document those. A plan records decisions, not code.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility. Files that change together should live together; split by responsibility, not by technical layer.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- In existing codebases, follow established patterns. If a file you're modifying has grown unwieldy, including a split in the plan is reasonable; don't unilaterally restructure otherwise.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate. Fold setup, configuration, scaffolding, and docs into the task whose deliverable needs them; split only where a reviewer could meaningfully reject one task while approving its neighbor. Each task ends with an independently testable deliverable.

## Step Granularity

**Each step is one action with one checkable result:**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Spec:** [path to the design doc this plan implements — the plan argues
from the spec, so the spec travels with it; executors read both]

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task implicitly includes
this section.]

## Review Focus

[Input classes or failure modes the spec implies but no task's tests
exercise, most likely to bite a person using this software — one line
each, naming the input and the behavior a reasonable person would expect.
The spec's silence on an input is not permission for it to break the
program. Each line here gets a test added to the task that owns the code.]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact names, parameter and return
  types. An implementer sees only their own task; this block is how they
  learn the names neighboring tasks use.]

- [ ] **Step 1: Write the failing test** — the test's name and assertions, as code, with the spec's exact values:

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_specific_behavior -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Implement `function(input: InputType) -> ResultType` in `exact/path/to/file.py`**

The implementer writes the body. One line on approach only when signature
and test leave a real choice; a code block only for an algorithm they do
not determine.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_specific_behavior -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## What a Step Contains

A step is done when the implementer can write exactly one reasonable thing from it. That is the whole requirement: **unambiguous, not complete.** Each kind of step carries what makes it unambiguous and nothing more:

- **A test step:** the test's name and its assertions, as code, with the spec's exact values in them.
- **A code step:** the exact signature (name, parameters, return type), the file it lives in, and the values the spec pins. The implementer writes the body. A body appears only for an algorithm the signature and tests do not determine.
- **A verification step:** the command to run and the output that means it passed.
- **A reference to another task:** that task's Interfaces block says what to use; the plan does not repeat its code.

A plan is the set of decisions the implementer cannot make alone. These are plan failures — never write them: "TBD", "implement later"; "add appropriate error handling" / "handle edge cases"; "write tests for the above" (without the test); "similar to Task N" (an implementer may read tasks out of order); a type, function, or value no task defines. A plan longer than the code it describes has written the code instead.

## Self-Review

After writing the complete plan, check it against the spec with fresh eyes. Run this checklist yourself — not a subagent dispatch.

**1. Spec coverage:** every section/requirement in the spec maps to a task? List gaps; add tasks.

**2. Step scan:** every step lets the implementer write exactly one reasonable thing — a line that decides nothing is a gap; a function body the signature and tests already determine is a transcript. Fix both.

**3. Type consistency:** signatures and names in later tasks match earlier ones? `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. Review Focus:** each input class the spec implies has a test in the task that owns the code? An empty section means you checked and found none, not that you skipped the check.

**5. Proportion:** compare the plan's length to the spec's. A plan several times longer than the spec is a transcript of the program, not a plan. If code blocks dominate, replace bodies with signatures and test names, then re-check each step is still unambiguous.

Fix issues inline. No need to re-review — fix and move on.

## Execution Handoff

After saving and self-reviewing, link the plan for the user to read and offer the two execution routes with the cost trade-off:

- **Subagent-driven** (the subagent-driven-development skill) — a fresh subagent implements each task and a fresh reviewer checks it before the next starts, then one whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Inline** (the executing-plans skill) — you implement every task in this session, then one fresh-context review of the whole branch at the end. Cheapest and fastest; no independent review until the end. Runs well because the plan carries the design.

**Recommend one in one sentence from the plan itself:** how much tasks depend on each other's interfaces, how many there are, what a shipped mistake would cost. Then ask which approach to use, and wait for the answer before implementation.
