'use client';

import { useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { analyzeAudio, getSyncPointSummary } from '@/lib/audio-analysis';

export function useAudioAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const { setSyncPoints, setAudioDuration } = useProjectStore();

  const analyze = useCallback(
    async (file: File) => {
      setIsAnalyzing(true);
      setError(null);
      setSummary(null);

      try {
        const audioContext = new AudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Run the new audio analysis
        const analysis = await analyzeAudio(audioBuffer);

        setSyncPoints(analysis.syncPoints);
        setAudioDuration(analysis.duration);
        setSummary(getSyncPointSummary(analysis));

        await audioContext.close();

        return analysis;
      } catch (err) {
        console.error('Audio analysis failed:', err);
        setError(err instanceof Error ? err.message : 'Audio analysis failed');
        return null;
      } finally {
        setIsAnalyzing(false);
      }
    },
    [setSyncPoints, setAudioDuration]
  );

  return { analyze, isAnalyzing, error, summary };
}
