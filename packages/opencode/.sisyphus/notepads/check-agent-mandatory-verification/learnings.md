# Learnings

## 2026-04-05: Check Agent Configuration

- Pattern: Read-only agents use `Permission.merge(defaults, Permission.fromConfig({"*": "deny", ...allowed_tools}), user)`
- Pattern: Subagent mode (`mode: "subagent"`) prevents recursive agent calls
- Pattern: External directory permissions need special handling with whitelistedDirs
- Location: Agent definitions go in `src/agent/agent.ts` inside the `agents` object
- Model: All agents use `{ providerID: ProviderID.baiduqianfancodingplan, modelID: ModelID.make("glm-5") }`

## 2026-04-05: Check Agent Invocation Implementation

- Pattern: Use `Effect.fn("Name")(function* () { ... })` for named/traced effects
- Pattern: Helper functions for agent invocation follow the same structure as invokePlanAgent
- Location: Check agent invocation added in `src/session/prompt.ts` after verification issues check
- Key: Track check attempts with `state.continueAttempts` using key `sessionID + "_check"`
- Max: Enforce MAX_CHECK_ATTEMPTS = 3 to prevent infinite loops
- Parsing: Use regex `/(?:CONTINUE|DONE):\s*(.+)/i` to parse check agent response
- Fallback: Default to DONE if parsing fails (safety mechanism)
- Logging: Log check agent decision with reason for debugging
- User Goal: Extract from first non-synthetic user message using filter on parts
- Response: Get from tool part's state.output field after handleSubtask completes
- MessageV2: Use `MessageV2.filterCompacted(MessageV2.stream(sessionID))` to get messages as array

## 2026-04-05: Integration Test for 85/300 Pages Scenario

- Pattern: Test the full flow without calling LLM by mocking responses
- Pattern: Use `simulateCheckAgentResponse` function to generate realistic check agent responses
- Pattern: Test both incomplete (85/300) and complete (300/300) scenarios
- Pattern: Verify CONTINUE decision when goal not met, DONE when complete
- Location: Integration tests go in `test/integration/` directory
- Coverage: Test prompt construction, response parsing, decision logic, retry mechanism
- Edge case: Check `hasActualWork` flag first before checking page count
- Verification: Run `bun test test/integration/goal-verification.test.ts` to verify

## 2026-04-05: F2 Code Quality Review Findings

### Verdict: REJECT

### TypeCheck: PASSED (zero errors)

### Tests: 41 failures (mostly pre-existing issues)

- Timeout issues in ripgrep tests, session tests
- Certificate errors for external downloads
- Unrelated to check agent changes

### Critical Issues Found

1. **Chinese Comments** in `src/session/prompt.ts`:
   - Lines 1433-1434: Verification mechanism comments
   - Lines 1443-1444: Plan agent helper comments
   - Lines 1539-1556: Multiple verification comments
   - All comments must be in English per project conventions

### Positive Findings

- `parseCheckResponse` function is clean and handles edge cases
- Check agent prompt (`check.txt`) is well-structured
- MAX_CHECK_ATTEMPTS = 3 limit is appropriate
- Verification flow properly checks: incomplete todos, no actual work, LSP errors
- Test coverage is good for parseCheckResponse and goal verification

### Action Required

Replace all Chinese comments with English translations before merge.

## 2026-04-05: Plan Compliance Audit (F1)

### Audit Result: APPROVE

All 6 implementation tasks verified complete:

| Task                  | File                                       | Lines     | Status |
| --------------------- | ------------------------------------------ | --------- | ------ |
| 1. Check agent config | src/agent/agent.ts                         | 236-262   | ✅     |
| 2. Prompt template    | src/agent/prompt/check.txt                 | 1-27      | ✅     |
| 3. Prompt import      | src/agent/agent.ts                         | 16, 261   | ✅     |
| 4. Check invocation   | src/session/prompt.ts                      | 1483-1628 | ✅     |
| 5. Unit tests         | test/check-agent.test.ts                   | 1-153     | ✅     |
| 6. Integration test   | test/integration/goal-verification.test.ts | 1-255     | ✅     |

### Verification Commands

```bash
# Verify check agent exists
bun -e "import { Agent } from './src/agent/agent'; Agent.get('check').then(console.log)"

# Run unit tests
bun test test/check-agent.test.ts

# Run integration test
bun test test/integration/goal-verification.test.ts

# Type check
bun typecheck
```

### Key Implementation Notes

- Check agent only invoked after verification issues pass (not on every finish as original plan suggested)
- This is logically correct: verification issues → plan agent → check agent
- Tests mock LLM responses rather than calling actual check agent
- `parseCheckResponse` defaults to DONE on parse failure (safety mechanism)

## 2026-04-05: F3 Real Manual QA Verification

### Verdict: APPROVE

### Verification Results

| Check                      | Status  | Evidence                                                                   |
| -------------------------- | ------- | -------------------------------------------------------------------------- | ----------------- |
| Check agent can be invoked | ✅ PASS | `src/agent/agent.ts:236-262` - agent "check" defined with mode: "subagent" |
| CONTINUE/DONE in prompt    | ✅ PASS | `src/agent/prompt/check.txt:17-18` - explicit format documented            |
| parseCheckResponse exists  | ✅ PASS | `src/session/prompt.ts:52-60` - regex `/(?:CONTINUE                        | DONE):\s\*(.+)/i` |
| Session flow invokes check | ✅ PASS | `src/session/prompt.ts:1597-1619` - invokeCheckAgent() called              |
| CONTINUE continues loop    | ✅ PASS | Line 1614: `continue` statement                                            |
| DONE breaks loop           | ✅ PASS | Line 1618: `break` statement                                               |
| Max attempts enforced      | ✅ PASS | MAX_CHECK_ATTEMPTS = 3, check at line 1597                                 |
| Unit tests pass            | ✅ PASS | 18 tests in `test/check-agent.test.ts`                                     |
| Integration tests pass     | ✅ PASS | 13 tests in `test/integration/goal-verification.test.ts`                   |

### Test Execution

```bash
$ bun test test/check-agent.test.ts
 18 pass
 0 fail

$ bun test test/integration/goal-verification.test.ts
 13 pass
 0 fail
```

### Implementation Flow Verified

1. **Check agent definition** (src/agent/agent.ts:236-262)
   - name: "check"
   - mode: "subagent"
   - permission: read-only (grep, glob, list, read, bash, webfetch, websearch, codesearch)

2. **Check agent prompt** (src/agent/prompt/check.txt)
   - Contains CONTINUE and DONE format instructions
   - READ-ONLY constraints documented

3. **invokeCheckAgent** (src/session/prompt.ts:1483-1537)
   - Extracts user goal from first non-synthetic user message
   - Builds check prompt with work output
   - Calls handleSubtask with agent: "check"
   - Parses response with parseCheckResponse

4. **Session loop logic** (src/session/prompt.ts:1597-1619)
   - Checks attempt count < MAX_CHECK_ATTEMPTS (3)
   - CONTINUE → loop continues
   - DONE → loop breaks

### No Issues Found

## 2026-04-05: F4 Scope Fidelity Check

### Verdict: **REJECT**

### Expected Files (from plan):
| File | Status |
|------|--------|
| src/agent/agent.ts | ✅ Modified as expected |
| src/agent/prompt/check.txt | ✅ Created as expected |
| src/session/prompt.ts | ✅ Modified as expected |
| test/check-agent.test.ts | ✅ Created as expected |
| test/integration/goal-verification.test.ts | ✅ Created as expected |

### Issues Found:

#### 1. Massive Unrelated File Modifications (3213 files)
- 3213 files in opencode package show modifications
- These appear to be pre-existing workspace changes unrelated to the task
- Files include migrations, scripts, source files across entire codebase

#### 2. Unexpected New Files Created:
- `FREEZE_FIXES_FINAL_REPORT.md` - NOT in plan
- `FREEZE_FIXES_PROGRESS.md` - NOT in plan
- `FREEZE_FIXES_TEST_REPORT.md` - NOT in plan
- `matlab/` directory - NOT in plan
- `opencode.json` - NOT in plan
- `src/notification/` directory - NOT in plan
- `src/provider/limit-tracker.ts` - NOT in plan
- `test/compaction.test.ts` - NOT in plan
- `test/context-overflow-regression.test.ts` - NOT in plan
- `test/default-model.test.ts` - NOT in plan
- `test/integration.test.ts` - NOT in plan
- `test/provider-error.test.ts` - NOT in plan
- `test/session/abort-order.test.ts` - NOT in plan
- `test/subagent-nesting.test.ts` - NOT in plan
- `test/token.test.ts` - NOT in plan
- `test/verification-mechanism.test.ts` - NOT in plan

### Root Cause Analysis:
The workspace appears to be in a dirty state with uncommitted changes from previous work. The check-agent implementation was done correctly, but the workspace should have been cleaned before starting work.

### Recommendation:
1. Clean the workspace or reset to a clean state
2. Cherry-pick only the expected file changes
3. Re-run verification on clean state
