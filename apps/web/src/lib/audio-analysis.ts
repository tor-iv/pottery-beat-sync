/**
 * Advanced audio analysis using Essentia.js
 * Detects meaningful sync points: beats, onsets, drops, transitions
 */

export type SyncPointType = 'drop' | 'bass' | 'snare' | 'hit' | 'build' | 'transition' | 'vocal' | 'pause' | 'resume' | 'chorus' | 'verse';

export interface SyncPoint {
  time: number;
  type: SyncPointType;
  intensity: number; // 0-1, how impactful this moment is
}

export interface AudioAnalysis {
  syncPoints: SyncPoint[];
  duration: number;
  bpm: number | null;
  averageEnergy: number;
}

let essentiaInstance: any = null;
let EssentiaWASM: any = null;

/**
 * Initialize Essentia.js (loads WASM module)
 */
async function initEssentia() {
  if (essentiaInstance) return essentiaInstance;

  try {
    const Essentia = await import('essentia.js');

    // Load the WASM module
    EssentiaWASM = await Essentia.EssentiaWASM();
    essentiaInstance = new Essentia.Essentia(EssentiaWASM);

    return essentiaInstance;
  } catch (error) {
    console.warn('Essentia.js failed to load, falling back to basic analysis:', error);
    return null;
  }
}

/**
 * Analyze audio buffer for meaningful sync points
 */
export async function analyzeAudio(audioBuffer: AudioBuffer): Promise<AudioAnalysis> {
  const essentia = await initEssentia();

  if (essentia) {
    return analyzeWithEssentia(audioBuffer, essentia);
  } else {
    return analyzeBasic(audioBuffer);
  }
}

/**
 * Advanced analysis using Essentia.js
 */
async function analyzeWithEssentia(audioBuffer: AudioBuffer, essentia: any): Promise<AudioAnalysis> {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const duration = audioBuffer.duration;

  // Convert to Essentia vector
  const signal = essentia.arrayToVector(channelData);

  const syncPoints: SyncPoint[] = [];
  let bpm: number | null = null;

  try {
    // 1. Beat tracking with RhythmExtractor
    const rhythmResult = essentia.RhythmExtractor2013(signal);
    bpm = Math.round(rhythmResult.bpm);

    // Get beat positions (these are actual detected beats, not uniform)
    const beatPositions: number[] = essentia.vectorToArray(rhythmResult.ticks);

    // Add beats as sync points with varying intensity based on strength
    for (let i = 0; i < beatPositions.length; i++) {
      const time = beatPositions[i];
      if (time < duration) {
        // Every 4th beat is stronger (downbeat)
        const isDownbeat = i % 4 === 0;
        syncPoints.push({
          time,
          type: isDownbeat ? 'drop' : 'hit',
          intensity: isDownbeat ? 0.9 : 0.5,
        });
      }
    }
  } catch (e) {
    console.warn('Beat tracking failed:', e);
  }

  try {
    // 2. Onset detection (transients - drum hits, note starts)
    const onsets = essentia.OnsetDetection(signal, 'complex');
    const onsetTimes: number[] = essentia.vectorToArray(onsets.onsetDetections);

    // Frame to time conversion (default hop size is 512)
    const hopSize = 512;
    for (const frame of onsetTimes) {
      const time = (frame * hopSize) / sampleRate;
      if (time < duration && !syncPoints.some(p => Math.abs(p.time - time) < 0.05)) {
        syncPoints.push({
          time,
          type: 'hit',
          intensity: 0.7,
        });
      }
    }
  } catch (e) {
    console.warn('Onset detection failed:', e);
  }

  try {
    // 3. Energy analysis for drops, builds, and segment detection
    const frameSize = 2048;
    const hopSize = 1024;
    const frames = essentia.FrameGenerator(signal, frameSize, hopSize);

    const energies: number[] = [];
    const spectralCentroids: number[] = [];

    for (let frame of frames) {
      const energy = essentia.Energy(frame);
      energies.push(energy.energy);

      // Spectral centroid helps distinguish verse (lower) from chorus (higher)
      try {
        const spectrum = essentia.Spectrum(frame);
        const centroid = essentia.Centroid(spectrum.spectrum);
        spectralCentroids.push(centroid.centroid);
      } catch {
        spectralCentroids.push(0);
      }
    }

    // Find energy peaks (potential drops)
    const maxEnergy = Math.max(...energies);
    const meanEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
    const threshold = meanEnergy + (maxEnergy - meanEnergy) * 0.7;

    for (let i = 2; i < energies.length - 2; i++) {
      const energy = energies[i];
      const time = (i * hopSize) / sampleRate;

      // Local maximum above threshold
      if (
        energy > threshold &&
        energy > energies[i - 1] &&
        energy > energies[i - 2] &&
        energy > energies[i + 1] &&
        energy > energies[i + 2] &&
        !syncPoints.some(p => Math.abs(p.time - time) < 0.2)
      ) {
        const intensity = Math.min(1, (energy - meanEnergy) / (maxEnergy - meanEnergy));
        syncPoints.push({
          time,
          type: intensity > 0.85 ? 'drop' : 'bass',
          intensity,
        });
      }
    }

    // 4. Segment detection (verse/chorus) using energy + spectral changes
    const segmentWindowSize = Math.floor(4 * sampleRate / hopSize); // ~4 second windows
    const segments: Array<{ start: number; end: number; type: 'verse' | 'chorus' }> = [];

    if (energies.length > segmentWindowSize * 2) {
      const windowEnergies: number[] = [];
      const windowCentroids: number[] = [];

      // Calculate average energy and centroid for each window
      for (let i = 0; i < energies.length - segmentWindowSize; i += segmentWindowSize / 2) {
        const windowEnd = Math.min(i + segmentWindowSize, energies.length);
        const windowE = energies.slice(i, windowEnd);
        const windowC = spectralCentroids.slice(i, windowEnd);

        windowEnergies.push(windowE.reduce((a, b) => a + b, 0) / windowE.length);
        windowCentroids.push(windowC.reduce((a, b) => a + b, 0) / windowC.length);
      }

      // Classify segments based on energy (chorus = higher energy, verse = lower)
      const medianEnergy = [...windowEnergies].sort((a, b) => a - b)[Math.floor(windowEnergies.length / 2)];

      let prevType: 'verse' | 'chorus' | null = null;
      for (let i = 0; i < windowEnergies.length; i++) {
        const time = (i * segmentWindowSize / 2 * hopSize) / sampleRate;
        const type = windowEnergies[i] > medianEnergy * 1.1 ? 'chorus' : 'verse';

        // Only add sync point when section changes
        if (type !== prevType && time > 0) {
          if (!syncPoints.some(p => Math.abs(p.time - time) < 1)) {
            syncPoints.push({
              time,
              type,
              intensity: type === 'chorus' ? 0.85 : 0.6,
            });
          }
        }
        prevType = type;
      }
    }

    // 5. Detect pauses (low energy sections)
    let inPause = false;
    let pauseStart = 0;
    const silenceThreshold = meanEnergy * 0.1;

    for (let i = 0; i < energies.length; i++) {
      const time = (i * hopSize) / sampleRate;

      if (energies[i] < silenceThreshold && !inPause) {
        inPause = true;
        pauseStart = time;
      } else if (energies[i] >= silenceThreshold && inPause) {
        inPause = false;
        const pauseDuration = time - pauseStart;

        if (pauseDuration > 0.15) {
          // Add pause point
          if (!syncPoints.some(p => Math.abs(p.time - pauseStart) < 0.1)) {
            syncPoints.push({
              time: pauseStart,
              type: 'pause',
              intensity: 0.6,
            });
          }
          // Add resume point (great for cuts!)
          if (!syncPoints.some(p => Math.abs(p.time - time) < 0.1)) {
            syncPoints.push({
              time,
              type: 'resume',
              intensity: 0.9,
            });
          }
        }
      }
    }

    // 6. Detect builds (sustained energy increase)
    const buildWindowSize = Math.floor(0.5 * sampleRate / hopSize);
    for (let i = buildWindowSize; i < energies.length - buildWindowSize; i++) {
      const beforeEnergy = energies.slice(i - buildWindowSize, i).reduce((a, b) => a + b, 0) / buildWindowSize;
      const afterEnergy = energies.slice(i, i + buildWindowSize).reduce((a, b) => a + b, 0) / buildWindowSize;

      const ratio = afterEnergy / (beforeEnergy + 0.001);
      const time = (i * hopSize) / sampleRate;

      // Significant sustained increase = build
      if (ratio > 1.6 && !syncPoints.some(p => Math.abs(p.time - time) < 0.5)) {
        syncPoints.push({
          time,
          type: 'build',
          intensity: Math.min(1, (ratio - 1) / 1.5),
        });
      }
    }
  } catch (e) {
    console.warn('Energy analysis failed:', e);
  }

  // Sort and filter sync points
  syncPoints.sort((a, b) => a.time - b.time);
  const filteredPoints = filterSyncPoints(syncPoints, duration);

  return {
    syncPoints: filteredPoints,
    duration,
    bpm,
    averageEnergy: 0,
  };
}

/**
 * Basic analysis fallback (no Essentia)
 */
async function analyzeBasic(audioBuffer: AudioBuffer): Promise<AudioAnalysis> {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const duration = audioBuffer.duration;

  const syncPoints: SyncPoint[] = [];

  // Simple energy-based analysis
  const frameSize = 2048;
  const hopSize = 512;
  const frameCount = Math.floor((channelData.length - frameSize) / hopSize);

  const energies: number[] = [];

  for (let i = 0; i < frameCount; i++) {
    const start = i * hopSize;
    let sum = 0;

    for (let j = 0; j < frameSize; j++) {
      const sample = channelData[start + j] || 0;
      sum += sample * sample;
    }

    energies.push(Math.sqrt(sum / frameSize));
  }

  const maxEnergy = Math.max(...energies);
  const meanEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  const threshold = meanEnergy + (maxEnergy - meanEnergy) * 0.5;

  // Detect peaks
  const minDistance = Math.floor(0.15 * sampleRate / hopSize);
  let lastPeakIndex = -minDistance;

  for (let i = 3; i < energies.length - 3; i++) {
    const energy = energies[i];
    const time = (i * hopSize) / sampleRate;

    if (
      energy > threshold &&
      i - lastPeakIndex >= minDistance &&
      energy >= energies[i - 1] &&
      energy >= energies[i - 2] &&
      energy >= energies[i - 3] &&
      energy >= energies[i + 1] &&
      energy >= energies[i + 2] &&
      energy >= energies[i + 3]
    ) {
      const intensity = Math.min(1, (energy - meanEnergy) / (maxEnergy - meanEnergy));

      syncPoints.push({
        time,
        type: intensity > 0.8 ? 'drop' : intensity > 0.5 ? 'bass' : 'hit',
        intensity,
      });

      lastPeakIndex = i;
    }
  }

  // Detect pauses
  let inPause = false;
  let pauseStart = 0;
  const silenceThreshold = meanEnergy * 0.15;

  for (let i = 0; i < energies.length; i++) {
    const time = (i * hopSize) / sampleRate;

    if (energies[i] < silenceThreshold && !inPause) {
      inPause = true;
      pauseStart = time;
    } else if (energies[i] >= silenceThreshold && inPause) {
      inPause = false;
      const pauseDuration = time - pauseStart;

      if (pauseDuration > 0.1) {
        syncPoints.push({ time: pauseStart, type: 'pause', intensity: 0.6 });
        syncPoints.push({ time, type: 'resume', intensity: 0.9 });
      }
    }
  }

  // Sort and filter
  syncPoints.sort((a, b) => a.time - b.time);
  const filteredPoints = filterSyncPoints(syncPoints, duration);

  return {
    syncPoints: filteredPoints,
    duration,
    bpm: null,
    averageEnergy: meanEnergy,
  };
}

/**
 * Filter sync points to keep the most meaningful ones
 */
function filterSyncPoints(points: SyncPoint[], duration: number): SyncPoint[] {
  // Merge nearby points
  const merged: SyncPoint[] = [];
  const minGap = 0.08;

  for (const point of points) {
    const existing = merged.find(p => Math.abs(p.time - point.time) < minGap);

    if (existing) {
      if (point.intensity > existing.intensity) {
        existing.intensity = point.intensity;
        existing.type = point.type;
      }
    } else {
      merged.push({ ...point });
    }
  }

  // Target density: ~1-2 points per second
  const targetCount = Math.min(
    Math.max(20, Math.floor(duration * 1.5)),
    Math.floor(duration * 2.5)
  );

  // Always keep drops, resumes, and high-intensity points
  const mustKeep = merged.filter(
    p => p.type === 'drop' || p.type === 'resume' || p.intensity > 0.85
  );
  const others = merged.filter(
    p => p.type !== 'drop' && p.type !== 'resume' && p.intensity <= 0.85
  );

  // Sort others by intensity
  others.sort((a, b) => b.intensity - a.intensity);

  const remaining = Math.max(0, targetCount - mustKeep.length);
  const selected = [...mustKeep, ...others.slice(0, remaining)];

  // Sort by time
  selected.sort((a, b) => a.time - b.time);

  // Ensure distribution (no huge gaps)
  return ensureDistribution(selected, duration);
}

/**
 * Ensure sync points are reasonably distributed
 */
function ensureDistribution(points: SyncPoint[], duration: number): SyncPoint[] {
  if (points.length < 2) {
    // Add some basic points if we have almost none
    const result: SyncPoint[] = [];
    for (let t = 0; t < duration; t += 2) {
      result.push({ time: t, type: 'hit', intensity: 0.5 });
    }
    return result;
  }

  const result: SyncPoint[] = [points[0]];
  const maxGap = 2.5; // Max 2.5 seconds between points

  for (let i = 1; i < points.length; i++) {
    const gap = points[i].time - result[result.length - 1].time;

    if (gap > maxGap) {
      // Insert filler point
      result.push({
        time: result[result.length - 1].time + gap / 2,
        type: 'hit',
        intensity: 0.4,
      });
    }

    result.push(points[i]);
  }

  // Check end gap
  if (duration - result[result.length - 1].time > maxGap) {
    result.push({
      time: result[result.length - 1].time + (duration - result[result.length - 1].time) / 2,
      type: 'hit',
      intensity: 0.3,
    });
  }

  return result;
}

/**
 * Get sync point summary for display
 */
export function getSyncPointSummary(analysis: AudioAnalysis): string {
  const counts: Record<SyncPointType, number> = {
    drop: 0,
    bass: 0,
    snare: 0,
    hit: 0,
    build: 0,
    transition: 0,
    vocal: 0,
    pause: 0,
    resume: 0,
    chorus: 0,
    verse: 0,
  };

  for (const point of analysis.syncPoints) {
    counts[point.type]++;
  }

  const parts: string[] = [];
  if (counts.drop > 0) parts.push(`${counts.drop} drops`);
  if (counts.chorus > 0) parts.push(`${counts.chorus} choruses`);
  if (counts.verse > 0) parts.push(`${counts.verse} verses`);
  if (counts.build > 0) parts.push(`${counts.build} builds`);
  if (counts.bass > 0) parts.push(`${counts.bass} bass`);
  if (counts.hit > 0) parts.push(`${counts.hit} hits`);
  if (counts.pause > 0) parts.push(`${counts.pause} pauses`);

  if (analysis.bpm) {
    parts.unshift(`${analysis.bpm} BPM`);
  }

  return parts.join(' | ') || 'No sync points detected';
}

/**
 * Get sync point color for visualization
 */
export function getSyncPointColor(type: SyncPointType): string {
  const colors: Record<SyncPointType, string> = {
    drop: '#ef4444',      // red - major impact
    bass: '#f97316',      // orange - bass hit
    snare: '#eab308',     // yellow - snare
    hit: '#22c55e',       // green - general hit
    build: '#3b82f6',     // blue - building up
    transition: '#8b5cf6', // purple - transition
    vocal: '#ec4899',     // pink - vocal
    pause: '#6b7280',     // gray - silence
    resume: '#10b981',    // emerald - coming back
    chorus: '#f59e0b',    // amber - high energy section
    verse: '#06b6d4',     // cyan - lower energy section
  };
  return colors[type];
}
