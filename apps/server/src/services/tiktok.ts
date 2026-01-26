import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Extract audio from a TikTok video URL using yt-dlp
 */
export async function extractTiktokAudio(url: string): Promise<string> {
  const outputDir = path.join(process.cwd(), 'uploads');
  const outputFile = path.join(outputDir, `tiktok-${uuidv4()}.mp3`);

  return new Promise((resolve, reject) => {
    // Use yt-dlp to extract audio
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
