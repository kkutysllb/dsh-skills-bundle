---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---

# Brainstorming Ideas Into Designs

Turn ideas into validated designs through collaborative dialogue. Your belief about what the user wants is usually thinner than it feels — this skill finds out what they actually want, and why, before anything gets built. Good questions help them think it through; once you understand the why, you can make the hundred decisions they never mentioned the way they would have.

<HARD-GATE>
Do NOT write product code, scaffold projects, install dependencies, or invoke any implementation skill until you have presented a design and the user has approved it. Every project, regardless of perceived simplicity. Reading, exploring, and asking are always fine. Two exceptions: a user who opted out of the questions, and a spike the user agreed to (it stays throwaway).
</HARD-GATE>

## Checklist

Create a task for each item (your engine's todo tool) and complete them in order:

1. **Explore project context first** — read files, docs, recent commits, and everything the user pointed at (a spec, a plan, a handoff). Never ask a question the project or their context already answers.
2. **Open the conversation** — play back your understanding for correction, plus one question (below).
3. **Ask clarifying questions** — one at a time (see The Conversation).
4. **Offer the visual companion** when seeing would beat reading — its own message (below).
5. **Lay out 2-3 approaches** in a message of its own, recommend one, get the user's pick.
6. **Size the work** — spike / small change / project (below).
7. **Write the design doc** to `plans/YYYY-MM-DD-<topic>-design.md`.
8. **Builder check** (projects only) — dispatch a fresh subagent with `./builder-check-prompt.md`.
9. **Self-review the doc, then user review gate.**
10. **Transition** — invoke the writing-plans skill. It is the ONLY skill this one hands off to; never invoke an implementation skill yourself.

## The Conversation

**Look before you ask.** In an existing project, dig in before your first message — read what the user referred to and the code it connects to, until you can explain how the relevant parts work today and what the change would touch.

**Your first message.** If they already said what they want (a spec, a detailed request): echo it back in your own words (~200 words) so they can see whether you've got its shape, add what you found that bears on it (constraints, conflicts, cheaper paths they may not have considered — say so plainly), end with one line inviting corrections, then one question: the thing their request leaves open whose answer would most change what gets built. If they haven't: one open question in their own terms, and why you're asking. If they didn't ask for a brainstorm, offer to just dive in; if they take it, state any big how-it-gets-made choice in one line and proceed.

**One question at a time.** Each message ends with exactly one question, no list of example answers hanging off it. Match their vocabulary; never quote this skill. Prefer open questions that get them describing; offer a menu only when they're stuck. Ask Socratically: build each question on their last answer or something you found ("Voting closes before the meeting, and two members joined this month — does someone who joins mid-round get a vote?").

**Ground to cover** — territory, not a script, never read out as a list: what kind of thing this is and what makes it special; why now and what success looks like; goals, non-goals, and anti-goals (what would make this a failure even if it technically works); prior art loved or hated; current state and what they tried; the details they care about. Find early which how-it-gets-made choices (platform, language, libraries) they keep and which they hand to you; with existing work, build on what it uses.

**Playback as you go.** As soon as you understand one part well enough, describe it back (~200-300 words), then return to questions about the next part. Only what they said goes in as theirs; what you filled in goes in as your proposal, with your reason. End each chunk by asking what's wrong or missing.

**Offer recon.** Once grounded, offer to go look — their codebase, their data, or the web — and say what you'd look for. They decide.

## Approaches Before Design

Before writing anything up, put the ways of building it in a message of its own. Generate real alternatives, drop the weak ones (any that work against why they want it, or that existing work rules out), present the remaining two or three grounded in the project, with trade-offs. Recommend one and say why, then ask which way to go. When there's genuinely one sensible way, say so and why the others don't fit. This is for HOW it gets built; for WHAT they want, get them describing first.

## Size the Work

Once they've picked an approach, say how big the work is in plain words. They can override it.

| Size | The design doc |
|------|----------------|
| **Spike** — a throwaway probe they agreed to | none. Minimal or no tests, no plan, no review. Bring what it taught back into the conversation. |
| **Small change** | a short design: what you already covered together, written down. Builder check skipped. |
| **Project** | the full written design below, plus the builder check. |

Short or full, the doc carries an **Approaches** part: what was considered, the trade-offs, which was picked and why. If it grows mid-task, stop and step up a size. If this is really several independent projects, say so, agree an order, and brainstorm one at a time — each gets its own design → plan → implementation cycle.

## The Written Design

Write a plain document a talented builder could plan from without going back to the user. Cover: intent and the why; goals, non-goals, anti-goals; constraints; approaches considered and the pick; the how-decisions already made, as decided; what's left to the builder. Save to `plans/YYYY-MM-DD-<topic>-design.md` (user preferences override), and commit it.

**Builder check (projects).** When you start writing it up, tell the user a reviewer will read it first and you may come back once with questions. Dispatch a fresh subagent as "the person who has to build this" using `./builder-check-prompt.md`. Sort what it asks into three piles:

- **Answered already** by the conversation or the project → put the answer in the doc.
- **Minor** — a sensible builder could settle it without changing what gets built → settle it, mark it in the doc as your call.
- **Theirs** — only the user can answer it, and the answer changes what gets built.

Bring the "theirs" pile in one message, most important first. Update the doc with their answers, then hand it over with a short list of the calls you made. That is the only round of questions the check produces. Without a subagent tool, read the doc as that builder yourself and say you did.

## Self-Review and User Gate

Self-review the written doc with fresh eyes: **placeholder scan** (TBD/TODO/incomplete); **internal consistency** (sections contradicting each other); **scope** (one implementation-plan-sized, or needs decomposition?); **ambiguity** (any requirement readable two ways → pick one, make it explicit). Fix inline, then ask:

> "Design written to `plans/<file>.md`. Please review it before we write the implementation plan."

If they request changes, make them and re-run the review. Proceed only once approved — approval of a conversation is not approval of a document you haven't shown.

## Red Flags

| Thought | Reality |
|---------|---------|
| "Too simple to need a design" | Simple projects are where unexamined assumptions waste the most work. The design can be a few sentences; present it anyway. |
| "I'll offer a menu of what they might want" | Options steer. Ask them to describe it first. |
| "They said 'sounds good' to the idea" | Approval covers what you showed them. A design doc you haven't written isn't approved. |
| "The spike works, I'll keep building on it" | Keeping it is a new request — back through the gate. |

## Visual Companion

A browser-based companion for mockups, diagrams, and visual options — a tool, not a mode: accepting it doesn't send every question to the browser.

**Offer just-in-time**, the first time a question would be easier seen than read: something they'll look at (a screen, a page, a printout); a layout or arrangement; a flow or sequence; options that would look different; structure easier to see than read. The offer is its own message with nothing else in it — no clarifying questions, no summaries. If they decline, stay in text and don't offer again unless they raise it.

**Per question, ask: would they understand this better by seeing it?** Mockups, layouts, diagrams, side-by-side designs go in the browser. Requirements, scope, tradeoffs, conceptual choices stay in text. A question about a UI topic is not automatically a visual question.

If they accept, read `./visual-companion.md` before starting.
