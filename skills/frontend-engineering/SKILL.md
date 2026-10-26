---
name: frontend-engineering
description: Use this skill for cross-framework frontend integration work: state ownership, data fetching, forms, routing collaboration, and component composition. For React Server Components and Next.js App Router specifics, use react-nextjs.
---

# Frontend Engineering Skill

## Purpose

Build frontend behavior that is predictable, responsive, and aligned with the
existing component system.

## Workflow

1. Locate the current component ownership and data-fetching pattern.
2. Keep server/client boundaries explicit.
3. Put async state behind hooks or established query helpers.
4. Handle loading, empty, error, and stale states.
5. Add unit or interaction tests for important UI behavior.

## Review Checklist

- Components do not assume optional data is always present.
- Buttons and controls have stable disabled/loading states.
- No nested interactive elements such as button inside button.
- Query invalidation refreshes affected panels after mutations.
- Layout does not remount active agent/task panels unnecessarily.
