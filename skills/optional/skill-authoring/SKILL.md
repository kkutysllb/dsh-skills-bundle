---
name: skill-authoring
description: Use when creating a new agent skill, or reviewing or improving an existing one - covers when a skill is worth writing, SKILL.md structure and description discipline, size budgets, and how to test skill behavior
---

# Skill Authoring

## Overview

A **skill** is a reference guide for proven techniques, patterns, or tools that helps a future agent find and apply an effective approach. It is not a narrative about how you solved a problem once.

Writing a skill is Test-Driven Development applied to process documentation: you write test cases (pressure scenarios), watch them fail (baseline agent behavior without the skill), write the document, and watch them pass (agents comply). The core principle transfers unchanged:

**If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing.**

## When a Skill Is Worth Writing

This is a judgment call, not a mechanical rule. Weigh these signals:

**Write it when:**
- The technique wasn't intuitively obvious — you (or an agent) got it wrong before
- You'd reference it again across projects, and the pattern applies broadly
- The guidance encodes a *judgment call* — a decision agents keep making wrong under pressure

**Don't write it when:**
- It's a one-off solution or a project-specific convention (project conventions belong in project instructions)
- Standard practice is well-documented elsewhere
- **The constraint is mechanical.** If it can be enforced with a regex, a linter rule, a schema validation, or a script check — automate it instead of documenting it. Documentation for mechanical constraints spends tokens re-stating what a gate already guarantees, and agents learn to ignore rules nothing enforces. Save documentation for the cases where judgment is the only enforcement there is.

Litmus test: *what does the agent need to be told that it would not reliably do on its own?* If the honest answer is "nothing," there is no skill.

## SKILL.md Structure

```
skills/<skill-name>/
  SKILL.md              # Main reference (required)
  references/…          # Only if needed
```

Frontmatter carries exactly two fields:

```yaml
---
name: skill-name-with-hyphens
description: Use when <triggering conditions and symptoms>
---
```

- `name`: letters, numbers, hyphens.
- `description`: third person, **when to use only** — triggering conditions and symptoms. Never summarize the workflow.

### The description-overrides-body lesson

A description that summarizes the process creates a shortcut agents take instead of reading the skill. A real test found it: a description saying "code review between tasks" caused agents to do ONE review even though the skill's flowchart mandated TWO. When the description was cut back to "Use when executing implementation plans with independent tasks", agents read the body and followed the full process.

**The description is the most-read paragraph you will write — an agent that follows it never opens the file.** Keep it a pure trigger: "Use when…", specific symptoms, no process detail.

## Size Discipline

**Keep SKILL.md under ~20KB.** Every skill is loaded whole into a context when triggered; a bloated skill taxes every session that touches it, and the parts past the budget are where agents stop reading.

- Keep inline: principles, decision rules, one excellent example, quick-reference tables.
- Split into `references/`: deep material read per-step, not per-load — long worked examples, per-role prompt templates, exhaustive catalogs, troubleshooting trees. The body links them at the step that needs them ("read references/fix-loop.md before every round"), so the reading is on-demand.
- Split into files only what is genuinely load-bearing; a references/ directory nobody is directed to at the right moment is dead weight with better branding.

## Match the Form to the Failure

Before writing guidance, classify how agents fail without the skill. The form that fixes one failure type measurably backfires on another:

| Baseline failure | Right form | Wrong form |
|---|---|---|
| Skips a rule under pressure | Prohibition + rationalization table + red-flags list | Soft guidance ("prefer…", "consider…") |
| Output has the wrong shape | Positive recipe: state what the output IS — its parts, in order | Prohibition list ("don't restate", "never narrate") |
| Omits a required element | Structural slot in the template they already fill in | Prose reminders near the template |
| Behavior should depend on a condition | Conditional keyed to an observable predicate | Unconditional rule + exemption clauses |

Why prohibitions backfire on shaping problems: under a competing incentive, agents negotiate with "don't X". A recipe leaves nothing to negotiate — the output matches the stated shape or it doesn't. And **no nuance clauses**: "don't X unless it matters" reopens the negotiation; express a real exception as its own conditional.

### No performative instructions

Every sentence must change what the agent does. Cut instructions that exist to look rigorous:

- Ritual demands with no observable product ("think carefully about X", "deeply consider Y") — if the thinking can't fail visibly, don't order it.
- Redundant re-states of what the surrounding structure already enforces.
- Enthusiasm and justification padding — the *why* earns one line; the *what* and *when* earn the space.
- Mandatory announcements nobody consumes.

The test: delete the sentence and ask what behavior changes. If nothing does, it was decoration — decoration trains agents to skim.

## Bulletproofing Discipline Skills

Skills that enforce discipline (like TDD) must resist rationalization — agents find loopholes under pressure.

- **Close every loophole explicitly.** Not "write code before test? delete it" but "delete it. Start over. No exceptions: don't keep it as reference, don't adapt it while writing tests, don't look at it."
- **Address spirit-vs-letter early:** "Violating the letter of the rules is violating the spirit of the rules" cuts off an entire class of rationalization.
- **Build the rationalization table** from observed failures, not imagined ones: | Excuse | Reality |.
- **Keep a red-flags list** so agents can self-check: "All of these mean: start over."

## Testing Skill Behavior

No skill without a failing test first — for new skills AND edits.

**RED — baseline:** run a pressure scenario with a subagent WITHOUT the skill. Document what it did and the exact rationalizations it used, verbatim. If the no-skill agent doesn't fail, there is nothing to fix — don't author the skill.

**GREEN — minimal skill:** write the skill addressing those specific failures. Re-run the same scenarios; agents should now comply.

**REFACTOR — close loopholes:** a new rationalization appears → add its explicit counter → re-test.

**Micro-test wording before full scenarios:** full pressure runs are slow. Verify wording cheaply first — one fresh-context sample per call with the realistic system prompt, always include a no-guidance control, 5+ reps per variant (single samples lie), and manually read every flagged match. Variance is a metric: five interpretations across five reps means the wording isn't binding.

**Match the test to the skill type:**
- Discipline skills (TDD-like): pressure scenarios — time, sunk cost, exhaustion combined
- Technique skills: can the agent apply it to a new scenario? Missing-info probes for gaps?
- Pattern skills: recognition scenarios — when does it apply, when NOT?
- Reference skills: retrieval — can the agent find and correctly use the right section?

## Anti-Patterns

- ❌ **Narrative example** — "In session 2025-10-03, we found…" is too specific to reuse
- ❌ **Multi-language dilution** — the same example in five languages is five mediocre examples
- ❌ **Code in flowcharts** — graphs carry decisions; code belongs in code blocks
- ❌ **Generic labels** — helper1, step2, pattern3; labels carry meaning
- ❌ **Description as summary** — the shortcut trap above
- ❌ **Batch authoring** — writing several skills without testing each; deploying untested skills is deploying untested code

## Creation Checklist

**RED:**
- [ ] Pressure scenarios written (3+ combined pressures for discipline skills)
- [ ] Ran WITHOUT the skill; baseline failures documented verbatim
- [ ] No baseline failure? Stopped — no skill needed

**GREEN:**
- [ ] Frontmatter `name` + `description`; description is a pure trigger
- [ ] Overview with core principle; addresses the observed baseline failures
- [ ] Guidance form matches failure type; no performative sentences
- [ ] One excellent example; <20KB; deep material in references/ with per-step pointers

**REFACTOR:**
- [ ] New rationalizations from testing added as explicit counters
- [ ] Rationalization table + red flags built from all iterations
- [ ] Re-tested until compliance holds under pressure
