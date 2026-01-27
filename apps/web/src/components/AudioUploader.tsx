'use client';

import { useCallback, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useAudioAnalysis } from '@/hooks/useAudioAnalysis';
import { SongSearch } from './SongSearch';
import type { MusicType } from '@/lib/audio-analysis';

const MUSIC_TYPE_LABELS: Record<MusicType, { label: string; description: string }> = {
  'chill': { label: 'Chill', description: 'Fewer cuts, relaxed vibe' },
  'standard': { label: 'Standard', description: 'Balanced detection' },
  'beat-heavy': { label: 'Beat Heavy', description: 'More cuts, high energy' },
};

export function AudioUploader() {
  const {
    audio, setAudio, setAudioUrl, syncPoints, setSyncPoints, setAudioDuration,
    setSelectedSongName, analysisSettings, setAnalysisSettings
  } = useProjectStore();
  const { analyze, reanalyze, isAnalyzing, error: analysisError, summary } = useAudioAnalysis();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'extract' | 'search' | 'upload'>('extract');
  const [isExtracting, setIsExtracting] = useState(false);
  const [tiktokUrl, setTiktokUrl] = useState('');

  // Handle audio file drop/select
  const handleAudioFile = useCallback(
    async (file: File) => {
      setError(null);
      setAudio(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      await analyze(file);
    },
    [setAudio, setAudioUrl, analyze]
  );

  // Handle video file - extract audio from it
  const handleVideoFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsExtracting(true);

      try {
        const formData = new FormData();
        formData.append('video', file);

        const response = await fetch('/api/extract-audio/from-video', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to extract audio');
        }

        // Fetch the extracted audio
        const audioResponse = await fetch(data.path);
        const blob = await audioResponse.blob();
        const audioFile = new File([blob], data.filename, { type: 'audio/mpeg' });

        setAudio(audioFile);
        const url = URL.createObjectURL(audioFile);
        setAudioUrl(url);
        // Don't set song name for extracted videos - user will add audio in TikTok
        await analyze(audioFile);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to extract audio');
      } finally {
        setIsExtracting(false);
      }
    },
    [setAudio, setAudioUrl, analyze, setSelectedSongName]
  );

  // Handle file drop - detect if audio or video
  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;

      if (file.type.startsWith('audio/')) {
        await handleAudioFile(file);
      } else if (file.type.startsWith('video/')) {
        await handleVideoFile(file);
      } else {
        setError('Please drop an audio or video file');
      }
    },
    [handleAudioFile, handleVideoFile]
  );

  // Handle file select
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.type.startsWith('audio/')) {
        await handleAudioFile(file);
      } else if (file.type.startsWith('video/')) {
        await handleVideoFile(file);
      }
    },
    [handleAudioFile, handleVideoFile]
  );

  // Handle TikTok URL submit
  const handleTikTokDownload = async () => {
    if (!tiktokUrl.trim()) return;

    setError(null);
    setIsExtracting(true);

    try {
      const response = await fetch('/api/extract-audio/from-tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tiktokUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to download TikTok audio');
      }

      // Fetch the extracted audio
      const audioResponse = await fetch(data.path);
      const blob = await audioResponse.blob();
      const audioFile = new File([blob], data.filename, { type: 'audio/mpeg' });

      setAudio(audioFile);
      const url = URL.createObjectURL(audioFile);
      setAudioUrl(url);
      // Don't set song name - the audio is already extracted from the TikTok
      await analyze(audioFile);
      setTiktokUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download TikTok');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleRemove = () => {
    setAudio(null);
    setAudioUrl(null);
    setSyncPoints([]);
    setAudioDuration(null);
  };

  // Handle music type change and re-analyze
  const handleMusicTypeChange = async (musicType: MusicType) => {
    const newSettings = { musicType };
    setAnalysisSettings(newSettings);
    await reanalyze(newSettings);
  };

  if (audio) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center">
              <span className="text-primary-400">&#9835;</span>
            </div>
            <div>
              <p className="text-white font-medium">{audio.name}</p>
              <p className="text-gray-400 text-sm">
                {(audio.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          <button
            onClick={handleRemove}
            className="text-gray-400 hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        </div>

        {/* Music Type Selector */}
        <div className="bg-gray-800/50 rounded-lg p-3">
          <p className="text-gray-400 text-xs mb-2">Detection Sensitivity</p>
          <div className="flex gap-2">
            {(Object.keys(MUSIC_TYPE_LABELS) as MusicType[]).map((type) => (
              <button
                key={type}
                onClick={() => handleMusicTypeChange(type)}
                disabled={isAnalyzing}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  analysisSettings.musicType === type
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={MUSIC_TYPE_LABELS[type].description}
              >
                {MUSIC_TYPE_LABELS[type].label}
              </button>
            ))}
          </div>
          <p className="text-gray-500 text-xs mt-2">
            {MUSIC_TYPE_LABELS[analysisSettings.musicType].description}
          </p>
        </div>

        {/* Analysis summary */}
        {isAnalyzing ? (
          <div className="bg-gray-800/50 rounded-lg p-3 text-sm">
            <p className="text-primary-400">Re-analyzing audio...</p>
          </div>
        ) : summary && (
          <div className="bg-gray-800/50 rounded-lg p-3 text-sm">
            <p className="text-gray-300">
              <span className="text-primary-400 font-medium">{syncPoints.length}</span> sync points detected
            </p>
            <p className="text-gray-500 mt-1">{summary}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveTab('extract')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'extract'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          From Video/TikTok
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'search'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          YouTube Search
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'upload'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Audio File
        </button>
      </div>

      {activeTab === 'extract' ? (
        <div className="space-y-4">
          {/* TikTok URL input */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
              </svg>
              <span className="text-white font-medium">TikTok URL</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tiktokUrl}
                onChange={(e) => setTiktokUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTikTokDownload()}
                placeholder="Paste TikTok video URL..."
                className="flex-1 bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white text-sm placeholder-gray-400"
              />
              <button
                onClick={handleTikTokDownload}
                disabled={isExtracting || !tiktokUrl.trim()}
                className="bg-primary-500 hover:bg-primary-600 disabled:bg-gray-600 text-white px-4 py-2 rounded transition-colors text-sm whitespace-nowrap"
              >
                {isExtracting ? 'Extracting...' : 'Get Audio'}
              </button>
            </div>
          </div>

          {/* Video drop zone */}
          <div
            onDrop={handleFileDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-primary-500 transition-colors cursor-pointer"
          >
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={handleFileSelect}
              className="hidden"
              id="video-upload"
            />
            <label htmlFor="video-upload" className="cursor-pointer">
              <div className="text-gray-400">
                <span className="text-4xl block mb-2">&#127916;</span>
                <p>Drop a video to extract audio</p>
                <p className="text-sm text-gray-500 mt-1">MP4, MOV, or any video file</p>
              </div>
            </label>
          </div>
        </div>
      ) : activeTab === 'search' ? (
        <SongSearch />
      ) : (
        <>
          {/* Audio file drop zone */}
          <div
            onDrop={handleFileDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-primary-500 transition-colors cursor-pointer"
          >
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              className="hidden"
              id="audio-upload"
            />
            <label htmlFor="audio-upload" className="cursor-pointer">
              <div className="text-gray-400">
                <span className="text-4xl block mb-2">&#128193;</span>
                <p>Drop an audio file here or click to browse</p>
                <p className="text-sm text-gray-500 mt-1">MP3, WAV, M4A supported</p>
              </div>
            </label>
          </div>
        </>
      )}

      {/* Status messages */}
      {(isAnalyzing || isExtracting) && (
        <p className="text-primary-400 text-sm">
          {isExtracting ? 'Extracting audio from video...' : 'Analyzing audio for sync points...'}
        </p>
      )}
      {(error || analysisError) && (
        <p className="text-red-400 text-sm">{error || analysisError}</p>
      )}
    </div>
  );
}
