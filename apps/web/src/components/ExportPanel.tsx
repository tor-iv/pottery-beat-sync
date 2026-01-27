'use client';

import { useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';

export function ExportPanel() {
  const {
    videos,
    audio,
    timeline,
    outputLength,
    isExporting,
    exportProgress,
    setExporting,
    setExportProgress,
    videoMode,
    teaserDuration,
    syncPoints,
    exportAudioMode,
    setExportAudioMode,
    selectedSongName,
  } = useProjectStore();
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canExport = videos.length > 0 && audio && timeline.length > 0;

  const handleExport = async () => {
    if (!canExport) return;

    setError(null);
    setExporting(true);
    setExportProgress(0);

    try {
      const formData = new FormData();

      // Add audio (always needed for timing, but may not be included in output)
      formData.append('audio', audio);

      // Add videos
      videos.forEach((video, index) => {
        formData.append(`video_${index}`, video.file);
        formData.append(`video_${index}_label`, video.label);
      });

      // Add timeline and settings
      formData.append('timeline', JSON.stringify(timeline));
      formData.append('outputLength', outputLength.toString());
      formData.append('videoMode', videoMode);
      formData.append('teaserDuration', teaserDuration.toString());
      formData.append('syncPoints', JSON.stringify(syncPoints));
      formData.append('exportAudioMode', exportAudioMode);

      // Create EventSource for progress updates (use absolute URL for Safari compatibility)
      const progressSource = new EventSource(new URL('/api/export/progress', window.location.origin).href);
      progressSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setExportProgress(data.progress);
      };

      const response = await fetch('/api/export', {
        method: 'POST',
        body: formData,
      });

      progressSource.close();

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Export failed');
      }

      // Download the result
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pottery-beat-sync-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={!canExport}
        className="bg-primary-500 hover:bg-primary-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
      >
        Export
      </button>

      {/* Export Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold text-white mb-4">
              Export Video
            </h2>

            {isExporting ? (
              <div className="space-y-4">
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <p className="text-gray-400 text-center">
                  {exportProgress < 100
                    ? `Exporting... ${Math.round(exportProgress)}%`
                    : 'Export complete!'}
                </p>
              </div>
            ) : exportProgress === 100 ? (
              <div className="space-y-4">
                <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 text-center">
                  <p className="text-green-400 font-medium">Export Complete!</p>
                  {exportAudioMode === 'video-only' && selectedSongName && (
                    <div className="mt-3 text-left">
                      <p className="text-sm text-gray-300">Add this song in TikTok:</p>
                      <p className="text-white font-medium mt-1">{selectedSongName}</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setExportProgress(0);
                  }}
                  className="w-full bg-primary-500 hover:bg-primary-600 text-white py-2 rounded transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Audio Mode Toggle */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Audio Export</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setExportAudioMode('video-only')}
                      className={`px-3 py-2 rounded text-sm transition-colors ${
                        exportAudioMode === 'video-only'
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Video Only
                    </button>
                    <button
                      onClick={() => setExportAudioMode('include')}
                      className={`px-3 py-2 rounded text-sm transition-colors ${
                        exportAudioMode === 'include'
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      With Audio
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {exportAudioMode === 'video-only'
                      ? 'Add the song in TikTok for best algorithm performance'
                      : 'Audio will be included in the video file'}
                  </p>
                </div>

                {/* Song Reminder */}
                {exportAudioMode === 'video-only' && selectedSongName && (
                  <div className="bg-primary-500/20 border border-primary-500/50 rounded-lg p-3">
                    <p className="text-xs text-primary-300">Remember to add in TikTok:</p>
                    <p className="text-white font-medium text-sm">{selectedSongName}</p>
                  </div>
                )}

                {/* Export Details */}
                <div className="bg-gray-700/50 rounded p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Duration</span>
                    <span className="text-white">{outputLength} seconds</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Cuts</span>
                    <span className="text-white">{timeline.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Resolution</span>
                    <span className="text-white">1080x1920 (9:16)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Format</span>
                    <span className="text-white">MP4 (H.264)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Mode</span>
                    <span className="text-white">
                      {videoMode === 'teaser' ? 'Teaser' : 'Standard'}
                    </span>
                  </div>
                </div>

                {error && (
                  <p className="text-red-400 text-sm text-center">{error}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={!canExport}
                    className="flex-1 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-600 text-white py-2 rounded transition-colors"
                  >
                    Export
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
