#!/bin/bash
set -e

echo "🚀 测试 OpenCode Ensemble 系统"
echo "========================================"

# 使用编译好的 opencode
OPENCODE="./dist/opencode-linux-x64/bin/opencode"

if [ ! -f "$OPENCODE" ]; then
  echo "❌ 找不到 opencode，尝试使用 bun 运行"
  OPENCODE="bun run src/index.ts"
fi

echo "使用: $OPENCODE"
echo ""

# 测试问题
QUESTIONS=(
  "用 TypeScript 写一个单例模式"
  "解释什么是闭包"
  "写一个快速排序算法"
)

# 运行测试
for i in "${!QUESTIONS[@]}"; do
  question="${QUESTIONS[$i]}"
  num=$((i + 1))
  
  echo ""
  echo "测试 $num/${#QUESTIONS[@]}: $question"
  echo "----------------------------------------"
  
  # 创建临时目录
  tmpdir=$(mktemp -d)
  cd "$tmpdir"
  
  # 运行 opencode
  echo "$question" | timeout 60 $OPENCODE --non-interactive 2>&1 | head -50
  
  # 清理
  cd - > /dev/null
  rm -rf "$tmpdir"
  
  echo ""
  echo "✅ 测试 $num 完成"
done

echo ""
echo "========================================"
echo "✨ 所有测试完成！"
