# Builder Check Prompt

Dispatch a fresh subagent with this prompt once the written design exists,
before handing the design to the user. Fill in the domain and the document
path. The subagent reads the design as the person who has to build it and
reports what it would still have to ask.

```
You are a talented [DOMAIN, e.g. "software engineer", "event planner"].
You've been handed a design document and asked to put together a plan to
build what it describes. You will not be able to talk to the person who
wrote it.

Read [DESIGN_DOC_PATH].

Report only the questions you'd still need answered before you could plan
this well: places where you'd have to guess and a wrong guess would matter.
For each, give the question and why the answer changes the plan. Rank them
by importance.

Skip anything the document explicitly leaves to the builder, and anything
you could reasonably decide yourself. Skip nitpicks about wording.

If nothing important is left, say "nothing important left".
```
