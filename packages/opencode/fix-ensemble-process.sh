#!/bin/bash

# 找到 tryProcess 函数中调用 EnsembleProcessor 的部分，并使用 provide 消除依赖

# 备份文件
cp src/session/processor.ts src/session/processor.ts.bak

# 使用 sed 修改 tryProcess 中的 ensemble 部分
sed -i '/const ensembleProcessor = yield\* EnsembleProcessorService.Service/,/const ensembleResult = yield\* ensembleProcessor.process(input)/{
  s/const ensembleProcessor = yield\* EnsembleProcessorService.Service/const ensembleProcessor = yield\* EnsembleProcessorService.Service.pipe(Effect.provide(EnsembleProcessorService.defaultLayer))/
}' src/session/processor.ts

echo "✅ 修复完成"
