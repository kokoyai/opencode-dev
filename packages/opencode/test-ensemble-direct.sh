#!/bin/bash

echo "🎯 直接测试 Ensemble 系统"
echo "======================================"

# 使用 bun 运行 opencode
echo "🚀 使用 bun run 启动 opencode..."
echo ""

# 创建测试目录
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

git init
git config user.email "test@test.com"
git config user.name "Test User"

echo "// 测试：用 TypeScript 写一个单例模式" > test.ts

# 测试
echo "请用 TypeScript 写一个单例模式的完整例子" | timeout 120 bun run /vol2/1000/001-mwcode/packages/opencode/src/index.ts 2>&1 | head -100

cd - > /dev/null
rm -rf "$TEST_DIR"

echo ""
echo "✅ 测试完成"
