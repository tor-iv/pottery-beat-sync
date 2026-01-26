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
echo "Checking Node.js..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Please install Node.js 18 or higher:"
    echo "  brew install node"
    exit 1
else
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "Node.js version is too old. Please upgrade to v18 or higher."
        exit 1
    fi
    echo "Node.js: $(node -v)"
fi

echo ""
echo "Installing npm dependencies..."
npm install

echo ""
echo "Creating required directories..."
mkdir -p apps/server/uploads
mkdir -p apps/server/output

echo ""
echo "Setup complete! You can now run:"
echo "  npm run dev:server  # Start the backend server"
echo "  npm run dev:web     # Start the frontend (in another terminal)"
echo ""
echo "Or run both with:"
echo "  npm run dev"
