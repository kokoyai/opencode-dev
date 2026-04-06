#!/bin/bash
# 测试 OpenCode + Ensemble 系统

echo "🎯 测试 OpenCode Ensemble 系统"
echo "======================================"
echo ""
echo "Ensemble 配置:"
cat src/ensemble/config.ts | grep -A 5 "return {"
echo ""
echo "======================================"
echo ""

# 创建测试目录
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

# 初始化 git 仓库（opencode 需要）
git init
git config user.email "test@test.com"
git config user.name "Test User"

# 创建测试文件
cat > test.ts << 'EOF'
// 测试问题 1: 单例模式
// 用 TypeScript 写一个单例模式的完整例子

// 测试问题 2: 闭包
// 解释什么是闭包，并给出代码示例

// 测试问题 3: 快速排序
// 写一个快速排序算法，并解释其时间复杂度
EOF

echo "📝 测试文件已创建: test.ts"
echo ""

# 运行 opencode
echo "🚀 启动 OpenCode..."
echo ""

# 使用编译好的 opencode
OPENCODE="../dist/opencode-linux-x64/bin/opencode"

if [ ! -f "$OPENCODE" ]; then
  echo "❌ 找不到 opencode"
  exit 1
fi

# 测试问题
echo "请用 TypeScript 写一个单例模式的完整例子" | timeout 60 $OPENCODE --non-interactive 2>&1 | tee output.txt

echo ""
echo "======================================"
echo "✅ 测试完成！"
echo ""
echo "输出已保存到: $(pwd)/output.txt"
echo ""

# 清理
cd - > /dev/null
# rm -rf "$TEST_DIR"
echo "测试目录: $TEST_DIR"
