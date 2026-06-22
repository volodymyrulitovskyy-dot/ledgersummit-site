#!/bin/bash

# Quick start script for month-end-dashboard-3
# This script will install dependencies and start the dev server on port 3015

echo "🚀 Starting Month-End Dashboard 3..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo ""
fi

echo "✅ Starting dev server on port 3015..."
echo "🌐 App will be available at http://localhost:3015"
echo ""

npm run dev
