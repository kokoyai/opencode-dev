#!/bin/bash
set -e

echo "🎯 真实测试 OpenCode Ensemble 系统"
echo "======================================"
echo ""
echo "📋 Ensemble 配置:"
echo "  启用状态: true"
echo "  模型 1: glm-5"
echo "  模型 2: kimi-k2.5"
echo "  Judge: kimi-k2.5"
echo ""
echo "======================================"
echo ""

# 使用编译好的二进制文件
OPENCODE="/vol2/1000/001-mwcode/packages/opencode/dist/opencode-linux-x64/bin/opencode"

if [ ! -f "$OPENCODE" ]; then
  echo "❌ 找不到 opencode 二进制文件"
  exit 1
fi

echo "✅ 找到 opencode: $OPENCODE"
echo ""

# 创建测试目录
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

echo "📁 测试目录: $(pwd)"
echo ""

# 初始化 git
git init -q
git config user.email "test@test.com"
git config user.name "Test User"

# 创建测试文件
cat > test.ts << 'EOFFILE'
// 测试问题
// 用 TypeScript 写一个单例模式
EOFFILE

echo "📝 测试文件已创建"
echo ""

# 运行测试
echo "🚀 启动 OpenCode (启用 Ensemble)..."
echo ""
echo "问题: 请用 TypeScript 写一个单例模式的完整例子"
echo ""

# 使用 timeout 限制运行时间
echo "请用 TypeScript 写一个单例模式的完整例子" | timeout 120 $OPENCODE --non-interactive 2>&1 | tee output.txt || true

echo ""
echo "======================================"
echo ""
echo "✅ 测试完成！"
echo ""
echo "📄 输出已保存到: $(pwd)/output.txt"
echo ""
echo "📊 测试结果:"
wc -l output.txt
echo ""

# 返回原目录
cd - > /dev/null

echo "测试目录保留在: $TEST_DIR"
echo ""
echo "查看输出: cat $TEST_DIR/output.txt"
