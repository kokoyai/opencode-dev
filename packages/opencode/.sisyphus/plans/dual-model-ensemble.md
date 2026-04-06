# Dual-Model Ensemble (glm-5 + kimi-k2.5)

## TL;DR

> **Quick Summary**: Implement parallel dual-model invocation where glm-5 and kimi-k2.5 respond simultaneously, with kimi-k2.5 acting as judge to synthesize results.
>
> **Deliverables**:
>
> - Parallel LLM stream invocation for two models
> - Judge synthesis logic (kimi-k2.5 as judge)
> - Tool call merging and deduplication
> - UI display for dual responses + synthesized result
>
> **Estimated Effort**: High
> **Parallel Execution**: Partial
> **Critical Path**: LLM stream modification → Judge synthesis → UI display

---

## Context

### Original Request

User wants opencode to call both glm-5 and kimi-k2.5 in parallel by default, then synthesize results for better answer quality.

### Key Requirements

1. **Dual Model Invocation**: Both models respond to same prompt simultaneously
2. **Provider Scope**: Only enabled for baiduqianfancodingplan provider
3. **Judge Strategy**: kimi-k2.5 acts as judge to synthesize both responses
4. **Tool Calls**: Merge and deduplicate tool calls from both models
5. **UI Display**: Show original responses from both models, then show synthesized result

### Technical Context

- `LLM.stream()` in `src/session/llm.ts:79-334` - core streaming function
- `SessionProcessor.handleEvent()` in `src/session/processor.ts:107-361` - handles stream events
- Event types: `text-start/delta/end`, `tool-call/result/error`, `start-step/finish-step`
- MessageV2 supports multiple parts (text, tool, subtask)

---

## TODOs

- [x] 1. Create ensemble configuration module

  **What to do**:
  - Create `src/ensemble/config.ts`
  - Define ensemble settings interface
  - Add enable/disable flag
  - Define model pair (glm-5 + kimi-k2.5)
  - Export config getter function

  **Recommended Agent Profile**: `quick`

  **Acceptance Criteria**:
  - [ ] File created at `src/ensemble/config.ts`
  - [ ] Config interface defined
  - [ ] Model IDs use existing ModelID type

---

- [ ] 2. Implement parallel stream invocation

  **What to do**:
  - Create `src/ensemble/stream.ts`
  - Function to invoke two LLM streams in parallel using Effect.fork
  - Collect events from both streams
  - Handle errors gracefully

  **Recommended Agent Profile**: `deep`

  **Acceptance Criteria**:
  - [ ] Parallel invocation works with Effect.fork
  - [ ] Events collected from both streams
  - [ ] Error handling for single model failure

---

- [ ] 3. Implement tool call merger

  **What to do**:
  - Create `src/ensemble/tool-merge.ts`
  - Collect tool calls from both model responses
  - Hash tool name + args for deduplication
  - Return merged list with source attribution

  **Recommended Agent Profile**: `quick`

  **Acceptance Criteria**:
  - [ ] Tool calls from both models collected
  - [ ] Duplicate calls removed
  - [ ] Source model tracked for each call

---

- [ ] 4. Implement judge synthesis

  **What to do**:
  - Create `src/ensemble/judge.ts`
  - Build synthesis prompt with both model responses
  - Call kimi-k2.5 as judge model
  - Parse synthesized response

  **Recommended Agent Profile**: `deep`

  **Acceptance Criteria**:
  - [ ] Judge prompt includes both responses
  - [ ] Judge model called correctly
  - [ ] Synthesized response returned

---

- [ ] 5. Integrate ensemble into session flow

  **What to do**:
  - Modify `src/session/llm.ts` or `src/session/prompt.ts`
  - Detect baiduqianfancodingplan provider
  - Route to ensemble stream when enabled

  **Recommended Agent Profile**: `deep`

  **Acceptance Criteria**:
  - [ ] Ensemble invoked for baiduqianfancodingplan
  - [ ] Single-model fallback works
  - [ ] No regression in existing flows

---

- [ ] 6. Add tests for ensemble logic

  **What to do**:
  - Create `test/ensemble/` directory
  - Unit tests for tool merger
  - Unit tests for judge synthesis
  - Integration test for full flow

  **Recommended Agent Profile**: `quick`

  **Acceptance Criteria**:
  - [ ] Tool merger tests pass
  - [ ] Judge synthesis tests pass
  - [ ] Integration test passes

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
- [ ] F2. **Code Quality Review** — `unspecified-high`
- [ ] F3. **Real Manual QA** — `unspecified-high`
- [ ] F4. **Scope Fidelity Check** — `deep`

---

## Success Criteria

```bash
# Type check
bun typecheck

# Run ensemble tests
bun test test/ensemble/

# Run all tests
bun test
```

- [ ] glm-5 and kimi-k2.5 called in parallel
- [ ] Both responses displayed
- [ ] Judge synthesis produces final answer
- [ ] Tool calls merged correctly
- [ ] Only baiduqianfancodingplan provider affected
- [ ] All tests pass
