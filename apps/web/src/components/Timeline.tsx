'use client';

import { useEffect, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';

export function Timeline() {
  const { videos, beats, outputLength, cutsPerBeat, bpm, timeline, setTimeline, videoMode, teaserDuration } =
    useProjectStore();

  // Calculate timeline based on beats and settings
  const generatedTimeline = useMemo(() => {
    if (!bpm || beats.length === 0 || videos.length === 0) {
      return [];
    }

    const beatDuration = 60 / bpm;
    const totalBeats = Math.floor(outputLength / beatDuration);
    const beatsToUse = beats.slice(0, totalBeats);

    // Determine cut pattern based on cutsPerBeat setting
    let cutPattern: number[];
    if (cutsPerBeat === 'variable') {
      // Variable: mix of 1, 2, and 4 beat cuts
      cutPattern = [1, 2, 1, 4, 2, 1, 1, 2];
    } else {
      cutPattern = [parseInt(cutsPerBeat)];
    }

    // Find finishing segment for teaser mode
    const finishingVideo = videos.find((v) => v.label === 'Finishing');
    const nonFinishingVideos = videos.filter((v) => v.label !== 'Finishing');

    // Collect all snippets from segments (excluding Finishing for teaser mode)
    const videosForTimeline = videoMode === 'teaser' && finishingVideo ? nonFinishingVideos : videos;
    const allSnippets = videosForTimeline.flatMap((v) =>
      v.snippets.map((s) => ({ ...s, segmentLabel: v.label }))
    );

    const timelineEntries: typeof timeline = [];
    let beatIndex = 0;

    // In teaser mode, start with the finishing shot
    if (videoMode === 'teaser' && finishingVideo) {
      timelineEntries.push({
        snippetId: `teaser-reveal-${finishingVideo.id}`,
        beatIndex: 0,
        duration: teaserDuration,
      });
      beatIndex = teaserDuration;
    }

    // If no snippets yet, create placeholder timeline
    if (allSnippets.length === 0) {
      let patternIndex = 0;
      const videosToUse = videoMode === 'teaser' && finishingVideo ? nonFinishingVideos : videos;

      while (beatIndex < beatsToUse.length) {
        const duration = cutPattern[patternIndex % cutPattern.length];
        const videoIndex = (timelineEntries.length - (videoMode === 'teaser' ? 1 : 0)) % Math.max(1, videosToUse.length);

        timelineEntries.push({
          snippetId: `placeholder-${videoIndex}-${timelineEntries.length}`,
          beatIndex,
          duration,
        });

        beatIndex += duration;
        patternIndex++;
      }

      return timelineEntries;
    }

    // Map snippets to beats
    let snippetIndex = 0;
    let patternIndex = 0;

    while (beatIndex < beatsToUse.length && snippetIndex < allSnippets.length) {
      const duration = cutPattern[patternIndex % cutPattern.length];
      const snippet = allSnippets[snippetIndex % allSnippets.length];

      timelineEntries.push({
        snippetId: snippet.id,
        beatIndex,
        duration,
      });

      beatIndex += duration;
      snippetIndex++;
      patternIndex++;
    }

    return timelineEntries;
  }, [videos, beats, outputLength, cutsPerBeat, bpm, videoMode, teaserDuration]);

  useEffect(() => {
    setTimeline(generatedTimeline);
  }, [generatedTimeline, setTimeline]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!bpm || beats.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8">
        Upload audio to generate timeline
      </div>
    );
  }

  const beatDuration = 60 / bpm;

  return (
    <div className="space-y-4">
      {/* Timeline visualization */}
      <div className="relative h-20 bg-gray-900/50 rounded overflow-hidden">
        {/* Beat grid */}
        <div className="absolute inset-0 flex">
          {beats.slice(0, Math.floor(outputLength / beatDuration)).map((_, index) => (
            <div
              key={index}
              className="flex-shrink-0 border-r border-gray-700/50"
              style={{ width: `${(beatDuration / outputLength) * 100}%` }}
            />
          ))}
        </div>

        {/* Timeline entries */}
        <div className="absolute inset-0 flex">
          {timeline.map((entry, index) => {
            const video = videos.find((v) =>
              v.snippets.some((s) => s.id === entry.snippetId)
            ) || videos[index % videos.length];

            const widthPercent = (entry.duration * beatDuration / outputLength) * 100;

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

            return (
              <div
                key={index}
                className={`flex-shrink-0 h-full ${colors[video?.label || 'Other']} opacity-80 border-r border-gray-900 flex items-center justify-center overflow-hidden`}
                style={{ width: `${widthPercent}%` }}
              >
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
