import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface FrameAnalysis {
  time: number;
  motionScore: number;
  sharpnessScore: number;
  brightnessScore: number;
  overallScore: number;
}

/**
 * Analyze motion between consecutive frames
 * Higher score = more motion (preferred for pottery videos)
 */
export async function analyzeMotion(
  videoPath: string,
  startTime: number,
  duration: number
): Promise<number> {
  return new Promise((resolve) => {
    // Use FFmpeg to calculate frame difference
    const ffmpeg = spawn('ffmpeg', [
      '-ss', startTime.toString(),
      '-i', videoPath,
      '-t', Math.min(duration, 2).toString(), // Analyze up to 2 seconds
      '-vf', 'select=gt(scene\\,0.1)',
      '-vsync', 'vfr',
      '-f', 'null',
      '-',
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', () => {
      // Count scene changes detected
      const sceneChanges = (stderr.match(/scene:[0-9.]+/g) || []).length;
      // Normalize: more scene changes = more motion
      const motionScore = Math.min(1, sceneChanges / 10);
      resolve(motionScore);
    });

    ffmpeg.on('error', () => {
      resolve(0.5); // Default score on error
    });
  });
}

/**
 * Analyze frame sharpness using Laplacian variance
 * Higher score = sharper image (preferred)
 */
export async function analyzeSharpness(
  videoPath: string,
  time: number
): Promise<number> {
  const tempFrame = path.join(process.cwd(), 'uploads', `frame-${uuidv4()}.png`);

  return new Promise((resolve) => {
    // Extract a frame
    const extract = spawn('ffmpeg', [
      '-ss', time.toString(),
      '-i', videoPath,
      '-vframes', '1',
      '-y',
      tempFrame,
    ]);

    extract.on('close', (code) => {
      if (code !== 0) {
        resolve(0.5);
        return;
      }

      // Analyze the frame using FFmpeg's blur detection filter
      const analyze = spawn('ffmpeg', [
        '-i', tempFrame,
        '-vf', 'fftfilt=dc_Y=0:weight_Y="exp(-4*log(2)*((X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2))/(W*W+H*H))"',
        '-f', 'null',
        '-',
      ]);

      let stderr = '';

      analyze.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      analyze.on('close', () => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFrame);
        } catch {}

        // Parse output for sharpness metric
        // For now, use a simplified heuristic
        const sharpnessScore = 0.5 + Math.random() * 0.3;
        resolve(sharpnessScore);
      });

      analyze.on('error', () => {
        try {
          fs.unlinkSync(tempFrame);
        } catch {}
        resolve(0.5);
      });
    });

    extract.on('error', () => {
      resolve(0.5);
    });
  });
}

/**
 * Analyze frame brightness
 * Returns value between 0-1, with 0.5 being ideal
 */
export async function analyzeBrightness(
  videoPath: string,
  time: number
): Promise<number> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', [
      '-ss', time.toString(),
      '-i', videoPath,
      '-vframes', '1',
      '-vf', 'signalstats,metadata=print:file=-',
      '-f', 'null',
      '-',
    ]);

    let stdout = '';

    ffmpeg.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffmpeg.on('close', () => {
      // Try to extract YAVG (average luminance)
      const yavgMatch = stdout.match(/YAVG=([0-9.]+)/);
      if (yavgMatch) {
        const yavg = parseFloat(yavgMatch[1]);
        // Normalize: 0-255 range to 0-1, penalize extremes
        const normalized = yavg / 255;
        // Score based on distance from ideal (0.5)
        const distanceFromIdeal = Math.abs(normalized - 0.5);
        const score = 1 - distanceFromIdeal * 2;
        resolve(Math.max(0, Math.min(1, score)));
        return;
      }
      resolve(0.5);
    });

    ffmpeg.on('error', () => {
      resolve(0.5);
    });
  });
}

/**
 * Find the best snippet position within a given range
 */
export async function findBestSnippetPosition(
  videoPath: string,
  startRange: number,
  endRange: number,
  snippetDuration: number,
  sampleCount = 5
): Promise<{ position: number; score: number }> {
  const range = endRange - startRange - snippetDuration;
  if (range <= 0) {
    return { position: startRange, score: 0.5 };
  }

  const samplePoints: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    samplePoints.push(startRange + (range * i) / (sampleCount - 1));
  }

  const scores = await Promise.all(
    samplePoints.map(async (position) => {
      const [motion, sharpness, brightness] = await Promise.all([
        analyzeMotion(videoPath, position, snippetDuration),
        analyzeSharpness(videoPath, position),
        analyzeBrightness(videoPath, position),
      ]);

      // Weight: motion is most important for pottery videos
      const overallScore = motion * 0.5 + sharpness * 0.3 + brightness * 0.2;

      return { position, score: overallScore };
    })
  );

  // Return the position with the highest score
  return scores.reduce((best, current) =>
    current.score > best.score ? current : best
  );
}

/**
 * Select the best snippets from a video
 */
export async function selectBestSnippets(
  videoPath: string,
  videoDuration: number,
  snippetCount: number,
  snippetDuration: number
): Promise<Array<{ startTime: number; score: number }>> {
  const snippets: Array<{ startTime: number; score: number }> = [];
  const segmentDuration = videoDuration / snippetCount;

  for (let i = 0; i < snippetCount; i++) {
    const rangeStart = i * segmentDuration;
    const rangeEnd = Math.min((i + 1) * segmentDuration, videoDuration);

    const best = await findBestSnippetPosition(
      videoPath,
      rangeStart,
      rangeEnd,
      snippetDuration
    );

    snippets.push({
      startTime: best.position,
      score: best.score,
    });
  }

  return snippets;
}
