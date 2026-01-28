# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PotteryBeatSync is a video beat sync tool for creating TikTok pottery videos. It allows users to upload pottery-making videos and audio, automatically detects beats/sync points in the audio, and generates beat-synced video edits.

## Commands

```bash
# Install dependencies and system requirements (requires Homebrew)
bun run setup

# Development (runs both web and server)
bun run dev

# Run individually
bun run dev:web     # Next.js frontend on :3000
bun run dev:server  # Express backend on :3001

# Build
bun run build
```

**System requirements:** Bun, FFmpeg, and yt-dlp (installed via `bun run setup`)

## Architecture

This is a monorepo with Bun workspaces containing two apps:

### apps/web (Next.js 14 + React)
- **State:** Zustand store (`stores/projectStore.ts`) holds all project state (audio, videos, settings, timeline)
- **Audio analysis:** `lib/audio-analysis.ts` uses Essentia.js for advanced sync point detection (beats, drops, builds, pauses, verse/chorus sections). Falls back to basic energy analysis if Essentia fails to load
- **Beat detection:** `lib/beat-detection.ts` wraps web-audio-beat-detector for BPM detection and generates variable cut patterns
- **API client:** `lib/api-client.ts` communicates with backend, includes SSE for export progress

### apps/server (Express + TypeScript)
- **FFmpeg service:** `services/ffmpeg.ts` handles all video processing - clip extraction, concatenation, audio merging. Videos are sorted by pottery stage order (Centering → Coning → Opening → Pulling → Shaping → Finishing)
- **Export route:** `routes/export.ts` accepts multipart uploads of audio + videos, processes them with FFmpeg, broadcasts progress via WebSocket
- **WebSocket:** Available at `/ws` for real-time export progress updates

### Key Data Flow
1. User uploads audio → `audio-analysis.ts` detects sync points (drops, hits, pauses, etc.)
2. User uploads video segments labeled by pottery stage
3. Timeline is generated mapping sync points to video snippets
4. Export sends files to server → FFmpeg extracts clips at beat timestamps → concatenates → adds audio

### Video Modes
- **Standard:** Chronological editing following pottery stage order
- **Teaser:** Shows finished pot first (from "Finishing" segment), then the making process

## Environment

Copy `.env.example` to `.env` for Spotify API integration (optional).
