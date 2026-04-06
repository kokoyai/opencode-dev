# Check Agent强制验证机制

## TL;DR

> **Quick Summary**: 在任何agent要停止工作时，强制调用check agent验证目标是否达成。当前系统只在检测到问题时才验证，导致85页目标被标记为"完成"。
>
> **Deliverables**:
>
> - 创建"check" agent配置
> - 修改停止流程，强制调用check agent
> - check agent验证目标达成情况
> - 根据check agent返回决定是否继续工作
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO - sequential (core flow modification)
> **Critical Path**: Agent定义 → 流程修改 → 测试验证

---

## Context

### Original Request

用户需求：当任何agent（build、plan等）要停止时，**必须**先调用check agent验证，只有check agent确认目标达成才能真的停止。

例子：LaTeX项目目标是300页，但系统在85页就停止了，因为所有todos被标记为"completed"，但没有验证实际目标。

### Root Cause Analysis

**当前流程** (`src/session/prompt.ts:1418-1527`):

```typescript
if (lastAssistant?.finish && !["tool-calls"].includes(lastAssistant.finish)) {
  // 只在检测到问题时才调用plan agent
  if (verificationIssues.length > 0 && verifyAttempts < MAX_VERIFY_ATTEMPTS) {
    yield* invokePlanAgent(...)
    continue
  }
  break // 没有问题就直接退出
}
```

**问题**：

1. 只有检测到incomplete todos、无工作产出、LSP错误时才验证
2. **不检查目标是否达成**（如300页目标）
3. AI说"我完成了"，系统就信任并退出

**期望流程**：

```typescript
if (lastAssistant?.finish && !["tool-calls"].includes(lastAssistant.finish)) {
  // 强制调用check agent，无论是否有问题
  const checkResult = yield* invokeCheckAgent(...)

  if (checkResult === "CONTINUE") {
    // check agent说"还没完成"，继续工作
    continue
  }

  // check agent说"完成了"，退出
  break
}
```

### Current Verification Logic (to be replaced)

**位置**: `src/session/prompt.ts:1423-1527`

**当前检查**：

1. Incomplete todos（仅subagent sessions）
2. 是否有文件修改或工具调用
3. LSP错误

**缺失检查**：

1. 用户原始目标是什么
2. 目标是否达成（如300页）
3. 工作质量是否达标

---

## Work Objectives

### Core Objective

实现强制性目标验证机制：任何agent要停止时，必须经过check agent验证。

### Concrete Deliverables

1. **check agent配置** - `src/agent/agent.ts`
   - 名字: "check"
   - 权限: 只读（read, grep, glob等），不能修改文件
   - Prompt: 分析目标、验证达成情况
   - Mode: "subagent"

2. **强制验证流程** - `src/session/prompt.ts`
   - 在finish检测处插入check agent调用
   - 移除现有的"问题才验证"逻辑
   - 根据check agent返回决定是否继续

3. **check agent返回机制**
   - 返回格式: "CONTINUE: {reason}" 或 "DONE: {reason}"
   - 解析返回，决定流程

### Definition of Done

- [ ] check agent配置创建完成
- [ ] 停止流程修改：每次finish都调用check agent
- [ ] check agent能正确分析用户目标
- [ ] check agent能返回CONTINUE/DONE
- [ ] 流程根据check agent返回正确继续或退出
- [ ] 测试：85页目标不会被提前停止

### Must Have

- check agent必须能在任何agent停止时被调用
- check agent必须有足够上下文（用户目标、当前状态）
- check agent必须有决策权（返回CONTINUE或DONE）

### Must NOT Have (Guardrails)

- check agent不能修改任何文件
- check agent不能创建新的session（避免无限循环）
- check agent调用不能超过max_steps限制
- 不能影响tool-calls的正常流程

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (bun test)
- **Automated tests**: YES (TDD)
- **Framework**: bun test

### QA Policy

Every task includes agent-executed QA scenarios:

- **Backend/API**: Use Bash (curl) - call check agent API, validate response
- **Library/Module**: Use Bash (bun test) - run tests, check return values

---

## Execution Strategy

### Sequential Execution (Core Flow Modification)

**Why Sequential**: This modifies the core orchestration loop. Each step depends on the previous one.

```
Step 1: Create check agent configuration
  → Add to src/agent/agent.ts
  → Define permissions (read-only)
  → Define prompt template

Step 2: Implement check agent invocation
  → Modify src/session/prompt.ts
  → Replace "problem-based" verification with mandatory check
  → Parse check agent response

Step 3: Test with concrete scenarios
  → Unit test: check agent returns correct format
  → Integration test: 85/300 pages scenario
  → Edge case: check agent says DONE but todos incomplete

Step 4: Verify no infinite loops
  → Test: check agent itself stops correctly
  → Test: max_steps still enforced
  → Test: tool-calls flow not affected
```

---

## TODOs

- [x] 1. Create check agent configuration

  **What to do**:
  - Add "check" agent to `src/agent/agent.ts`
  - Permission: read-only (read, grep, glob, list, bash for read commands)
  - Mode: "subagent"
  - Prompt: Analyze user goal, verify completion, return CONTINUE or DONE

  **Must NOT do**:
  - Allow edit/write tools to check agent
  - Set mode to "primary" (must be subagent to prevent recursion)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration task, straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `src/agent/agent.ts:107-242` - Existing agent definitions pattern
  - `src/agent/agent.ts:165-192` - "explore" agent example (similar read-only pattern)

  **Acceptance Criteria**:
  - [ ] check agent defined in agents object
  - [ ] Permission allows: grep, glob, list, read, bash (read commands only)
  - [ ] Permission denies: edit, write, multiedit, apply_patch
  - [ ] Mode set to "subagent"
  - [ ] Description explains purpose: verify goal completion before stopping

  **QA Scenarios**:

  ```
  Scenario: Verify check agent has read-only permissions
    Tool: Bash
    Steps:
      1. Run: bun -e "import { Agent } from './src/agent/agent'; Agent.get('check').then(a => console.log(JSON.stringify(a.permission)))"
      2. Assert output contains "read": "allow"
      3. Assert output contains "edit": "deny"
    Expected Result: Permission list shows read tools allowed, write tools denied
    Evidence: .sisyphus/evidence/task-1-check-agent-permissions.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): add check agent for goal verification`
  - Files: `src/agent/agent.ts`

---

- [x] 2. Create check agent prompt template

  **What to do**:
  - Create `src/agent/prompt/check.txt`
  - Define prompt that instructs agent to:
    1. Read user's original goal from session
    2. Analyze current work output
    3. Check if goal is achieved
    4. Return "CONTINUE: {reason}" or "DONE: {reason}"

  **Must NOT do**:
  - Instruct agent to modify files
  - Create complex multi-step logic (keep it simple)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Text file creation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `src/agent/prompt/explore.txt` - Example prompt format
  - `src/agent/prompt/compaction.txt` - Another example

  **Acceptance Criteria**:
  - [ ] File created at `src/agent/prompt/check.txt`
  - [ ] Prompt instructs to analyze user goal
  - [ ] Prompt instructs to return CONTINUE or DONE with reason
  - [ ] Prompt warns not to modify files

  **QA Scenarios**:

  ```
  Scenario: Verify prompt file exists and has correct content
    Tool: Bash
    Steps:
      1. Run: cat src/agent/prompt/check.txt
      2. Assert output contains "CONTINUE"
      3. Assert output contains "DONE"
      4. Assert output contains "goal"
    Expected Result: Prompt file exists with required keywords
    Evidence: .sisyphus/evidence/task-2-check-prompt.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): add check agent prompt template`
  - Files: `src/agent/prompt/check.txt`

---

- [x] 3. Import check prompt and add to check agent

  **What to do**:
  - Import PROMPT_CHECK from "./prompt/check.txt" in `src/agent/agent.ts`
  - Add prompt field to check agent configuration

  **Must NOT do**:
  - Forget to import the prompt

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple import addition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `src/agent/agent.ts:13` - Example import pattern
  - `src/agent/agent.ts:187` - Example prompt field usage

  **Acceptance Criteria**:
  - [ ] PROMPT_CHECK imported
  - [ ] check agent has `prompt: PROMPT_CHECK` field

  **QA Scenarios**:

  ```
  Scenario: Verify check agent has prompt configured
    Tool: Bash
    Steps:
      1. Run: bun -e "import { Agent } from './src/agent/agent'; Agent.get('check').then(a => console.log(!!a.prompt))"
      2. Assert output is "true"
    Expected Result: check agent has prompt field
    Evidence: .sisyphus/evidence/task-3-check-agent-prompt.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): configure check agent with prompt`
  - Files: `src/agent/agent.ts`

---

- [x] 4. Implement mandatory check agent invocation in finish flow

  **What to do**:
  - Modify `src/session/prompt.ts` line 1418-1527
  - Replace existing "problem-based" verification with mandatory check agent call
  - New logic:
    1. When agent finishes (finish != "tool-calls")
    2. **Always** call check agent
    3. Parse check agent response
    4. If "CONTINUE": log reason and continue loop
    5. If "DONE": log reason and break loop

  **Must NOT do**:
  - Call check agent on tool-calls (only on actual finish)
  - Allow infinite check agent loops (enforce max check calls)
  - Remove max_steps enforcement

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core flow modification, requires careful implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `src/session/prompt.ts:1418-1527` - Current verification logic (to be replaced)
  - `src/session/prompt.ts:1436-1470` - Example of invoking plan agent (similar pattern)
  - `src/session/prompt.ts:1460-1469` - Subtask invocation pattern

  **Acceptance Criteria**:
  - [ ] Check agent called on every finish (finish != "tool-calls")
  - [ ] Check agent receives context: session goal, work output, changed files
  - [ ] Response parsed for "CONTINUE" or "DONE"
  - [ ] CONTINUE: loop continues, log reason
  - [ ] DONE: loop breaks, log reason
  - [ ] Max check calls enforced (prevent infinite loops)

  **QA Scenarios**:

  ```
  Scenario: Verify check agent is called when build agent finishes
    Tool: Bash
    Steps:
      1. Create test session with goal "create 3 files"
      2. Run build agent
      3. Wait for agent to finish
      4. Check logs for "check agent invoked"
      5. Check logs for "CONTINUE" or "DONE"
    Expected Result: Logs show check agent was called and decision was made
    Evidence: .sisyphus/evidence/task-4-check-invocation.txt

  Scenario: Verify CONTINUE response makes loop continue
    Tool: Bash
    Steps:
      1. Mock check agent to return "CONTINUE: goal not met"
      2. Run session
      3. Assert session continues after first finish
    Expected Result: Session does not exit on first finish
    Evidence: .sisyphus/evidence/task-4-continue-response.txt
  ```

  **Commit**: YES
  - Message: `feat(verification): implement mandatory check agent invocation`
  - Files: `src/session/prompt.ts`

---

- [x] 5. Add unit tests for check agent flow

  **What to do**:
  - Create test file `test/check-agent.test.ts`
  - Test cases:
    1. Check agent is invoked on finish
    2. Check agent returns CONTINUE when goal not met
    3. Check agent returns DONE when goal met
    4. Max check calls prevents infinite loops
    5. Tool-calls flow not affected

  **Must NOT do**:
  - Test implementation details (test behavior, not internals)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test file creation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:
  - `test/verification-mechanism.test.ts` - Example test file
  - `test/session.test.ts` - Example session tests

  **Acceptance Criteria**:
  - [ ] Test file created
  - [ ] All 5 test cases implemented
  - [ ] Tests pass: `bun test test/check-agent.test.ts`

  **QA Scenarios**:

  ```
  Scenario: Run check agent tests
    Tool: Bash
    Steps:
      1. Run: bun test test/check-agent.test.ts
      2. Assert all tests pass
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-5-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `test: add check agent flow tests`
  - Files: `test/check-agent.test.ts`

---

- [x] 6. Integration test: 85/300 pages scenario

  **What to do**:
  - Create integration test simulating the original issue
  - Setup: User goal is "create 300 page LaTeX document"
  - Execute: Build agent creates only 85 pages and tries to stop
  - Assert: Check agent prevents early stop, returns CONTINUE

  **Must NOT do**:
  - Actually create 300 pages in test (mock the page count)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test file creation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `test/integration/` - Integration test directory

  **Acceptance Criteria**:
  - [ ] Integration test created
  - [ ] Test simulates 85/300 pages scenario
  - [ ] Test asserts check agent returns CONTINUE
  - [ ] Test passes: `bun test test/integration/goal-verification.test.ts`

  **QA Scenarios**:

  ```
  Scenario: Run integration test
    Tool: Bash
    Steps:
      1. Run: bun test test/integration/goal-verification.test.ts
      2. Assert test passes
    Expected Result: Integration test passes
    Evidence: .sisyphus/evidence/task-6-integration-test.txt
  ```

  **Commit**: YES
  - Message: `test: add 85/300 pages integration test`
  - Files: `test/integration/goal-verification.test.ts`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
      Verify all tasks implemented as specified. Check deliverables exist.
      **Result: APPROVE** - All 6 tasks verified complete.

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `bun typecheck` + `bun test`. Review changes for code quality.
      **Result: APPROVE** - TypeCheck passes, 18 unit tests + 13 integration tests pass. Chinese comments fixed.

- [x] F3. **Real Manual QA** — `unspecified-high`
      Run actual test: create session with goal, verify check agent is called.
      **Result: APPROVE** - All verification tests pass.

- [x] F4. **Scope Fidelity Check** — `deep`
      Verify no scope creep. Only implemented what's in the plan.
      **Result: APPROVE** - Core deliverables match plan. Pre-existing workspace changes noted but not part of this work.

---

## Commit Strategy

- **Task 1**: `feat(agent): add check agent for goal verification`
- **Task 2**: `feat(agent): add check agent prompt template`
- **Task 3**: `feat(agent): configure check agent with prompt`
- **Task 4**: `feat(verification): implement mandatory check agent invocation`
- **Task 5**: `test: add check agent flow tests`
- **Task 6**: `test: add 85/300 pages integration test`

---

## Success Criteria

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

### Final Checklist

- [x] Check agent defined with read-only permissions
- [x] Check agent invoked on every agent finish
- [x] Check agent can return CONTINUE or DONE
- [x] Session continues when check agent says CONTINUE
- [x] Session stops when check agent says DONE
- [x] All tests pass
- [x] No infinite loops
- [x] Tool-calls flow unaffected
