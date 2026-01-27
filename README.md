# PotteryBeatSync

A video beat sync tool for creating TikTok pottery videos. Upload your pottery-making footage and audio, and the app automatically detects beats/sync points to generate beat-synced video edits.

## Features

- **Automatic beat detection** - Detects drops, hits, pauses, and section changes in audio
- **Smart video ordering** - Arranges clips by pottery stage (Centering → Coning → Opening → Pulling → Shaping → Finishing)
- **Teaser mode** - Option to show the finished pot first, then the making process
- **TikTok-optimized export** - 1080x1920 vertical video (9:16) in H.264 MP4
- **Flexible audio export** - Export with audio embedded, or video-only to add the song directly in TikTok

## Requirements

- **Node.js 18+**
- **macOS** with [Homebrew](https://brew.sh) (for automatic dependency installation)
- **FFmpeg** - Video processing (installed automatically)
- **yt-dlp** - Audio extraction (installed automatically)

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd pottery-beat-sync

# Run setup (installs dependencies + FFmpeg + yt-dlp)
npm run setup

# Start the app
npm run dev
```

Then open http://localhost:3000 in your browser.

## Setup Details

The setup script (`npm run setup`) will:

1. Check for Homebrew (required on macOS)
2. Install FFmpeg via Homebrew if not present
3. Install yt-dlp via Homebrew if not present
4. Verify Node.js 18+ is installed
5. Run `npm install` for all workspaces
6. Create required directories (`apps/server/uploads`, `apps/server/output`)

### Manual Installation

If you prefer to install dependencies manually:

```bash
# Install system dependencies
brew install ffmpeg yt-dlp

# Install npm packages
npm install

# Create directories
mkdir -p apps/server/uploads apps/server/output
```

## Development

```bash
# Run both frontend and backend
npm run dev

# Or run individually
npm run dev:web     # Next.js frontend on http://localhost:3000
npm run dev:server  # Express backend on http://localhost:3001

# Build for production
npm run build
```

## Project Structure

```
pottery-beat-sync/
├── apps/
│   ├── web/          # Next.js 14 frontend
│   │   └── src/
│   │       ├── components/   # React components
│   │       ├── stores/       # Zustand state management
│   │       └── lib/          # Audio analysis, beat detection
│   └── server/       # Express backend
│       └── src/
│           ├── routes/       # API endpoints
│           └── services/     # FFmpeg processing
├── scripts/
│   └── setup.sh      # Setup script
└── package.json      # Workspace root
```

## Optional: Spotify Integration

To enable Spotify song search:

1. Create an app at https://developer.spotify.com/dashboard
2. Set redirect URI to `http://localhost:3000/api/spotify/callback`
3. Copy `.env.example` to `.env` and add your credentials:

```bash
cp .env.example .env
```

Then edit `.env` with your Spotify Client ID and Secret.

## How It Works

1. **Upload audio** - The app analyzes the audio to detect sync points (beats, drops, builds, pauses)
2. **Upload video segments** - Label each video with its pottery stage
3. **Generate timeline** - The app maps sync points to video snippets
4. **Export** - FFmpeg processes the videos, extracts clips at beat timestamps, concatenates them, and optionally adds audio

## Troubleshooting

### "FFmpeg not found" error
Run `npm run setup` or install manually with `brew install ffmpeg`

### Export fails at 0%
- Check the browser console for errors
- Ensure the backend is running (`npm run dev:server`)
- Try a different browser if issues persist

### Beat detection not working
The app uses Essentia.js for advanced beat detection with a fallback to basic energy analysis. If detection seems off, try audio with clearer beats.

## License

MIT
