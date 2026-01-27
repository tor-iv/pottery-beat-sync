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

// Music type presets for different genres
export type MusicType = 'chill' | 'standard' | 'beat-heavy';

export interface AnalysisSettings {
  musicType: MusicType;
}

export interface AnalysisPreset {
  densityMin: number;      // Min sync points per second
  densityMax: number;      // Max sync points per second
  energyThreshold: number; // Percentile for energy peaks (0-1)
  onsetDedup: number;      // Milliseconds - dedup window for onsets
  energyDedup: number;     // Milliseconds - dedup window for energy peaks
  maxGap: number;          // Seconds - maximum gap between sync points
}

export const ANALYSIS_PRESETS: Record<MusicType, AnalysisPreset> = {
  chill: {
    densityMin: 0.8,
    densityMax: 1.5,
    energyThreshold: 0.75,
    onsetDedup: 80,
    energyDedup: 300,
    maxGap: 3.0,
  },
  standard: {
    densityMin: 1.5,
    densityMax: 2.5,
    energyThreshold: 0.7,
    onsetDedup: 50,
    energyDedup: 200,
    maxGap: 2.0,
  },
  'beat-heavy': {
    densityMin: 2.5,
    densityMax: 4.0,
    energyThreshold: 0.5,
    onsetDedup: 30,
    energyDedup: 100,
    maxGap: 1.0,
  },
};

const DEFAULT_SETTINGS: AnalysisSettings = { musicType: 'standard' };

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
export async function analyzeAudio(
  audioBuffer: AudioBuffer,
  settings: AnalysisSettings = DEFAULT_SETTINGS
): Promise<AudioAnalysis> {
  const essentia = await initEssentia();
  const preset = ANALYSIS_PRESETS[settings.musicType];

  if (essentia) {
    return analyzeWithEssentia(audioBuffer, essentia, preset);
  } else {
    return analyzeBasic(audioBuffer, preset);
  }
}

/**
 * Advanced analysis using Essentia.js
 */
async function analyzeWithEssentia(audioBuffer: AudioBuffer, essentia: any, preset: AnalysisPreset): Promise<AudioAnalysis> {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const duration = audioBuffer.duration;

  // Convert to Essentia vector
  const signal = essentia.arrayToVector(channelData);

  const syncPoints: SyncPoint[] = [];
  let bpm: number | null = null;

  // Pre-compute energy data for beat classification
  let frameEnergies: number[] = [];
  let lowFreqEnergies: number[] = [];
  let highFreqEnergies: number[] = [];
  const analysisHopSize = 512;
  const analysisFrameSize = 2048;

  try {
    // Pre-compute spectral energy bands for beat classification
    const frames = essentia.FrameGenerator(signal, analysisFrameSize, analysisHopSize);
    for (const frame of frames) {
      const energy = essentia.Energy(frame);
      frameEnergies.push(energy.energy);

      try {
        const spectrum = essentia.Spectrum(frame);
        const specArray: number[] = essentia.vectorToArray(spectrum.spectrum);
        const binCount = specArray.length;

        // Low frequency (bass): 0-250Hz roughly first 10% of bins
        const lowBins = Math.floor(binCount * 0.1);
        const lowEnergy = specArray.slice(0, lowBins).reduce((a, b) => a + b * b, 0);
        lowFreqEnergies.push(lowEnergy);

        // High frequency (snare/hi-hat): 2000Hz+ roughly 40-80% of bins
        const highStart = Math.floor(binCount * 0.4);
        const highEnd = Math.floor(binCount * 0.8);
        const highEnergy = specArray.slice(highStart, highEnd).reduce((a, b) => a + b * b, 0);
        highFreqEnergies.push(highEnergy);
      } catch {
        lowFreqEnergies.push(0);
        highFreqEnergies.push(0);
      }
    }
  } catch (e) {
    console.warn('Spectral pre-analysis failed:', e);
  }

  // Helper to get spectral characteristics at a given time
  const getSpectralType = (time: number): { type: SyncPointType; intensity: number } => {
    const frameIndex = Math.floor((time * sampleRate) / analysisHopSize);
    if (frameIndex < 0 || frameIndex >= lowFreqEnergies.length) {
      return { type: 'hit', intensity: 0.5 };
    }

    const lowE = lowFreqEnergies[frameIndex];
    const highE = highFreqEnergies[frameIndex];
    const totalE = frameEnergies[frameIndex];

    // Calculate relative contributions
    const maxLow = Math.max(...lowFreqEnergies) || 1;
    const maxHigh = Math.max(...highFreqEnergies) || 1;

    const lowRatio = lowE / maxLow;
    const highRatio = highE / maxHigh;

    // Classify based on spectral content
    if (lowRatio > 0.7 && lowRatio > highRatio * 1.5) {
      // Strong bass presence
      return { type: lowRatio > 0.85 ? 'drop' : 'bass', intensity: Math.min(1, lowRatio + 0.2) };
    } else if (highRatio > 0.6 && highRatio > lowRatio * 1.2) {
      // Strong high frequency - likely snare or hi-hat
      return { type: 'snare', intensity: Math.min(1, highRatio + 0.1) };
    } else if (lowRatio > 0.5 && highRatio > 0.4) {
      // Both present - full hit
      return { type: 'hit', intensity: Math.min(1, (lowRatio + highRatio) / 2 + 0.2) };
    }

    return { type: 'hit', intensity: 0.5 };
  };

  try {
    // 1. Beat tracking with RhythmExtractor
    const rhythmResult = essentia.RhythmExtractor2013(signal);
    bpm = Math.round(rhythmResult.bpm);

    // Get beat positions (these are actual detected beats, not uniform)
    const beatPositions: number[] = essentia.vectorToArray(rhythmResult.ticks);

    // Add beats as sync points with classification based on spectral content
    for (let i = 0; i < beatPositions.length; i++) {
      const time = beatPositions[i];
      if (time < duration) {
        // Classify beat based on actual spectral content instead of naive i % 4
        const { type, intensity } = getSpectralType(time);
        syncPoints.push({ time, type, intensity });
      }
    }
  } catch (e) {
    console.warn('Beat tracking failed:', e);
  }

  // Onset dedup window in seconds
  const onsetDedupSec = preset.onsetDedup / 1000;

  try {
    // 2. Onset detection (transients - drum hits, note starts)
    const onsets = essentia.OnsetDetection(signal, 'complex');
    const onsetTimes: number[] = essentia.vectorToArray(onsets.onsetDetections);

    // Frame to time conversion (default hop size is 512)
    const hopSize = 512;
    for (const frame of onsetTimes) {
      const time = (frame * hopSize) / sampleRate;
      if (time < duration && !syncPoints.some(p => Math.abs(p.time - time) < onsetDedupSec)) {
        const { type, intensity } = getSpectralType(time);
        syncPoints.push({ time, type, intensity });
      }
    }
  } catch (e) {
    console.warn('Onset detection failed:', e);
  }

  // Energy dedup window in seconds
  const energyDedupSec = preset.energyDedup / 1000;

  try {
    // 3. Energy analysis for drops, builds, and segment detection
    const frameSize = 2048;
    const hopSize = 1024;
    const frames = essentia.FrameGenerator(signal, frameSize, hopSize);

    const energies: number[] = [];
    const spectralCentroids: number[] = [];

    for (const frame of frames) {
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

    // Find energy peaks using preset threshold
    const sortedEnergies = [...energies].sort((a, b) => a - b);
    const thresholdIndex = Math.floor(sortedEnergies.length * preset.energyThreshold);
    const threshold = sortedEnergies[thresholdIndex] || sortedEnergies[sortedEnergies.length - 1];

    const maxEnergy = Math.max(...energies);
    const meanEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;

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
        !syncPoints.some(p => Math.abs(p.time - time) < energyDedupSec)
      ) {
        const intensity = Math.min(1, (energy - meanEnergy) / (maxEnergy - meanEnergy));
        const { type: spectralType } = getSpectralType(time);
        // Use spectral classification but boost intensity for high energy
        syncPoints.push({
          time,
          type: intensity > 0.85 ? 'drop' : spectralType,
          intensity,
        });
      }
    }

    // 4. Segment detection (verse/chorus) using energy + spectral changes
    const segmentWindowSize = Math.floor(4 * sampleRate / hopSize); // ~4 second windows

    if (energies.length > segmentWindowSize * 2) {
      const windowEnergies: number[] = [];

      // Calculate average energy for each window
      for (let i = 0; i < energies.length - segmentWindowSize; i += segmentWindowSize / 2) {
        const windowEnd = Math.min(i + segmentWindowSize, energies.length);
        const windowE = energies.slice(i, windowEnd);
        windowEnergies.push(windowE.reduce((a, b) => a + b, 0) / windowE.length);
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
  const filteredPoints = filterSyncPoints(syncPoints, duration, preset);

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
async function analyzeBasic(audioBuffer: AudioBuffer, preset: AnalysisPreset): Promise<AudioAnalysis> {
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

  // Use preset energy threshold
  const sortedEnergies = [...energies].sort((a, b) => a - b);
  const thresholdIndex = Math.floor(sortedEnergies.length * preset.energyThreshold);
  const threshold = sortedEnergies[thresholdIndex] || sortedEnergies[sortedEnergies.length - 1];

  const maxEnergy = Math.max(...energies);
  const meanEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;

  // Detect peaks using preset dedup window
  const minDistanceSec = preset.energyDedup / 1000;
  const minDistance = Math.floor(minDistanceSec * sampleRate / hopSize);
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
  const filteredPoints = filterSyncPoints(syncPoints, duration, preset);

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
function filterSyncPoints(points: SyncPoint[], duration: number, preset: AnalysisPreset): SyncPoint[] {
  // Merge nearby points using preset-specific minimum gap
  // Use the smaller of onset/energy dedup for general merging
  const merged: SyncPoint[] = [];
  const minGap = preset.onsetDedup / 1000; // Convert ms to seconds

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

  // Target density based on preset (use midpoint of range)
  const targetDensity = (preset.densityMin + preset.densityMax) / 2;
  const targetCount = Math.min(
    Math.max(20, Math.floor(duration * preset.densityMin)),
    Math.floor(duration * preset.densityMax)
  );

  // Always keep drops, resumes, and high-intensity points
  // Lower the intensity threshold for beat-heavy to keep more points
  const intensityThreshold = preset.energyThreshold > 0.6 ? 0.85 : 0.75;
  const mustKeep = merged.filter(
    p => p.type === 'drop' || p.type === 'resume' || p.intensity > intensityThreshold
  );
  const others = merged.filter(
    p => p.type !== 'drop' && p.type !== 'resume' && p.intensity <= intensityThreshold
  );

  // Sort others by intensity
  others.sort((a, b) => b.intensity - a.intensity);

  const remaining = Math.max(0, targetCount - mustKeep.length);
  const selected = [...mustKeep, ...others.slice(0, remaining)];

  // Sort by time
  selected.sort((a, b) => a.time - b.time);

  // Ensure distribution (no huge gaps) using preset max gap
  return ensureDistribution(selected, duration, preset);
}

/**
 * Ensure sync points are reasonably distributed
 */
function ensureDistribution(points: SyncPoint[], duration: number, preset: AnalysisPreset): SyncPoint[] {
  const maxGap = preset.maxGap;

  if (points.length < 2) {
    // Add some basic points if we have almost none
    // Use preset density to determine spacing
    const spacing = 1 / ((preset.densityMin + preset.densityMax) / 2);
    const result: SyncPoint[] = [];
    for (let t = 0; t < duration; t += spacing) {
      result.push({ time: t, type: 'hit', intensity: 0.5 });
    }
    return result;
  }

  const result: SyncPoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const gap = points[i].time - result[result.length - 1].time;

    if (gap > maxGap) {
      // Insert filler points to bridge the gap
      // For beat-heavy, we may need multiple fillers
      const numFillers = Math.ceil(gap / maxGap) - 1;
      const fillerSpacing = gap / (numFillers + 1);

      for (let f = 1; f <= numFillers; f++) {
        result.push({
          time: result[result.length - 1].time + fillerSpacing,
          type: 'hit',
          intensity: 0.4,
        });
      }
    }

    result.push(points[i]);
  }

  // Check end gap
  const endGap = duration - result[result.length - 1].time;
  if (endGap > maxGap) {
    const numFillers = Math.ceil(endGap / maxGap) - 1;
    const fillerSpacing = endGap / (numFillers + 1);

    for (let f = 1; f <= numFillers; f++) {
      result.push({
        time: result[result.length - 1].time + fillerSpacing,
        type: 'hit',
        intensity: 0.3,
      });
    }
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
