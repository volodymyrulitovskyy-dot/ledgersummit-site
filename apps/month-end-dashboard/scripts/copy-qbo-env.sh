#!/bin/bash
# Copy QBO environment variables from month-end-dashboard to month-end-dashboard-2

OLD_PROJECT="${1:-../month-end-dashboard}"
ENV_FILE="${2:-.env.local}"

echo "Looking for QBO env vars in $OLD_PROJECT/$ENV_FILE..."

if [ ! -f "$OLD_PROJECT/$ENV_FILE" ]; then
  echo "Warning: $OLD_PROJECT/$ENV_FILE not found"
  echo "If your QBO config is in a different file, specify it:"
  echo "  ./scripts/copy-qbo-env.sh ../month-end-dashboard .env"
  exit 0
fi

# Extract QBO vars
QBO_VARS=$(grep -E "^QBO_|^QUICKBOOKS_|^INTUIT_" "$OLD_PROJECT/$ENV_FILE" 2>/dev/null)

if [ -z "$QBO_VARS" ]; then
  echo "No QBO environment variables found in $OLD_PROJECT/$ENV_FILE"
  exit 0
fi

echo "Found QBO variables:"
echo "$QBO_VARS"
echo ""
read -p "Copy these to month-end-dashboard-2/.env? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  # Append to .env (will create if doesn't exist)
  echo "" >> .env
  echo "# QuickBooks Online OAuth (copied from $OLD_PROJECT/$ENV_FILE)" >> .env
  echo "$QBO_VARS" >> .env
  
  # Update redirect URI if needed
  if grep -q "QBO_REDIRECT_URI" .env; then
    # Check if 3013 is already in redirect URI
    if ! grep -q "3013" .env | grep -q "QBO_REDIRECT_URI"; then
      echo ""
      echo "Note: Please update QBO_REDIRECT_URI to include:"
      echo "  http://localhost:3013/api/qbo/callback"
      echo ""
      echo "You may need to add this redirect URI to your Intuit Developer app settings."
    fi
  fi
  
  echo "QBO variables copied to .env"
else
  echo "Cancelled"
fi

