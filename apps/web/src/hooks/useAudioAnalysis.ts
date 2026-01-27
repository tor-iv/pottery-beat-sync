'use client';

import { useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { analyzeAudio, getSyncPointSummary } from '@/lib/audio-analysis';
import type { AnalysisSettings } from '@/lib/audio-analysis';

export function useAudioAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const { setSyncPoints, setAudioDuration, setBpm, analysisSettings, audio } = useProjectStore();

  const analyze = useCallback(
    async (file: File, settings?: AnalysisSettings) => {
      setIsAnalyzing(true);
      setError(null);
      setSummary(null);

      try {
        const audioContext = new AudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Run the audio analysis with settings (use provided or from store)
        const effectiveSettings = settings || analysisSettings;
        const analysis = await analyzeAudio(audioBuffer, effectiveSettings);

        setSyncPoints(analysis.syncPoints);
        setAudioDuration(analysis.duration);
        setBpm(analysis.bpm);
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
    [setSyncPoints, setAudioDuration, setBpm, analysisSettings]
  );

  // Re-analyze the current audio file with new settings
  const reanalyze = useCallback(
    async (settings: AnalysisSettings) => {
      if (!audio) {
        setError('No audio file to re-analyze');
        return null;
      }
      return analyze(audio, settings);
    },
    [audio, analyze]
  );

  return { analyze, reanalyze, isAnalyzing, error, summary };
}
