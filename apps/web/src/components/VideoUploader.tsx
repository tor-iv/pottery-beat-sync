'use client';

import { useCallback, useState } from 'react';
import { useProjectStore, VideoSegment } from '@/stores/projectStore';

const SEGMENT_LABELS = [
  'Centering',
  'Coning',
  'Opening',
  'Pulling',
  'Shaping',
  'Finishing',
  'Other',
];

export function VideoUploader() {
  const { videos, addVideo, removeVideo, updateVideo, reorderVideos } =
    useProjectStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const processVideo = useCallback(
    async (file: File): Promise<VideoSegment> => {
      const id = crypto.randomUUID();

      // Create video element to get duration
      const video = document.createElement('video');
      video.preload = 'metadata';

      const duration = await new Promise<number>((resolve) => {
        video.onloadedmetadata = () => resolve(video.duration);
        video.src = URL.createObjectURL(file);
      });

      // Generate thumbnail via backend
      const formData = new FormData();
      formData.append('video', file);

      let thumbnailUrl: string | null = null;
      try {
        const response = await fetch('/api/analyze/thumbnail', {
          method: 'POST',
          body: formData,
        });
        if (response.ok) {
          const blob = await response.blob();
          thumbnailUrl = URL.createObjectURL(blob);
        }
      } catch {
        // Thumbnail generation failed, continue without it
      }

      return {
        id,
        file,
        name: file.name,
        label: 'Other',
        duration,
        thumbnailUrl,
        snippets: [],
      };
    },
    []
  );

  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsProcessing(true);

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('video/')
      );

      for (const file of files) {
        const segment = await processVideo(file);
        addVideo(segment);
      }

      setIsProcessing(false);
    },
    [processVideo, addVideo]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      setIsProcessing(true);

      const files = Array.from(e.target.files);

      for (const file of files) {
        const segment = await processVideo(file);
        addVideo(segment);
      }

      setIsProcessing(false);
    },
    [processVideo, addVideo]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSegmentDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleSegmentDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleSegmentDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (fromIndex !== toIndex) {
      reorderVideos(fromIndex, toIndex);
    }
    setDragOverIndex(null);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {videos.map((segment, index) => (
          <div
            key={segment.id}
            draggable
            onDragStart={(e) => handleSegmentDragStart(e, index)}
            onDragOver={(e) => handleSegmentDragOver(e, index)}
            onDrop={(e) => handleSegmentDrop(e, index)}
            className={`relative w-32 bg-gray-700 rounded-lg overflow-hidden cursor-move transition-transform ${
              dragOverIndex === index ? 'scale-105 ring-2 ring-primary-500' : ''
            }`}
          >
            {/* Thumbnail */}
            <div className="aspect-video bg-gray-800 flex items-center justify-center">
              {segment.thumbnailUrl ? (
                <img
                  src={segment.thumbnailUrl}
                  alt={segment.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-500 text-3xl">&#127909;</span>
              )}
            </div>

            {/* Info */}
            <div className="p-2">
              <select
                value={segment.label}
                onChange={(e) =>
                  updateVideo(segment.id, { label: e.target.value })
                }
                className="w-full bg-gray-600 border-none rounded text-xs text-white py-1 px-1"
              >
                {SEGMENT_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="text-gray-400 text-xs mt-1 text-center">
                {formatDuration(segment.duration)}
              </p>
            </div>

            {/* Remove button */}
            <button
              onClick={() => removeVideo(segment.id)}
              className="absolute top-1 right-1 w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-full text-white text-xs flex items-center justify-center"
            >
              &#10005;
            </button>
          </div>
        ))}

        {/* Drop zone / Add button */}
        <div
          onDrop={handleFileDrop}
          onDragOver={handleDragOver}
          className="w-32 aspect-[3/4] border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center hover:border-primary-500 transition-colors cursor-pointer"
        >
          <input
            type="file"
            accept="video/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            id="video-upload"
          />
          <label
            htmlFor="video-upload"
            className="cursor-pointer text-center p-2"
          >
            <span className="text-3xl text-gray-500 block mb-1">+</span>
            <span className="text-gray-500 text-xs">Drop videos here</span>
          </label>
        </div>
      </div>

      {isProcessing && (
        <p className="text-primary-400 text-sm">Processing videos...</p>
      )}

      {videos.length > 0 && (
        <p className="text-gray-500 text-xs">
          Drag segments to reorder. Total: {videos.length} segments,{' '}
          {formatDuration(videos.reduce((acc, v) => acc + v.duration, 0))} of
          footage
        </p>
      )}
    </div>
  );
}
