#!/bin/bash
# Script to copy env file from month-end-dashboard to month-end-dashboard-2
# Usage: ./scripts/copy-env.sh <path-to-source-env-file>

if [ -z "$1" ]; then
  echo "Usage: ./scripts/copy-env.sh <path-to-source-env-file>"
  echo "Example: ./scripts/copy-env.sh ../month-end-dashboard/.env.local"
  exit 1
fi

SOURCE_FILE="$1"
TARGET_FILE=".env"

if [ ! -f "$SOURCE_FILE" ]; then
  echo "Error: Source file not found: $SOURCE_FILE"
  exit 1
fi

echo "Copying from: $SOURCE_FILE"
echo "To: $TARGET_FILE"

# Copy the file
cp "$SOURCE_FILE" "$TARGET_FILE"

# Modify DATABASE_URL to use schema=med2
if grep -q "DATABASE_URL=" "$TARGET_FILE"; then
  # Check if URL already has query parameters
  if grep -q "DATABASE_URL=.*?" "$TARGET_FILE"; then
    # Has query params, append &schema=med2
    sed -i '' 's|DATABASE_URL="\([^"]*\)"|DATABASE_URL="\1\&schema=med2"|g' "$TARGET_FILE"
    sed -i '' 's|DATABASE_URL=\([^&]*\)|DATABASE_URL=\1\&schema=med2|g' "$TARGET_FILE"
  else
    # No query params, append ?schema=med2
    sed -i '' 's|DATABASE_URL="\([^"]*\)"|DATABASE_URL="\1?schema=med2"|g' "$TARGET_FILE"
    sed -i '' 's|DATABASE_URL=\([^"&]*\)|DATABASE_URL=\1?schema=med2|g' "$TARGET_FILE"
  fi
  echo "✓ Updated DATABASE_URL to use schema=med2"
else
  echo "⚠ Warning: DATABASE_URL not found in source file"
fi

# Modify SHADOW_DATABASE_URL if it exists
if grep -q "SHADOW_DATABASE_URL=" "$TARGET_FILE"; then
  if grep -q "SHADOW_DATABASE_URL=.*?" "$TARGET_FILE"; then
    sed -i '' 's|SHADOW_DATABASE_URL="\([^"]*\)"|SHADOW_DATABASE_URL="\1\&schema=med2_shadow"|g' "$TARGET_FILE"
    sed -i '' 's|SHADOW_DATABASE_URL=\([^&]*\)|SHADOW_DATABASE_URL=\1\&schema=med2_shadow|g' "$TARGET_FILE"
  else
    sed -i '' 's|SHADOW_DATABASE_URL="\([^"]*\)"|SHADOW_DATABASE_URL="\1?schema=med2_shadow"|g' "$TARGET_FILE"
    sed -i '' 's|SHADOW_DATABASE_URL=\([^"&]*\)|SHADOW_DATABASE_URL=\1?schema=med2_shadow|g' "$TARGET_FILE"
  fi
  echo "✓ Updated SHADOW_DATABASE_URL to use schema=med2_shadow"
fi

echo ""
echo "✓ Env file copied and modified successfully!"
echo "Source: $SOURCE_FILE"
echo "Target: $TARGET_FILE"
echo ""
echo "Please verify the following values are set:"
grep -E "DATABASE_URL|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY" "$TARGET_FILE" || echo "⚠ Some required values may be missing"

