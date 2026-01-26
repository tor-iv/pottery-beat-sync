'use client';

import { AudioUploader } from '@/components/AudioUploader';
import { VideoUploader } from '@/components/VideoUploader';
import { Waveform } from '@/components/Waveform';
import { Timeline } from '@/components/Timeline';
import { Preview } from '@/components/Preview';
import { ExportPanel } from '@/components/ExportPanel';
import { useProjectStore } from '@/stores/projectStore';

export default function EditorPage() {
  const { audio, videos, bpm } = useProjectStore();

  return (
    <main className="min-h-screen p-4">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary-400">
          PotteryBeatSync
        </h1>
        <div className="flex items-center gap-4">
          <button className="text-gray-300 hover:text-white transition-colors">
            Presets
          </button>
          <ExportPanel />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Audio and Video inputs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Audio Section */}
          <section className="bg-gray-800/50 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-200 mb-4">Audio</h2>
            <AudioUploader />
            {audio && (
              <div className="mt-4">
                <Waveform />
                {bpm && (
                  <p className="text-sm text-primary-400 mt-2">
                    {bpm} BPM detected
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Video Segments Section */}
          <section className="bg-gray-800/50 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-200 mb-4">
              Video Segments
            </h2>
            <VideoUploader />
          </section>

          {/* Timeline Section */}
          {videos.length > 0 && audio && (
            <section className="bg-gray-800/50 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">
                Timeline
              </h2>
              <Timeline />
            </section>
          )}
        </div>

        {/* Right column: Preview and Settings */}
        <div className="space-y-6">
          {/* Preview Section */}
          <section className="bg-gray-800/50 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-200 mb-4">
              Preview
            </h2>
            <Preview />
          </section>

          {/* Settings Section */}
          <section className="bg-gray-800/50 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-200 mb-4">
              Settings
            </h2>
            <SettingsPanel />
          </section>
        </div>
      </div>
    </main>
  );
}

function SettingsPanel() {
  const {
    outputLength,
    setOutputLength,
    cutsPerBeat,
    setCutsPerBeat,
    videoMode,
    setVideoMode,
    teaserDuration,
    setTeaserDuration,
    videos,
  } = useProjectStore();

  // Check if there's a "Finishing" segment for teaser mode
  const hasFinishingSegment = videos.some((v) => v.label === 'Finishing');

  return (
    <div className="space-y-4">
      {/* Video Mode Toggle */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Video Mode</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setVideoMode('standard')}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              videoMode === 'standard'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Standard
          </button>
          <button
            onClick={() => setVideoMode('teaser')}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              videoMode === 'teaser'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Teaser
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {videoMode === 'teaser'
            ? 'Shows finished pot first, then the making process'
            : 'Standard chronological editing'}
        </p>
      </div>

      {/* Teaser Duration (only shown in teaser mode) */}
      {videoMode === 'teaser' && (
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Reveal Duration (beats)
          </label>
          <select
            value={teaserDuration}
            onChange={(e) => setTeaserDuration(Number(e.target.value))}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          >
            <option value={2}>2 beats (quick flash)</option>
            <option value={4}>4 beats (recommended)</option>
            <option value={8}>8 beats (slow reveal)</option>
          </select>
          {!hasFinishingSegment && (
            <p className="text-xs text-yellow-400 mt-1">
              Add a &quot;Finishing&quot; segment for the teaser reveal
            </p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm text-gray-400 mb-2">
          Output Length
        </label>
        <select
          value={outputLength}
          onChange={(e) => setOutputLength(Number(e.target.value))}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
        >
          <option value={15}>15 seconds</option>
          <option value={30}>30 seconds</option>
          <option value={60}>60 seconds</option>
          <option value={90}>90 seconds</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">
          Cuts Per Beat
        </label>
        <select
          value={cutsPerBeat}
          onChange={(e) => setCutsPerBeat(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
        >
          <option value="variable">Variable (recommended)</option>
          <option value="1">Every beat</option>
          <option value="2">Every 2 beats</option>
          <option value="4">Every 4 beats</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">
          Snippet Selection
        </label>
        <select className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white">
          <option value="quality">Even + Quality filter (recommended)</option>
          <option value="even">Even distribution only</option>
          <option value="random">Random</option>
        </select>
      </div>
    </div>
  );
}
