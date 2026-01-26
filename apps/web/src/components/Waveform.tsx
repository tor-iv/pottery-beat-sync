'use client';

import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';

export function Waveform() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const { audioUrl, beats, bpm } = useProjectStore();
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    let wavesurfer: any;

    const initWaveSurfer = async () => {
      const WaveSurfer = (await import('wavesurfer.js')).default;

      wavesurfer = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: '#4b5563',
        progressColor: '#e97316',
        cursorColor: '#f97316',
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 80,
        normalize: true,
      });

      wavesurfer.load(audioUrl);

      wavesurfer.on('ready', () => {
        setIsReady(true);
        setDuration(wavesurfer.getDuration());
        wavesurferRef.current = wavesurfer;
      });

      wavesurfer.on('audioprocess', (time: number) => {
        setCurrentTime(time);
      });

      wavesurfer.on('play', () => setIsPlaying(true));
      wavesurfer.on('pause', () => setIsPlaying(false));
      wavesurfer.on('finish', () => setIsPlaying(false));
    };

    initWaveSurfer();

    return () => {
      wavesurfer?.destroy();
    };
  }, [audioUrl]);

  const togglePlayPause = () => {
    wavesurferRef.current?.playPause();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2">
      {/* Waveform container */}
      <div className="relative">
        <div ref={containerRef} className="bg-gray-900/50 rounded" />

        {/* Beat markers overlay */}
        {isReady && beats.length > 0 && duration > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {beats.map((beat, index) => (
              <div
                key={index}
                className="absolute top-0 bottom-0 w-px bg-primary-500/40"
                style={{ left: `${(beat.time / duration) * 100}%` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlayPause}
          disabled={!isReady}
          className="w-10 h-10 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-600 rounded-full flex items-center justify-center text-white transition-colors"
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>

        <div className="text-sm text-gray-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {bpm && (
          <div className="ml-auto text-sm">
            <span className="text-primary-400 font-medium">{bpm} BPM</span>
            <span className="text-gray-500 ml-2">
              {beats.length} beats detected
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
