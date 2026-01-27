import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Detect the last silence start position in an audio file.
 * Uses FFmpeg's silencedetect filter to find where audio goes quiet.
 * Returns the timestamp of the last silence_start, or null if no silence found.
 */
export async function detectSilenceEnd(inputPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-af', 'silencedetect=noise=-50dB:d=0.3',
      '-f', 'null',
      '-',
    ]);

    let output = '';

    // silencedetect outputs to stderr
    ffmpeg.stderr.on('data', (data) => {
      output += data.toString();
    });

    ffmpeg.on('close', () => {
      // Parse output for silence_start values
      // Format: [silencedetect @ 0x...] silence_start: 28.5
      const silenceStarts: number[] = [];
      const regex = /silence_start:\s*([\d.]+)/g;
      let match;

      while ((match = regex.exec(output)) !== null) {
        silenceStarts.push(parseFloat(match[1]));
      }

      if (silenceStarts.length > 0) {
        // Return the last silence start (closest to end of audio)
        resolve(silenceStarts[silenceStarts.length - 1]);
      } else {
        resolve(null);
      }
    });

    ffmpeg.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Trim audio at the detected silence point + buffer.
 * If silence is detected, trims the audio to end at silence_start + bufferSeconds.
 * If no silence is detected, leaves the audio unchanged.
 */
export async function trimAtSilence(inputPath: string, bufferSeconds: number = 0.5): Promise<void> {
  const silenceStart = await detectSilenceEnd(inputPath);

  if (silenceStart === null) {
    console.log('No silence detected in audio, skipping trim');
    return;
  }

  // Calculate trim point (silence start + buffer)
  const trimPoint = silenceStart + bufferSeconds;
  console.log(`Detected silence at ${silenceStart}s, trimming to ${trimPoint}s`);

  // Create temp output path
  const outputPath = inputPath.replace('.mp3', '-trimmed.mp3');

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-t', trimPoint.toString(),
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
        console.error('FFmpeg trim failed:', stderr.slice(-200));
        // Don't fail completely, just leave original file
        resolve();
        return;
      }

      // Replace original with trimmed version
      try {
        fs.unlinkSync(inputPath);
        fs.renameSync(outputPath, inputPath);
        console.log('Audio trimmed successfully');
        resolve();
      } catch (err) {
        console.error('Error replacing file:', err);
        resolve();
      }
    });

    ffmpeg.on('error', (err) => {
      console.error('FFmpeg error:', err);
      resolve();
    });
  });
}

/**
 * Extract audio from a TikTok video URL using yt-dlp
 * Automatically trims the TikTok ending watermark sound
 */
export async function extractTiktokAudio(url: string): Promise<string> {
  const outputDir = path.join(process.cwd(), 'uploads');
  const outputFile = path.join(outputDir, `tiktok-${uuidv4()}.mp3`);

  // Step 1: Download audio with yt-dlp
  const audioPath = await new Promise<string>((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputFile,
      '--no-playlist',
      '--quiet',
      url,
    ]);

    let stderr = '';

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed: ${stderr}`));
        return;
      }

      // Check if file was created (yt-dlp may add .mp3 extension)
      const possiblePaths = [
        outputFile,
        outputFile + '.mp3',
        outputFile.replace('.mp3', '') + '.mp3',
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          resolve(p);
          return;
        }
      }

      // Try to find any recently created file
      const files = fs.readdirSync(outputDir)
        .filter(f => f.includes('tiktok-'))
        .map(f => ({
          name: f,
          path: path.join(outputDir, f),
          time: fs.statSync(path.join(outputDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 0) {
        resolve(files[0].path);
        return;
      }

      reject(new Error('Audio file not found after extraction'));
    });

    ytdlp.on('error', (err) => {
      reject(new Error(`Failed to run yt-dlp: ${err.message}. Make sure yt-dlp is installed (brew install yt-dlp)`));
    });
  });

  // Step 2: Trim TikTok ending watermark (silence detection)
  await trimAtSilence(audioPath);

  return audioPath;
}

/**
 * Check if yt-dlp is available
 */
export function checkYtdlpAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ytdlp = spawn('yt-dlp', ['--version']);

    ytdlp.on('close', (code) => {
      resolve(code === 0);
    });

    ytdlp.on('error', () => {
      resolve(false);
    });
  });
}
