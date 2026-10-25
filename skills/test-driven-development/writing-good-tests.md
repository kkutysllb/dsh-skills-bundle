# Writing Good Tests

**Load this reference when:** writing or changing tests, adding mocks, or
adding cleanup/helper methods for tests. Each rule below leads with the GOOD
form; the traps it prevents are named beside it.

## Overview

A test exists to catch a specific break. Two principles govern everything
here:

```
1. Every test names the break it catches
2. Every test exercises the real thing
```

Strict TDD produces both naturally: a test written first and watched failing
against real code has already proven it can fail, and only earns a mock when
the real dependency proves slow or external.

## Rule 1: Name the break before you write the test

```typescript
// ✅ GOOD: the test exists because a specific bug would slip without it
test('rejects empty email', async () => {
  const result = await submitForm({ email: '' });
  expect(result.error).toBe('Email required');
});
```

Before writing the test body, answer: **what production change should make
this test fail — and is that change a bug or a decision?** A test earns its
place by catching a wrong branch, missing side effect, wrong argument,
boundary case, or broken contract. Cannot name one? Redesign the test around
an observable behavior, or delete it.

## Rule 2: Derive expected values independently

```typescript
// ✅ GOOD: hand-derived literal
expect(buildSearchQuery({ tag: 'urgent' })).toBe('tag:"urgent"');

// ❌ Mirror assertion: the same builder computes both sides — always true
const expected = buildSearchQuery({ tag: 'urgent' });
expect(buildSearchQuery({ tag: 'urgent' })).toBe(expected);
```

Use literals and hand-checked fixtures; table-driven tests with literal
`want` values are the preferred shape. An expectation computed by the code
under test — or its helpers — passes no matter what that code does.

## Rule 3: Test behavior, not text (the string-presence trap)

```typescript
// ✅ GOOD: run the artifact, assert its effects
const result = runLinter({ file: 'bad.ts' });
expect(result.exitCode).toBe(1);
expect(result.diagnostics).toContainEqual({ rule: 'no-unused-var', line: 3 });

// ❌ String presence: proves only that the source is the source
expect(await readFile('linter.config.json', 'utf8')).toContain('"no-unused-var"');
```

Grepping output or source for a substring counterfeits falsifiability. The
observable is behavior, never text: assert on the parsed result, exit code,
rendered state, or side effect. Documents that instruct agents are tested by
the consuming agent's behavior (see skill-authoring); prose for humans earns
no test at all.

## Rule 4: No change detectors

```typescript
// ✅ GOOD: tests the behavior that depends on the decision
test('a failing call is retried 5 times and the 6th attempt never happens', ...);

// ❌ Fires on redesign, sleeps through bugs
expect(MAX_RETRIES).toBe(5);
```

A constant assertion can fail and still protect nothing. If only intentional
decisions can fail a test — a constant's value, exact message wording,
private structure — it breaks whenever any implementation detail changes but
catches no real defect: a change detector, not a test. Test the behavior
that depends on the decision.

## Rule 5: The mock earns no assertions

```python
# ✅ GOOD: asserts the real outcome
def test_checkout_sends_receipt():
    mailer = FakeMailer()
    receipt = checkout(Cart([item]), mailer)
    assert mailer.sent == [receipt]
    assert receipt.total == item.price

# ❌ Asserts the mock, not the behavior — passes even if nothing was charged
def test_checkout_sends_receipt():
    mailer = Mock()
    checkout(Cart([item]), mailer)
    mailer.send.assert_called_once()
```

A mock assertion passes when the mock is present and fails when it is absent
— it says nothing about the component. Mocks belong at boundaries you own
(network, filesystem, clock); the assertions must land on the real outcome.
About to assert on the mock itself? Unmock it or delete the assertion.

## Rule 6: Mock at the right level, and mirror reality

Learn every side effect of the real method before replacing it; mock the
slow or external operation and keep what the test depends on real. When
unsure, run the test against the real implementation first and observe what
actually needs to happen.

```typescript
// ✅ GOOD: mock only the slow server startup; the config write stays real
vi.mock('MCPServerManager');

// ❌ The mock swallows the config write that duplicate detection reads
vi.mock('ToolCatalog', () => ({
  discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
}));
```

- **Make doubles specific:** when arguments, call counts, or ordering are
  part of the contract, assert them — a fake that accepts anything verifies
  nothing.
- **Mirror real data completely:** mock the complete structure, all
  documented fields — not just the ones your test reads. Partial mocks fail
  silently when downstream code reads an omitted field.
- **Understand the dependency's contract before faking it:** fake the
  contract, not your guess of it. An incomplete mock that never simulates
  its failure modes hides structural assumptions until production finds
  them.
- **Prefer real components over complex mocks:** when mock setup outgrows
  the test logic, switch to an integration test with real components.

**Production classes carry production methods only.** Cleanup that only
tests need (`is_test_mode`, `_set_internal_state_for_test`) lives in test
utilities or constructor-injected dependencies (clock, random source,
gateway), never on the production class.

## Trivial code and human prose earn no tests

Constructors, getters, constants, and trivial forwarding earn tests only when
they validate, normalize, default, derive, enforce, or cause side effects —
otherwise assert the first consumer-visible result that depends on them.
Your code's contract at its boundaries is what you test; upstream mechanics
are their maintainers' tests to write. And a test written to satisfy process
costs maintenance forever: ship the tests the behavior needs, and only
those.

## The Mutation Check

Before finishing, mentally mutate the production code; at least one test
should fail for each realistic mutation:

- Wrong constant or argument
- Wrong branch handler
- Missing state change or side effect
- Empty or default return
- Missing validation for zero, empty, nil, unauthorized, or malformed input

A mutation nothing catches marks the behavior as unprotected — or the test
as tautological.

## Warning Signs

- Setup and assertion share the same object, guaranteeing equality
- The test can fail only through a panic, crash, or missing selector
- The test fails on every intentional change, never on accidental breakage
- Expected values are hidden behind loops, builders, or helpers
- The test greps source text, or asserts a removed symbol stays removed
- An assertion checks a `*-mock` test ID, or fails if you remove the mock
- A method is called only from test files
- Mock setup is more than half the test, or you can't explain why the mock is needed
- Mocking "just to be safe"

## Quick Reference

| When you... | Do |
|-------------|-----|
| Write any test | Name the break it catches — a bug, not a decision |
| Build an expected value | Derive it by hand; never with the code under test |
| Test a script or document | Run it / pressure-test its consumer; never grep its text |
| Reach for a dependency test | Test your boundary contract, not their documented mechanics |
| Want to assert on a mocked element | Test the real component, or unmock it |
| Are about to mock a method | Learn its side effects; mock the slow/external level |
| Build a mock response | Mirror the real structure completely |
| Need cleanup only tests use | Put it in test utilities |
| Watch mock setup balloon | Switch to an integration test with real components |
| Finish a test file | Run the mutation check |
