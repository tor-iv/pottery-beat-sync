import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { trimAtSilence } from '../services/tiktok';

const router = Router();

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
    cb(null, `video-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
});

/**
 * Extract audio from an uploaded video file
 * POST /api/extract-audio/from-video
 */
router.post('/from-video', upload.single('video'), async (req: Request, res: Response) => {
  console.log('Extract audio request received');

  if (!req.file) {
    console.log('No file in request');
    return res.status(400).json({ error: 'No video file provided' });
  }

  console.log('File received:', req.file.originalname, req.file.size, 'bytes');

  try {
    const audioPath = await extractAudioFromFile(req.file.path);
    const filename = path.basename(audioPath);
    const stats = fs.statSync(audioPath);

    console.log('Audio extracted:', filename, stats.size, 'bytes');

    res.json({
      success: true,
      path: `/uploads/${filename}`,
      filename,
    });
  } catch (err) {
    console.error('Audio extraction error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to extract audio'
    });
  }
});

/**
 * Download TikTok video and extract audio
 * POST /api/extract-audio/from-tiktok
 */
router.post('/from-tiktok', async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'TikTok URL required' });
  }

  // Validate it's a TikTok URL
  if (!url.includes('tiktok.com')) {
    return res.status(400).json({ error: 'Invalid TikTok URL' });
  }

  try {
    const audioPath = await downloadTikTokAudio(url);
    const filename = path.basename(audioPath);

    res.json({
      success: true,
      path: `/uploads/${filename}`,
      filename,
    });
  } catch (err) {
    console.error('TikTok download error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to download TikTok audio'
    });
  }
});

/**
 * Extract audio from a video file using ffmpeg
 */
async function extractAudioFromFile(videoPath: string): Promise<string> {
  const outputDir = path.join(process.cwd(), 'uploads');
  const outputPath = path.join(outputDir, `extracted-${uuidv4()}.mp3`);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-vn',                    // No video
      '-acodec', 'libmp3lame',  // MP3 codec
      '-ab', '192k',            // Bitrate
      '-ar', '44100',           // Sample rate
      '-y',                     // Overwrite
      outputPath,
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      // Clean up the original video file
      try {
        fs.unlinkSync(videoPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      if (code !== 0) {
        reject(new Error(`FFmpeg failed: ${stderr.slice(-500)}`));
        return;
      }

      if (!fs.existsSync(outputPath)) {
        reject(new Error('Audio extraction produced no output'));
        return;
      }

      resolve(outputPath);
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg error: ${err.message}`));
    });
  });
}

/**
 * Download TikTok video and extract audio using yt-dlp
 * Automatically trims the TikTok ending watermark sound
 */
async function downloadTikTokAudio(url: string): Promise<string> {
  const outputDir = path.join(process.cwd(), 'uploads');
  const outputTemplate = path.join(outputDir, `tiktok-${uuidv4()}.%(ext)s`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Step 1: Download audio with yt-dlp
  const audioPath = await new Promise<string>((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      url,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputTemplate,
      '--no-playlist',
      '--no-warnings',
    ]);

    let stderr = '';

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`TikTok download failed: ${stderr}`));
        return;
      }

      // Find the downloaded file
      const files = fs.readdirSync(outputDir)
        .filter(f => f.startsWith('tiktok-') && f.endsWith('.mp3'))
        .map(f => ({
          name: f,
          path: path.join(outputDir, f),
          time: fs.statSync(path.join(outputDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length === 0) {
        reject(new Error('Downloaded file not found'));
        return;
      }

      resolve(files[0].path);
    });

    ytdlp.on('error', (err) => {
      reject(new Error(`yt-dlp error: ${err.message}`));
    });
  });

  // Step 2: Trim TikTok ending watermark (silence detection)
  await trimAtSilence(audioPath);

  return audioPath;
}

export default router;
