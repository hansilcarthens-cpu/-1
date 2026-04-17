#!/bin/bash
echo "======================================================"
echo "  TikTok Pricing Tool - One-Click Installer (Mac/Linux)"
echo "======================================================"
echo ""

if ! command -v node &> /dev/null
then
    echo "Error: Node.js is not installed. Please install it from https://nodejs.org/"
    exit
fi

echo "[1/3] Installing dependencies..."
npm install

echo "[2/3] Building the Desktop Application..."
npm run electron:build

echo ""
echo "======================================================"
echo "  SUCCESS: Build complete!"
echo "  Check the 'release' folder for your application."
echo "======================================================"
