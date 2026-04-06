# Check Agent Idle Timeout - User Input Timeout Handler

## TL;DR

> **Quick Summary**: 当agent向用户提问/让用户选择后，如果用户2分钟无输入，check agent自动介入继续工作。
>
> **Deliverables**:
>
> - 在session进入idle状态时启动2分钟计时器
> - 计时器到期后调用check agent
> - Check agent决定是继续工作还是等待用户
> - 用户输入时取消计时器
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO - sequential (core session flow modification)

---

## Context

### Original Request

用户需求：执行过程中，agent向用户提问或让用户选择后，如果用户2分钟无输入，check agent需要自动介入，而不是无限等待。

### Current Behavior

**位置**: `src/session/status.ts`

当agent停止等待用户输入时，session状态变为`idle`。目前没有超时处理机制。

### Expected Behavior

```
// When session becomes idle (waiting for user):
// 1. Start 2-minute timeout
// 2. If user provides input within 2 minutes: cancel timeout, continue
// 3. If timeout expires: invoke check agent
// 4. Check agent decides: continue work OR wait for user
```

---

## TODOs

- [x] 1. Create idle timeout manager in `src/session/idle-timeout.ts`
  - Methods: start(sessionID), cancel(sessionID)
  - 2-minute default timeout
  - Cancel on user input (via status event subscription)
  - Uses event subscription pattern to auto-start on idle
  - Publishes `session.idle_timeout` event when timeout fires

- [x] 2. Integrate with session status in `src/session/status.ts`
  - No direct dependency - uses Bus event subscription
  - SessionStatus.Event.Idle published when idle
  - IdleTimeout subscribes to idle events and starts timer
  - IdleTimeout subscribes to status events to cancel on busy

- [x] 3. Invoke check agent on timeout
  - Subscribed to `session.idle_timeout` event in prompt.ts
  - Injects synthetic user message to trigger continuation
  - Uses lastModel to get correct model context

- [x] 4. Add config option for timeout duration
  - Added `idle_timeout_minutes` to experimental config
  - Default: 2 minutes
  - Range: 0-60 minutes
  - 0 to disable

- [x] 5. Unit tests
  - Created `test/idle-timeout.test.ts`
  - 10 tests passing

- [x] 6. Integration test
  - All 41 tests passing (18 check-agent + 10 idle-timeout + 13 integration)

## Final Status

**All tasks completed!**

### Files Changed:

- `src/session/idle-timeout.ts` - New service
- `src/session/prompt.ts` - Added idle timeout handler
- `src/config/config.ts` - Added config option
- `test/idle-timeout.test.ts` - New tests

### Verification:

```bash
$ bun typecheck  ✅
$ bun test test/check-agent.test.ts test/idle-timeout.test.ts test/integration/goal-verification.test.ts
✅ 41 pass
```

---

## Final Verification Wave

- [ ] F1. Plan Compliance Audit
- [ ] F2. Code Quality Review
- [ ] F3. Real Manual QA
- [ ] F4. Scope Fidelity Check
