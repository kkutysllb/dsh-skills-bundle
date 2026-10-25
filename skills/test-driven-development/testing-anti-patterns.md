# Testing Anti-Patterns

Companion reference for `test-driven-development`. Read when adding mocks or
test utilities. Each pattern below looks like a passing test but protects
nothing.

## 1. Testing mock behavior instead of real behavior

A test that asserts "the mock was called with X" verifies your mock setup, not
the production code. Mocks belong at boundaries you own (network, filesystem,
clock); the assertions must land on the real outcome.

```python
# BAD: asserts the mock, not the behavior
def test_checkout_sends_receipt():
    mailer = Mock()
    checkout(Cart([item]), mailer)
    mailer.send.assert_called_once()   # passes even if nothing was charged

# GOOD: asserts the observable outcome
def test_checkout_sends_receipt():
    mailer = FakeMailer()
    receipt = checkout(Cart([item]), mailer)
    assert mailer.sent == [receipt]
    assert receipt.total == item.price
```

## 2. Adding test-only methods to production classes

Production code should not grow methods that only tests call (`is_test_mode`,
`_set_internal_state_for_test`). They are dead weight in production and hide
what the test actually exercises. Drive state through the public API, or
inject dependencies (clock, random source, gateway) in the constructor.

## 3. Mocking without understanding dependencies

Reaching for a mock because "the real thing is inconvenient" without asking
what behavior the dependency guarantees produces tests that pass against a
fantasy version of the dependency. Read the dependency's contract first; fake
the contract, not your guess of it. An incomplete mock that never simulates
its failure modes hides structural assumptions until production finds them.

## 4. The string-presence trap

Grepping the output for a substring (`assert "error" in result`) counterfeits
falsifiability. The observable is behavior, never text: assert on the parsed
result, exit code, rendered state, or side effect.

## 5. The change-detector trap

A constant assertion can fail and still protect nothing: if the test breaks
whenever any implementation detail changes but catches no real defect, it is
a change detector, not a test. Name the production change that would make the
test fail. If you cannot name it, delete the test.

## Closing mutation check

Before finishing, mutate the production code in the way the test claims to
guard against. The test must fail. If it still passes, it was never testing
that behavior.
