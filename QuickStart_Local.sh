#!/bin/bash
echo "======================================================"
echo "  TikTok Pricing Tool - Local Deployment (Scheme A)"
echo "======================================================"
echo ""

if ! command -v node &> /dev/null
then
    echo "Error: Node.js is not installed!"
    exit
fi

if [ ! -d "node_modules" ]; then
    echo "[1/3] Installing dependencies..."
    npm install
fi

echo "[2/3] Building production version..."
npm run build

echo "[3/3] Starting local server at http://localhost:3000"
echo ""
npx serve -s dist -l 3000
