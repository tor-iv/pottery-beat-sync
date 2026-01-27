'use client';

import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { getSyncPointColor, getSyncPointSummary, type SyncPointType } from '@/lib/audio-analysis';

export function Waveform() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const { audioUrl, syncPoints, audioDuration } = useProjectStore();
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

  // Group sync points by type for legend
  const syncPointCounts = syncPoints.reduce((acc, point) => {
    acc[point.type] = (acc[point.type] || 0) + 1;
    return acc;
  }, {} as Record<SyncPointType, number>);

  return (
    <div className="space-y-3">
      {/* Waveform container */}
      <div className="relative">
        <div ref={containerRef} className="bg-gray-900/50 rounded" />

        {/* Sync point markers overlay */}
        {isReady && syncPoints.length > 0 && duration > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {syncPoints.map((point, index) => (
              <div
                key={index}
                className="absolute top-0 bottom-0 transition-opacity"
                style={{
                  left: `${(point.time / duration) * 100}%`,
                  width: point.type === 'drop' ? '3px' : '2px',
                  backgroundColor: getSyncPointColor(point.type),
                  opacity: 0.4 + point.intensity * 0.5,
                }}
                title={`${point.type} @ ${point.time.toFixed(2)}s (${Math.round(point.intensity * 100)}%)`}
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

        {syncPoints.length > 0 && (
          <div className="ml-auto text-sm">
            <span className="text-primary-400 font-medium">{syncPoints.length} sync points</span>
          </div>
        )}
      </div>

      {/* Sync point legend */}
      {syncPoints.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(syncPointCounts).map(([type, count]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: getSyncPointColor(type as SyncPointType) }}
              />
              <span className="text-gray-400">
                {count} {type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
