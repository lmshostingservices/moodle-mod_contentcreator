#!/bin/bash
# Syntax check for Content Creator JS files
echo "Checking JavaScript syntax..."

FILES=(
  "amd/src/prompts.js"
  "amd/src/prompts_lean.js"
  "amd/src/builder.js"
  "amd/src/player5.js"
)

ERRORS=0
for file in "${FILES[@]}"; do
  if node --check "$file" 2>&1; then
    echo "✅ $file"
  else
    echo "❌ $file has syntax errors"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo ""
  echo "✅ All files passed syntax check"
  exit 0
else
  echo ""
  echo "❌ $ERRORS file(s) have errors"
  exit 1
fi
