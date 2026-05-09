#!/bin/bash
# 同步后端代码到私有仓库目录
# 用法: ./deploy-backend.sh

SRC="/Users/Katmai/A4-Memory/backend"
DEST="$HOME/A4-Memory-Server"

echo "📦 同步后端代码..."
echo "   $SRC → $DEST"

rsync -av --delete \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='.DS_Store' \
  --exclude='data/a4-memory.db' \
  "$SRC/" "$DEST/"

echo ""
echo "✅ 同步完成"
echo ""

# 显示变更摘要
cd "$DEST"
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "📋 无变更，已是最新。"
  exit 0
fi

echo "📋 变更摘要："
git status --short
echo ""

read -p "🚀 是否立即 commit 并 push？(y/N) " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
  git add -A
  git commit -m "deploy: $(date '+%Y-%m-%d %H:%M:%S')"
  git push
  echo ""
  echo "✅ 后端代码已推送到私有仓库。"
else
  echo "⏸️  已跳过。你可以稍后在 $DEST 中手动 git push。"
fi
