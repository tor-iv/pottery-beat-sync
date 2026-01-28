#!/bin/bash

echo "PotteryBeatSync Setup Script"
echo "============================"
echo ""

# Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "Homebrew is not installed. Please install it first:"
    echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
fi

echo "Checking system dependencies..."
echo ""

# Check for FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "FFmpeg not found. Installing..."
    brew install ffmpeg
else
    echo "FFmpeg: $(ffmpeg -version | head -n1)"
fi

# Check for yt-dlp
if ! command -v yt-dlp &> /dev/null; then
    echo "yt-dlp not found. Installing..."
    brew install yt-dlp
else
    echo "yt-dlp: $(yt-dlp --version)"
fi

echo ""
echo "Checking Bun..."

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "Bun not found. Installing..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
else
    echo "Bun: $(bun --version)"
fi

echo ""
echo "Installing dependencies..."
bun install

echo ""
echo "Creating required directories..."
mkdir -p apps/server/uploads
mkdir -p apps/server/output

echo ""
echo "============================"
echo "Setup complete!"
echo "============================"
echo ""
echo "To start the app:"
echo "  bun run dev"
echo ""
echo "Then open http://localhost:3000 in your browser."
echo ""
echo "(Optional) For Spotify song search:"
echo "  1. Copy .env.example to .env"
echo "  2. Add your Spotify API credentials"
echo "  See README.md for details."
