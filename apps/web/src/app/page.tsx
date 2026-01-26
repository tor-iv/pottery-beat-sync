'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold mb-4 text-primary-400">
          PotteryBeatSync
        </h1>
        <p className="text-xl text-gray-300 mb-8">
          Transform your pottery sessions into attention-grabbing TikTok videos
          with automatic beat-synced cuts.
        </p>
        <Link
          href="/editor"
          className="inline-block bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 px-8 rounded-lg transition-colors text-lg"
        >
          Start New Project
        </Link>
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl">
        <div className="bg-gray-800/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-primary-300 mb-2">
            Upload Segments
          </h3>
          <p className="text-gray-400 text-sm">
            Drop your pottery video segments - centering, coning, pulling, shaping, finishing.
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-primary-300 mb-2">
            Add Music
          </h3>
          <p className="text-gray-400 text-sm">
            Upload audio or paste a TikTok URL. Beats are detected automatically.
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-primary-300 mb-2">
            Export
          </h3>
          <p className="text-gray-400 text-sm">
            Preview and export your beat-synced video, optimized for TikTok.
          </p>
        </div>
      </div>
    </main>
  );
}
