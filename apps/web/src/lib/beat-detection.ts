/**
 * Beat detection utilities
 * Wraps web-audio-beat-detector with additional processing
 */

export interface BeatAnalysis {
  bpm: number;
  beats: Array<{
    time: number;
    strength: number;
  }>;
  offset: number;
}

/**
 * Analyze audio buffer for BPM and beat positions
 */
export async function analyzeBeats(
  audioBuffer: AudioBuffer,
  maxDuration?: number
): Promise<BeatAnalysis> {
  const { analyze } = await import('web-audio-beat-detector');

  try {
    const result = await analyze(audioBuffer);
    // The library returns { bpm: number, offset: number } but TypeScript types may be wrong
    const bpm = typeof result === 'number' ? result : (result as { bpm: number; offset: number }).bpm;
    const offset = typeof result === 'number' ? 0 : (result as { bpm: number; offset: number }).offset || 0;

    // Generate beat timestamps
    const beatInterval = 60 / bpm;
    const duration = maxDuration || audioBuffer.duration;
    const beats: BeatAnalysis['beats'] = [];

    let time = offset;
    while (time < duration) {
      beats.push({
        time,
        strength: 1,
      });
      time += beatInterval;
    }

    return {
      bpm: Math.round(bpm),
      beats,
      offset,
    };
  } catch (error) {
    console.warn('Beat detection failed, using fallback:', error);

    // Fallback to 120 BPM
    const bpm = 120;
    const beatInterval = 60 / bpm;
    const duration = maxDuration || audioBuffer.duration;
    const beats: BeatAnalysis['beats'] = [];

    let time = 0;
    while (time < duration) {
      beats.push({
        time,
        strength: 1,
      });
      time += beatInterval;
    }

    return {
      bpm,
      beats,
      offset: 0,
    };
  }
}

/**
 * Generate variable cut durations based on beat pattern
 * Returns array of durations in beats (1, 2, or 4)
 */
export function generateCutPattern(
  totalBeats: number,
  style: 'variable' | '1' | '2' | '4' = 'variable'
): number[] {
  if (style !== 'variable') {
    const beatsPerCut = parseInt(style);
    const cuts: number[] = [];
    let remaining = totalBeats;
    while (remaining > 0) {
      const duration = Math.min(beatsPerCut, remaining);
      cuts.push(duration);
      remaining -= duration;
    }
    return cuts;
  }

  // Variable pattern: mix of 1, 2, and 4 beat cuts
  // Creates more dynamic feeling
  const patterns = [
    [1, 1, 2, 4], // Build up
    [2, 2, 1, 1, 2], // Steady with burst
    [4, 2, 1, 1], // Slow to fast
    [1, 2, 1, 2, 2], // Alternating
  ];

  const cuts: number[] = [];
  let remaining = totalBeats;
  let patternIndex = 0;

  while (remaining > 0) {
    const pattern = patterns[patternIndex % patterns.length];
    for (const duration of pattern) {
      if (remaining <= 0) break;
      const actualDuration = Math.min(duration, remaining);
      cuts.push(actualDuration);
      remaining -= actualDuration;
    }
    patternIndex++;
  }

  return cuts;
}

/**
 * Map cuts to beat timestamps
 */
export function mapCutsToBeats(
  cuts: number[],
  beats: BeatAnalysis['beats'],
  bpm: number
): Array<{ startTime: number; duration: number; beatIndex: number }> {
  const beatDuration = 60 / bpm;
  const result: Array<{ startTime: number; duration: number; beatIndex: number }> = [];

  let beatIndex = 0;
  for (const cutDuration of cuts) {
    if (beatIndex >= beats.length) break;

    result.push({
      startTime: beats[beatIndex].time,
      duration: cutDuration * beatDuration,
      beatIndex,
    });

    beatIndex += cutDuration;
  }

  return result;
}
