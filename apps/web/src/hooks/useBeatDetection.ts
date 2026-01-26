'use client';

import { useState, useCallback } from 'react';
import { useProjectStore, Beat } from '@/stores/projectStore';

export function useBeatDetection() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setBpm, setBeats, outputLength } = useProjectStore();

  const detectBeats = useCallback(
    async (file: File) => {
      setIsDetecting(true);
      setError(null);

      try {
        const audioContext = new AudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Use web-audio-beat-detector
        const { analyze } = await import('web-audio-beat-detector');

        const result = await analyze(audioBuffer);
        // The library returns { bpm: number, offset: number } but TypeScript types may be wrong
        const bpmValue = typeof result === 'number' ? result : (result as { bpm: number; offset: number }).bpm;
        const offsetValue = typeof result === 'number' ? 0 : (result as { bpm: number; offset: number }).offset || 0;

        setBpm(Math.round(bpmValue));

        // Generate beat timestamps based on BPM
        const beatInterval = 60 / bpmValue;
        const duration = Math.min(audioBuffer.duration, outputLength + 10); // Add buffer
        const beats: Beat[] = [];

        let time = offsetValue;
        while (time < duration) {
          beats.push({
            time,
            strength: 1, // Could be refined with more analysis
          });
          time += beatInterval;
        }

        setBeats(beats);
        await audioContext.close();
      } catch (err) {
        console.error('Beat detection failed:', err);
        setError(err instanceof Error ? err.message : 'Beat detection failed');

        // Fallback: estimate BPM from common values
        const fallbackBpm = 120;
        setBpm(fallbackBpm);

        const beatInterval = 60 / fallbackBpm;
        const beats: Beat[] = [];
        let time = 0;
        while (time < outputLength + 10) {
          beats.push({ time, strength: 1 });
          time += beatInterval;
        }
        setBeats(beats);
      } finally {
        setIsDetecting(false);
      }
    },
    [setBpm, setBeats, outputLength]
  );

  return { detectBeats, isDetecting, error };
}
