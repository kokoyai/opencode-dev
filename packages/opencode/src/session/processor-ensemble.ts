// Ensemble 集成补丁
// 此文件包含集成 Ensemble 到 SessionProcessor 的修改

import * as EnsembleProcessor from "@/ensemble/processor"

// 1. 在 imports 中添加：
// import * as EnsembleProcessor from "@/ensemble/processor"

// 2. 修改 layer 类型签名，添加 EnsembleProcessor.Service 依赖：
// export const layer: Layer.Layer<
//   Service,
//   never,
//   | ...
//   | Provider.Service
//   | EnsembleProcessor.Service  // 添加这行
// > = Layer.effect(

// 3. 在 layer 的 Effect.gen 中 yield EnsembleProcessor.Service：
// const provider = yield* Provider.Service
// const ensemble = yield* EnsembleProcessor.Service  // 添加这行

// 4. 在 tryProcess 函数中，替换 llm.stream 为 ensemble.process：
// const tryProcess = (input: LLM.StreamInput) =>
//   Effect.gen(function* () {
//     ctx.currentText = undefined
//     ctx.reasoningMap = {}
//     
//     // 使用 Ensemble 处理
//     const result = yield* ensemble.process(input)
//     
//     // 将 EnsembleResult 转换为事件流
//     if (result.text) {
//       yield* handleEvent({ type: "text-start", id: "ensemble-text" })
//       yield* handleEvent({ type: "text-delta", id: "ensemble-text", text: result.text })
//       yield* handleEvent({ type: "text-end", id: "ensemble-text" })
//     }
//     
//     for (const tc of result.toolCalls) {
//       yield* handleEvent({
//         type: "tool-call",
//         toolCallId: tc.toolCallId,
//         toolName: tc.toolName,
//         input: tc.input,
//       })
//     }
//   }).pipe(
//     Effect.onInterrupt(() => Effect.sync(() => void (aborted = true))),
//     // ... 其他 pipe 操作
//   )

// 5. 在应用启动时提供 EnsembleProcessor.defaultLayer
// 需要在 SessionProcessor.defaultLayer 的构建中添加：
// Layer.provide(EnsembleProcessor.defaultLayer)
