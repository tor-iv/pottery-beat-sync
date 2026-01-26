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
    bpm,
  } = useProjectStore();
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canExport = videos.length > 0 && audio && timeline.length > 0;

  const handleExport = async () => {
    if (!canExport) return;

    setError(null);
    setExporting(true);
    setExportProgress(0);
    setShowModal(true);

    try {
      const formData = new FormData();

      // Add audio
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
      formData.append('bpm', (bpm || 120).toString());

      // Create EventSource for progress updates
      const progressSource = new EventSource('/api/export/progress');
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
            ) : (
              <div className="space-y-4">
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
                      {videoMode === 'teaser' ? 'Teaser (finished pot first)' : 'Standard'}
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
                    Export Video
                  </button>
                </div>
              </div>
            )}

            {exportProgress === 100 && (
              <button
                onClick={() => {
                  setShowModal(false);
                  setExportProgress(0);
                }}
                className="w-full mt-4 bg-primary-500 hover:bg-primary-600 text-white py-2 rounded transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
