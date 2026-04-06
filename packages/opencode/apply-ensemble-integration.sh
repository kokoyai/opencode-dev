#!/bin/bash
set -e

FILE="src/session/processor.ts"

# 备份
cp "$FILE" "${FILE}.bak"

# 1. 添加 import
sed -i '21a\import * as EnsembleProcessor from "@/ensemble/processor"' "$FILE"

# 2. 添加依赖到 layer 类型签名
sed -i '73a\    | EnsembleProcessor.Service' "$FILE"

# 3. 添加 yield EnsembleProcessor.Service (在 provider 之后)
# 找到包含 "const provider = yield\* Provider.Service" 的行号
LINE=$(grep -n "const provider = yield\* Provider.Service" "$FILE" | cut -d: -f1)
if [ -n "$LINE" ]; then
  # 检查下一行是否已经有 ensemble
  NEXT_LINE=$((LINE + 1))
  if ! sed -n "${NEXT_LINE}p" "$FILE" | grep -q "ensemble"; then
    sed -i "${LINE}a\      const ensemble = yield* EnsembleProcessor.Service" "$FILE"
  fi
fi

echo "✅ 集成补丁已应用"
echo "现在需要手动修改 tryProcess 函数"
