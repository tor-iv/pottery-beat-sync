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
    currentPlaybackTime,
    isPreviewPlaying,
  } = useProjectStore();

  // Effective output length is the minimum of selected length and actual audio duration
  const effectiveLength = audioDuration ? Math.min(outputLength, audioDuration) : outputLength;

  // Calculate timeline based on sync points
  const generatedTimeline = useMemo(() => {
    if (syncPoints.length === 0 || videos.length === 0 || !audioDuration) {
      return [];
    }

    // Filter sync points within effective length (respects audio duration)
    const relevantSyncPoints = syncPoints.filter(sp => sp.time < effectiveLength);

    if (relevantSyncPoints.length === 0) {
      return [];
    }

    // Find finishing segment for teaser mode
    const finishingVideo = videos.find((v) => v.label === 'Finishing');
    const nonFinishingVideos = videos.filter((v) => v.label !== 'Finishing');

    // Sort videos by pottery stage order so timeline progresses through the process
    const videosForTimeline = videoMode === 'teaser' && finishingVideo ? nonFinishingVideos : videos;
    const sortedVideos = sortVideosByStage(videosForTimeline);

    const timelineEntries: typeof timeline = [];

    // In teaser mode, start with the finishing shot
    let startIndex = 0;
    if (videoMode === 'teaser' && finishingVideo && finishingVideo.snippets.length > 0) {
      const teaserEndTime = Math.min(teaserDuration, relevantSyncPoints[1]?.time || teaserDuration);

      timelineEntries.push({
        snippetId: finishingVideo.snippets[0].id,
        videoId: finishingVideo.id,
        sourcePosition: 0,
        syncPointIndex: 0,
        startTime: 0,
        endTime: teaserEndTime,
      });

      // Find the first sync point after teaserDuration
      startIndex = relevantSyncPoints.findIndex(sp => sp.time >= teaserDuration);
      if (startIndex === -1) startIndex = relevantSyncPoints.length;
    }

    // Count remaining sync points (excluding teaser)
    const remainingSyncPoints = relevantSyncPoints.slice(startIndex);
    const numSyncPoints = remainingSyncPoints.length;

    if (numSyncPoints === 0 || sortedVideos.length === 0) {
      return timelineEntries;
    }

    // Calculate total duration of all videos
    const totalVideoDuration = sortedVideos.reduce((sum, v) => sum + v.duration, 0);

    // Allocate sync points to each video proportionally based on duration
    // Each video gets at least 1 sync point if there are enough sync points
    const videoAllocations: { video: typeof sortedVideos[0]; syncPointCount: number }[] = [];
    let allocatedCount = 0;

    for (let i = 0; i < sortedVideos.length; i++) {
      const video = sortedVideos[i];
      const proportion = video.duration / totalVideoDuration;
      // For the last video, give it all remaining sync points to avoid rounding issues
      const isLast = i === sortedVideos.length - 1;
      const count = isLast
        ? numSyncPoints - allocatedCount
        : Math.max(1, Math.round(proportion * numSyncPoints));

      // Don't allocate more than remaining
      const actualCount = Math.min(count, numSyncPoints - allocatedCount);
      if (actualCount > 0) {
        videoAllocations.push({ video, syncPointCount: actualCount });
        allocatedCount += actualCount;
      }
    }

    // Now create timeline entries: for each video's allocation, distribute clips across the video
    let syncPointIdx = 0;
    for (const allocation of videoAllocations) {
      const { video, syncPointCount } = allocation;
      const videoDuration = video.duration;

      // Calculate distributed source positions within this video
      // For N clips from a video of duration D, positions are at: 0, D/(N), 2*D/(N), ... (with safety margin at end)
      const safetyMargin = 2; // Don't go within 2 seconds of video end
      const usableDuration = Math.max(0, videoDuration - safetyMargin);

      for (let clipIdx = 0; clipIdx < syncPointCount; clipIdx++) {
        const actualSyncPointIndex = startIndex + syncPointIdx;
        if (actualSyncPointIndex >= relevantSyncPoints.length) break;

        const currentPoint = relevantSyncPoints[actualSyncPointIndex];
        const nextPoint = relevantSyncPoints[actualSyncPointIndex + 1];

        // End time is either the next sync point or the effective length
        const endTime = nextPoint ? nextPoint.time : effectiveLength;

        // Skip very short segments (< 100ms)
        if (endTime - currentPoint.time < 0.1) {
          syncPointIdx++;
          clipIdx--; // Retry this allocation slot
          continue;
        }

        // Calculate source position: distribute evenly across the video
        const sourcePosition = syncPointCount > 1
          ? (clipIdx / (syncPointCount - 1)) * usableDuration
          : 0; // If only 1 clip, start at beginning

        // Use first snippet ID for compatibility, or create placeholder
        const snippetId = video.snippets.length > 0
          ? video.snippets[0].id
          : `placeholder-${video.id}-${clipIdx}`;

        timelineEntries.push({
          snippetId,
          videoId: video.id,
          sourcePosition,
          syncPointIndex: actualSyncPointIndex,
          startTime: currentPoint.time,
          endTime,
        });

        syncPointIdx++;
      }
    }

    return timelineEntries;
  }, [videos, syncPoints, audioDuration, effectiveLength, videoMode, teaserDuration]);

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
            .filter(sp => sp.time < effectiveLength)
            .map((point, index) => (
              <div
                key={`marker-${index}`}
                className="absolute top-0 w-0.5 h-2"
                style={{
                  left: `${(point.time / effectiveLength) * 100}%`,
                  backgroundColor: getSyncPointColor(point.type),
                }}
              />
            ))}
        </div>

        {/* Playhead indicator */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary-500 z-20 pointer-events-none"
          style={{
            left: `${(currentPlaybackTime / effectiveLength) * 100}%`,
            boxShadow: isPreviewPlaying ? '0 0 8px rgba(249, 115, 22, 0.6)' : 'none',
            transition: isPreviewPlaying ? 'none' : 'left 0.1s ease-out',
          }}
        >
          {/* Playhead top marker */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-primary-500" />
        </div>

        {/* Timeline entries */}
        <div className="absolute inset-x-0 top-3 bottom-0 flex">
          {timeline.map((entry, index) => {
            const video = videos.find((v) => v.id === entry.videoId)
              || videos[index % Math.max(1, videos.length)];

            const startPercent = (entry.startTime / effectiveLength) * 100;
            const widthPercent = ((entry.endTime - entry.startTime) / effectiveLength) * 100;

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
          {timeline.length} cuts | {formatTime(effectiveLength)} output
          {videoMode === 'teaser' && ' | Teaser mode'}
          {audioDuration && audioDuration < outputLength && ` (audio: ${formatTime(audioDuration)})`}
        </span>
        <span>{formatTime(effectiveLength)}</span>
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
