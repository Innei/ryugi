# Writing Good Tests

A test exists to catch a specific break. Before writing its body, name the
production change that would make it fail. If you cannot name one, or the
only changes that fail it are deliberate decisions, do not write it.

## Expectations come from outside the code

Use literals and hand-checked fixtures; table-driven tests with literal
`want` values are the preferred shape. An expected value computed by the
code under test or its helpers passes whatever that code does:

```typescript
// ❌ The same builder computes both sides
expect(buildSearchQuery({ tag: 'urgent' })).toBe(buildSearchQuery({ tag: 'urgent' }));

// ✅ Hand-derived literal
expect(buildSearchQuery({ tag: 'urgent' })).toBe('tag:"urgent"');
```

## Test behavior, at your boundary

- **No change detectors.** A test that only a decision can fail — a
  constant's value, exact wording, private structure — fires on redesign
  and sleeps through bugs. Test the behavior that depends on the decision:
  not `expect(MAX_RETRIES).toBe(5)` but "a failing call is retried 5 times
  and the 6th attempt never happens."
- **Run artifacts, don't read them.** A test that greps a script, skill or
  config for a line, or asserts a removed symbol stays removed, proves only
  that the source is the source. Run it against controlled inputs and
  assert outputs, side effects or exit codes. Documents that instruct
  agents are tested by the consuming agent's behavior; prose for humans
  gets no test.
- **Your code, not the framework.** Test the contract your code makes: the
  route you register, the query you emit, the payload you produce — not
  that the router calls a registered handler. Constructors, getters,
  constants and plain forwarding earn tests only when they validate,
  normalize, default, derive or cause side effects. When upstream behavior
  surprised you, write one narrow characterization test naming the
  assumption.

## Mocks and doubles

- **Never assert on the mock.** An assertion that fails when the mock is
  removed tests the mock. Assert the real component's behavior, or unmock.
- **Mock below the side effects the test depends on.** Learn what the real
  method does before replacing it; mock the slow or external operation and
  keep the rest real:

  ```typescript
  // ❌ The mock swallows the config write that duplicate detection reads
  vi.mock('ToolCatalog', () => ({ discoverAndCacheTools: vi.fn().mockResolvedValue(undefined) }));

  // ✅ Mock only the slow server startup; the config write stays real
  vi.mock('MCPServerManager');
  ```

- **Specific doubles.** When arguments, call counts or ordering are the
  contract, assert them. Give success, error and malformed branches their
  own fixtures so the wrong branch cannot satisfy the expectation.
- **Complete mock data.** Mirror the real structure with all its documented
  fields, not only the ones the test reads; a partial mock passes while
  downstream code that reads an omitted field breaks.
- **Real components when mocks balloon.** When mock setup outweighs the
  test, switch to an integration test with real components.
- **Test-only code stays in test utilities.** A cleanup method only tests
  call does not belong on the production class.

## The mutation check

Before finishing, mutate the production code in your head; for each
realistic mutation at least one test fails:

- Wrong constant or argument
- Wrong branch handler
- Missing state change or side effect
- Empty or default return
- Missing validation for zero, empty, nil, unauthorized or malformed input

A mutation nothing catches marks behavior that is unprotected, or a test
that is tautological.
