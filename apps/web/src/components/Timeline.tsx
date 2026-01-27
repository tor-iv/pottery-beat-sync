'use client';

import { useEffect, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { getSyncPointColor } from '@/lib/audio-analysis';
import { sortVideosByStage } from '@/lib/pottery-stages';

export function Timeline() {
  const {
    videos,
    syncPoints,
    audioDuration,
    outputLength,
    timeline,
    setTimeline,
    videoMode,
    teaserDuration,
  } = useProjectStore();

  // Calculate timeline based on sync points
  const generatedTimeline = useMemo(() => {
    if (syncPoints.length === 0 || videos.length === 0 || !audioDuration) {
      return [];
    }

    // Filter sync points within output length
    const relevantSyncPoints = syncPoints.filter(sp => sp.time < outputLength);

    if (relevantSyncPoints.length === 0) {
      return [];
    }

    // Find finishing segment for teaser mode
    const finishingVideo = videos.find((v) => v.label === 'Finishing');
    const nonFinishingVideos = videos.filter((v) => v.label !== 'Finishing');

    // Collect all snippets from segments (excluding Finishing for teaser mode)
    // Sort by pottery stage order so timeline progresses through the process
    const videosForTimeline = videoMode === 'teaser' && finishingVideo ? nonFinishingVideos : videos;
    const sortedVideos = sortVideosByStage(videosForTimeline);
    const allSnippets = sortedVideos.flatMap((v) =>
      v.snippets.map((s) => ({ ...s, segmentLabel: v.label }))
    );

    const timelineEntries: typeof timeline = [];

    // In teaser mode, start with the finishing shot
    let startIndex = 0;
    if (videoMode === 'teaser' && finishingVideo && finishingVideo.snippets.length > 0) {
      const firstSyncTime = relevantSyncPoints[0]?.time || 0;
      const teaserEndTime = Math.min(teaserDuration, relevantSyncPoints[1]?.time || teaserDuration);

      timelineEntries.push({
        snippetId: finishingVideo.snippets[0].id,
        syncPointIndex: 0,
        startTime: 0,
        endTime: teaserEndTime,
      });

      // Find the first sync point after teaserDuration
      startIndex = relevantSyncPoints.findIndex(sp => sp.time >= teaserDuration);
      if (startIndex === -1) startIndex = relevantSyncPoints.length;
    }

    // Map each sync point to a video snippet
    // Each cut lasts from one sync point to the next
    for (let i = startIndex; i < relevantSyncPoints.length; i++) {
      const currentPoint = relevantSyncPoints[i];
      const nextPoint = relevantSyncPoints[i + 1];

      // End time is either the next sync point or the output length
      const endTime = nextPoint ? nextPoint.time : Math.min(outputLength, audioDuration);

      // Skip very short segments (< 100ms)
      if (endTime - currentPoint.time < 0.1) continue;

      // Assign snippets in order, cycling through them
      const snippetIndex = (timelineEntries.length - (videoMode === 'teaser' ? 1 : 0)) % Math.max(1, allSnippets.length);

      // Use actual snippet if available, otherwise create placeholder
      const snippetId = allSnippets.length > 0
        ? allSnippets[snippetIndex].id
        : `placeholder-${snippetIndex}-${i}`;

      timelineEntries.push({
        snippetId,
        syncPointIndex: i,
        startTime: currentPoint.time,
        endTime,
      });
    }

    return timelineEntries;
  }, [videos, syncPoints, audioDuration, outputLength, videoMode, teaserDuration]);

  useEffect(() => {
    setTimeline(generatedTimeline);
  }, [generatedTimeline, setTimeline]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (syncPoints.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8">
        Upload audio to generate timeline
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Timeline visualization */}
      <div className="relative h-24 bg-gray-900/50 rounded overflow-hidden">
        {/* Sync point markers */}
        <div className="absolute inset-0">
          {syncPoints
            .filter(sp => sp.time < outputLength)
            .map((point, index) => (
              <div
                key={`marker-${index}`}
                className="absolute top-0 w-0.5 h-2"
                style={{
                  left: `${(point.time / outputLength) * 100}%`,
                  backgroundColor: getSyncPointColor(point.type),
                }}
              />
            ))}
        </div>

        {/* Timeline entries */}
        <div className="absolute inset-x-0 top-3 bottom-0 flex">
          {timeline.map((entry, index) => {
            const video = videos.find((v) =>
              v.snippets.some((s) => s.id === entry.snippetId)
            ) || videos[index % Math.max(1, videos.length)];

            const startPercent = (entry.startTime / outputLength) * 100;
            const widthPercent = ((entry.endTime - entry.startTime) / outputLength) * 100;

            // Color based on segment label
            const colors: Record<string, string> = {
              Centering: 'bg-blue-500',
              Coning: 'bg-green-500',
              Opening: 'bg-yellow-500',
              Pulling: 'bg-orange-500',
              Shaping: 'bg-red-500',
              Finishing: 'bg-purple-500',
              Other: 'bg-gray-500',
            };

            const syncPoint = syncPoints[entry.syncPointIndex];
            const syncColor = syncPoint ? getSyncPointColor(syncPoint.type) : '#6b7280';

            return (
              <div
                key={index}
                className={`absolute h-full ${colors[video?.label || 'Other']} opacity-80 border-r border-gray-900 flex flex-col items-center justify-center overflow-hidden`}
                style={{
                  left: `${startPercent}%`,
                  width: `${widthPercent}%`,
                }}
                title={`${video?.label || 'Unknown'} | ${formatTime(entry.startTime)} - ${formatTime(entry.endTime)} | ${syncPoint?.type || 'cut'}`}
              >
                {/* Sync point type indicator */}
                <div
                  className="w-2 h-2 rounded-full mb-1"
                  style={{ backgroundColor: syncColor }}
                />
                <span className="text-[10px] text-white font-medium truncate px-1">
                  {video?.label?.slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline info */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>0:00</span>
        <span>
          {timeline.length} cuts | {formatTime(outputLength)} output
          {videoMode === 'teaser' && ' | Teaser mode'}
        </span>
        <span>{formatTime(outputLength)}</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {videos.map((video) => {
          const colors: Record<string, string> = {
            Centering: 'bg-blue-500',
            Coning: 'bg-green-500',
            Opening: 'bg-yellow-500',
            Pulling: 'bg-orange-500',
            Shaping: 'bg-red-500',
            Finishing: 'bg-purple-500',
            Other: 'bg-gray-500',
          };
          return (
            <div key={video.id} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded ${colors[video.label]}`} />
              <span className="text-xs text-gray-400">{video.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
