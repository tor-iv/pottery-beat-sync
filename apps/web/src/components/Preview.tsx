'use client';

import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';

export function Preview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackStartRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const {
    videos,
    audioUrl,
    timeline,
    beats,
    bpm,
    outputLength,
    audioDuration,
    setCurrentPlaybackTime,
    setIsPreviewPlaying,
  } = useProjectStore();

  // Effective output length respects actual audio duration
  const effectiveLength = audioDuration ? Math.min(outputLength, audioDuration) : outputLength;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);

  const hasContent = videos.length > 0 && audioUrl && timeline.length > 0;
  const beatDuration = bpm ? 60 / bpm : 0;

  // Update current clip based on playback time
  useEffect(() => {
    if (!hasContent) return;

    let elapsed = 0;
    for (let i = 0; i < timeline.length; i++) {
      const clipDuration = timeline[i].endTime - timeline[i].startTime;
      if (currentTime < elapsed + clipDuration) {
        setCurrentClipIndex(i);
        break;
      }
      elapsed += clipDuration;
    }
  }, [currentTime, timeline, hasContent]);

  // Get current video source - memoized to prevent creating new blob URLs on every render
  const currentVideoUrl = useMemo(() => {
    if (!hasContent || videos.length === 0) return null;

    // Find which video this clip belongs to using videoId from timeline entry
    const entry = timeline[currentClipIndex];
    if (!entry) return null;

    const video = videos.find(v => v.id === entry.videoId);
    return video ? URL.createObjectURL(video.file) : null;
  }, [hasContent, videos, currentClipIndex, timeline]);

  // Cleanup blob URL when it changes
  useEffect(() => {
    return () => {
      if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    };
  }, [currentVideoUrl]);

  // Control video playback - play/pause the actual video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentVideoUrl) return;

    if (isPlaying) {
      video.play().catch(() => {
        // Autoplay may be blocked by browser - user interaction required
      });
    } else {
      video.pause();
    }
  }, [isPlaying, currentVideoUrl]);

  // Seek to correct position when clip changes or when user seeks
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasContent) return;

    const entry = timeline[currentClipIndex];
    if (!entry) return;

    // Calculate position within the current clip
    let elapsedBefore = 0;
    for (let i = 0; i < currentClipIndex; i++) {
      elapsedBefore += timeline[i].endTime - timeline[i].startTime;
    }
    const positionInClip = currentTime - elapsedBefore;
    const targetTime = entry.sourcePosition + positionInClip;

    // Only seek if the difference is significant (avoid micro-seeks during playback)
    if (Math.abs(video.currentTime - targetTime) > 0.1) {
      video.currentTime = targetTime;
    }
  }, [currentClipIndex, timeline, hasContent]);

  // Sync video position when seeking via slider (not during playback)
  useEffect(() => {
    if (isPlaying) return; // Don't interfere during playback

    const video = videoRef.current;
    if (!video || !hasContent) return;

    const entry = timeline[currentClipIndex];
    if (!entry) return;

    // Calculate position within the current clip
    let elapsedBefore = 0;
    for (let i = 0; i < currentClipIndex; i++) {
      elapsedBefore += timeline[i].endTime - timeline[i].startTime;
    }
    const positionInClip = currentTime - elapsedBefore;
    const targetTime = entry.sourcePosition + positionInClip;

    video.currentTime = targetTime;
  }, [currentTime, isPlaying, currentClipIndex, timeline, hasContent]);

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(parseFloat(e.target.value));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Sync playback state to store for Timeline playhead
  useEffect(() => {
    setCurrentPlaybackTime(currentTime);
  }, [currentTime, setCurrentPlaybackTime]);

  useEffect(() => {
    setIsPreviewPlaying(isPlaying);
  }, [isPlaying, setIsPreviewPlaying]);

  // Smooth playback using requestAnimationFrame (60fps)
  useEffect(() => {
    if (!isPlaying) {
      playbackStartRef.current = null;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    // Store the time when playback started, offset by current position
    const startTimeOffset = currentTime;
    playbackStartRef.current = performance.now();

    const animate = (now: number) => {
      if (playbackStartRef.current === null) return;

      const elapsed = (now - playbackStartRef.current) / 1000; // Convert to seconds
      const newTime = startTimeOffset + elapsed;

      if (newTime >= effectiveLength) {
        setIsPlaying(false);
        setCurrentTime(0);
        return;
      }

      setCurrentTime(newTime);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, effectiveLength]);

  if (!hasContent) {
    return (
      <div className="aspect-[9/16] max-h-[400px] bg-gray-900 rounded-lg flex items-center justify-center">
        <div className="text-center text-gray-500">
          <span className="text-4xl block mb-2">&#127909;</span>
          <p className="text-sm">Add audio and videos to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Video preview */}
      <div className="aspect-[9/16] max-h-[400px] bg-gray-900 rounded-lg overflow-hidden relative">
        {currentVideoUrl ? (
          <video
            ref={videoRef}
            src={currentVideoUrl}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            Loading...
          </div>
        )}

        {/* Clip indicator */}
        <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-1 text-xs text-white">
          Clip {currentClipIndex + 1} / {timeline.length}
        </div>

        {/* Beat indicator */}
        {bpm && (
          <div className="absolute top-2 right-2 bg-primary-500/80 rounded px-2 py-1 text-xs text-white">
            Beat {Math.floor(currentTime / beatDuration) + 1}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlayPause}
          className="w-10 h-10 bg-primary-500 hover:bg-primary-600 rounded-full flex items-center justify-center text-white transition-colors"
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>

        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={effectiveLength}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
          />
        </div>

        <span className="text-sm text-gray-400 min-w-[80px] text-right">
          {formatTime(currentTime)} / {formatTime(effectiveLength)}
        </span>
      </div>

      {/* Note about preview */}
      <p className="text-xs text-gray-500 text-center">
        Preview shows approximate cuts. Export for final result.
      </p>
    </div>
  );
}
