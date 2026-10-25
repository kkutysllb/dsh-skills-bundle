# Final Review and Finish

Part of subagent-driven-development. Every task in the plan is complete.

## The whole-branch review

Write the branch diff to a file: commit list, `git diff --stat`, and
`git diff -U10` from `git merge-base <base-branch> HEAD` to HEAD, redirected
into the workspace as `final-diff.md` (MERGE_BASE = the commit the branch
started from — never `HEAD~1`, which silently truncates a multi-commit
branch). Dispatch the final reviewer with the file path plus the ledger's
deferred-minor and parked lines, so it can triage which must be fixed before
merge. Dispatch on the most capable available model (see SKILL.md's Model
Selection), using requesting-code-review's template
([../../requesting-code-review/code-reviewer.md](../../requesting-code-review/code-reviewer.md)).

## The single fix wave

If the final review returns findings, dispatch ONE fix subagent with the
complete findings list — not one fixer per finding. Per-finding fixers each
rebuild context and re-run suites. Then run exactly one scoped re-review of
the fix wave (write the fix-range diff to a file and use
[re-review-prompt.md](../re-review-prompt.md)). Adjudicate any residual
findings as in the fix loop's breaker (references/fix-loop.md): park with
rulings, or rule on the load-bearing ones and ledger what you decided. Only
the four things that stop a running plan (top of SKILL.md) stop you here.
There is no second fix wave — residual load-bearing findings surface to your
human partner when finishing-a-development-branch presents the options.

## Finish

Before you delete anything, collect every ledger line containing `Ruling:` —
preflight rulings, parked findings, breaker adjudications, all of them — into
your final message under "Rulings I made", in the order you made them, each
with what it costs if wrong. The list is exhaustive: if the ledger holds a
ruling, the list holds it. That list is the only place the decisions you took
on your human partner's behalf reach them — they read it and rework whatever
you got wrong. A ruling that dies with the workspace was a decision made in
secret.

When the final review is clean and its fixes are merged, delete this plan's
workspace (`rm -rf <repo-root>/.agent/sdd/<plan-basename>/`) — the git
history is the record now. Sibling directories belong to other plans; leave
them alone.

Use finishing-a-development-branch.
