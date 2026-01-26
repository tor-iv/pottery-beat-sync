'use client';

import { useCallback, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useBeatDetection } from '@/hooks/useBeatDetection';
import { SongSearch } from './SongSearch';

export function AudioUploader() {
  const { audio, setAudio, setAudioUrl } = useProjectStore();
  const { detectBeats, isDetecting } = useBeatDetection();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'upload'>('search');

  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setError(null);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) {
        setAudio(file);
        const url = URL.createObjectURL(file);
        setAudioUrl(url);
        await detectBeats(file);
      } else {
        setError('Please drop an audio file');
      }
    },
    [setAudio, setAudioUrl, detectBeats]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const file = e.target.files?.[0];
      if (file) {
        setAudio(file);
        const url = URL.createObjectURL(file);
        setAudioUrl(url);
        await detectBeats(file);
      }
    },
    [setAudio, setAudioUrl, detectBeats]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (audio) {
    return (
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
          onClick={() => {
            setAudio(null);
            setAudioUrl(null);
          }}
          className="text-gray-400 hover:text-red-400 transition-colors"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'search'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Find a Song
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'upload'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Upload File
        </button>
      </div>

      {activeTab === 'search' ? (
        <SongSearch />
      ) : (
        <>
          {/* Drag and drop area */}
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
      {isDetecting && (
        <p className="text-primary-400 text-sm">Detecting beats...</p>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
