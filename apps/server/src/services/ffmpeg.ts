import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface ExportOptions {
  audioPath: string;
  videos: Array<{ path: string; label: string }>;
  timeline: Array<{ snippetId: string; beatIndex: number; duration: number }>;
  outputLength: number;
  outputPath: string;
  width?: number;
  height?: number;
  videoMode?: 'standard' | 'teaser';
  teaserDuration?: number; // Duration in beats
  bpm?: number;
  onProgress?: (progress: number, stage: string, message: string) => void;
}

export interface QualityAnalysis {
  snippets: Array<{
    startTime: number;
    duration: number;
    qualityScore: number;
    motionScore: number;
    sharpnessScore: number;
    brightnessScore: number;
  }>;
}

/**
 * Generate a thumbnail from a video at a specific time
 */
export async function generateThumbnail(videoPath: string, time = 1): Promise<string> {
  const outputPath = path.join(
    process.cwd(),
    'uploads',
    `thumb-${uuidv4()}.jpg`
  );

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-ss', time.toString(),
      '-vframes', '1',
      '-vf', 'scale=320:-1',
      '-q:v', '5',
      '-y',
      outputPath,
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg thumbnail failed: ${stderr}`));
        return;
      }
      resolve(outputPath);
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Get video duration in seconds
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe failed: ${stderr}`));
        return;
      }
      const duration = parseFloat(stdout.trim());
      resolve(duration);
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to run FFprobe: ${err.message}`));
    });
  });
}

/**
 * Analyze video quality at multiple points for snippet selection
 */
export async function analyzeVideoQuality(
  videoPath: string,
  segmentCount: number
): Promise<QualityAnalysis> {
  const duration = await getVideoDuration(videoPath);
  const segmentDuration = duration / segmentCount;
  const snippets: QualityAnalysis['snippets'] = [];

  for (let i = 0; i < segmentCount; i++) {
    const startTime = i * segmentDuration;

    // Extract a frame and analyze it
    const qualityScore = await analyzeFrameQuality(videoPath, startTime);

    snippets.push({
      startTime,
      duration: segmentDuration,
      qualityScore: qualityScore.overall,
      motionScore: qualityScore.motion,
      sharpnessScore: qualityScore.sharpness,
      brightnessScore: qualityScore.brightness,
    });
  }

  return { snippets };
}

/**
 * Analyze a single frame's quality
 */
async function analyzeFrameQuality(
  videoPath: string,
  time: number
): Promise<{ overall: number; motion: number; sharpness: number; brightness: number }> {
  // Extract frame and get stats using FFmpeg
  return new Promise((resolve) => {
    // Use FFmpeg to get frame statistics
    const ffmpeg = spawn('ffmpeg', [
      '-ss', time.toString(),
      '-i', videoPath,
      '-vframes', '1',
      '-vf', 'signalstats=stat=tout+vrep+brng,metadata=print',
      '-f', 'null',
      '-',
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', () => {
      // Parse FFmpeg output for quality metrics
      // This is a simplified analysis - in production, you'd parse the actual stats
      const brightness = extractMetric(stderr, 'YAVG') || 0.5;
      const sharpness = 0.5 + Math.random() * 0.3; // Placeholder - would use Laplacian variance
      const motion = 0.5 + Math.random() * 0.3; // Placeholder - would compare frames

      const overall = (brightness + sharpness + motion) / 3;

      resolve({
        overall: Math.min(1, Math.max(0, overall)),
        motion: Math.min(1, Math.max(0, motion)),
        sharpness: Math.min(1, Math.max(0, sharpness)),
        brightness: Math.min(1, Math.max(0, brightness)),
      });
    });

    ffmpeg.on('error', () => {
      // Return default values on error
      resolve({ overall: 0.5, motion: 0.5, sharpness: 0.5, brightness: 0.5 });
    });
  });
}

function extractMetric(output: string, metric: string): number | null {
  const regex = new RegExp(`${metric}=([\\d.]+)`);
  const match = output.match(regex);
  if (match) {
    const value = parseFloat(match[1]);
    // Normalize to 0-1 range (assuming 0-255 input)
    return value / 255;
  }
  return null;
}

/**
 * Export the final video with beat-synced cuts
 */
export async function exportVideo(options: ExportOptions): Promise<string> {
  const {
    audioPath,
    videos,
    timeline,
    outputLength,
    outputPath,
    width = 1080,
    height = 1920,
    videoMode = 'standard',
    teaserDuration = 4,
    bpm: providedBpm = 120,
    onProgress,
  } = options;

  onProgress?.(5, 'preparing', 'Preparing export...');

  // Get durations for all videos
  const videoDurations = await Promise.all(
    videos.map(async (v) => ({
      ...v,
      duration: await getVideoDuration(v.path),
    }))
  );

  onProgress?.(10, 'extracting', 'Extracting snippets...');

  // Create a filter complex for concatenating clips
  const tempDir = path.join(process.cwd(), 'uploads', `temp-${uuidv4()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Use provided BPM or default to 120
  const bpm = providedBpm;
  const beatDuration = 60 / bpm;

  // Find the finishing video for teaser mode
  const finishingVideo = videoDurations.find((v) => v.label === 'Finishing');
  const nonFinishingVideos = videoDurations.filter((v) => v.label !== 'Finishing');

  // Extract individual clips
  const clips: string[] = [];
  let processedClips = 0;
  let timelineOffset = 0;

  // In teaser mode, start with the finished pot clip
  if (videoMode === 'teaser' && finishingVideo) {
    const teaserClipDuration = teaserDuration * beatDuration;
    const clipPath = path.join(tempDir, `clip-teaser.mp4`);

    // Extract from near the end of the finishing video for the best shot
    const teaserPosition = Math.max(0, finishingVideo.duration - teaserClipDuration - 2);

    await extractClip(
      finishingVideo.path,
      teaserPosition,
      teaserClipDuration,
      clipPath,
      width,
      height
    );

    clips.push(clipPath);
    processedClips++;
    timelineOffset = 1; // Skip the first timeline entry (teaser reveal) since we handled it

    onProgress?.(15, 'extracting', 'Teaser reveal extracted');
  }

  // Process the rest of the timeline
  const videosToUse = videoMode === 'teaser' && finishingVideo ? nonFinishingVideos : videoDurations;

  for (let i = timelineOffset; i < timeline.length; i++) {
    const entry = timeline[i];
    const videoIndex = (i - timelineOffset) % Math.max(1, videosToUse.length);
    const video = videosToUse[videoIndex] || videoDurations[0];
    const clipDuration = entry.duration * beatDuration;

    // Calculate snippet position (evenly distributed across source video)
    const snippetPosition = ((i - timelineOffset) / Math.max(1, timeline.length - timelineOffset)) * (video.duration - clipDuration);
    const safePosition = Math.max(0, Math.min(snippetPosition, video.duration - clipDuration));

    const clipPath = path.join(tempDir, `clip-${i}.mp4`);

    await extractClip(
      video.path,
      safePosition,
      clipDuration,
      clipPath,
      width,
      height
    );

    clips.push(clipPath);
    processedClips++;

    const progress = 10 + (processedClips / timeline.length) * 50;
    onProgress?.(progress, 'extracting', `Extracting clip ${processedClips}/${timeline.length}`);
  }

  onProgress?.(60, 'encoding', 'Concatenating clips...');

  // Create concat file
  const concatFile = path.join(tempDir, 'concat.txt');
  const concatContent = clips.map((c) => `file '${c}'`).join('\n');
  fs.writeFileSync(concatFile, concatContent);

  // Concatenate clips
  const tempVideo = path.join(tempDir, 'concat.mp4');
  await concatenateClips(concatFile, tempVideo);

  onProgress?.(80, 'encoding', 'Adding audio...');

  // Add audio
  await addAudioToVideo(tempVideo, audioPath, outputPath, outputLength);

  onProgress?.(95, 'finalizing', 'Cleaning up...');

  // Clean up temp files
  fs.rmSync(tempDir, { recursive: true, force: true });

  onProgress?.(100, 'complete', 'Export complete!');

  return outputPath;
}

async function extractClip(
  inputPath: string,
  startTime: number,
  duration: number,
  outputPath: string,
  width: number,
  height: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-ss', startTime.toString(),
      '-i', inputPath,
      '-t', duration.toString(),
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-an', // No audio for clips
      '-y',
      outputPath,
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg clip extraction failed: ${stderr}`));
        return;
      }
      resolve();
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}`));
    });
  });
}

async function concatenateClips(concatFile: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c', 'copy',
      '-y',
      outputPath,
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg concat failed: ${stderr}`));
        return;
      }
      resolve();
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}`));
    });
  });
}

async function addAudioToVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-i', audioPath,
      '-t', duration.toString(),
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest',
      '-y',
      outputPath,
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg audio merge failed: ${stderr}`));
        return;
      }
      resolve();
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Check if FFmpeg is available
 */
export function checkFfmpegAvailable(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
