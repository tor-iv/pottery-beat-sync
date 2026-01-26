'use client';

import { useRef, useState, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';

export function Preview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { videos, audioUrl, timeline, beats, bpm, outputLength } = useProjectStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);

  const hasContent = videos.length > 0 && audioUrl && timeline.length > 0;
  const beatDuration = bpm ? 60 / bpm : 0;

  // Update current clip based on playback time
  useEffect(() => {
    if (!hasContent || !bpm) return;

    let elapsed = 0;
    for (let i = 0; i < timeline.length; i++) {
      const clipDuration = timeline[i].duration * beatDuration;
      if (currentTime < elapsed + clipDuration) {
        setCurrentClipIndex(i);
        break;
      }
      elapsed += clipDuration;
    }
  }, [currentTime, timeline, beatDuration, hasContent, bpm]);

  // Get current video source
  const getCurrentVideoUrl = () => {
    if (!hasContent || videos.length === 0) return null;

    // Find which video this clip belongs to
    const entry = timeline[currentClipIndex];
    if (!entry) return null;

    // For now, cycle through videos based on clip index
    const video = videos[currentClipIndex % videos.length];
    return video ? URL.createObjectURL(video.file) : null;
  };

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

  // Simulate playback
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1;
        if (next >= outputLength) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, outputLength]);

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

  const currentVideoUrl = getCurrentVideoUrl();

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
            max={outputLength}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
          />
        </div>

        <span className="text-sm text-gray-400 min-w-[80px] text-right">
          {formatTime(currentTime)} / {formatTime(outputLength)}
        </span>
      </div>

      {/* Note about preview */}
      <p className="text-xs text-gray-500 text-center">
        Preview shows approximate cuts. Export for final result.
      </p>
    </div>
  );
}
