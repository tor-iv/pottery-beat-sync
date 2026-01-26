import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { exportVideo, ExportOptions } from '../services/ffmpeg.js';
import { wss } from '../index.js';

const router = Router();

// Store for export progress (in production, use Redis or similar)
const exportProgress = new Map<string, { progress: number; stage: string; message: string }>();

// Configure multer for export uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `export-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file
  },
});

// Progress SSE endpoint
router.get('/progress', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = () => {
    // Get the latest export progress
    const entries = Array.from(exportProgress.entries());
    if (entries.length > 0) {
      const [, progress] = entries[entries.length - 1];
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    }
  };

  const interval = setInterval(sendProgress, 500);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Broadcast progress to WebSocket clients
function broadcastProgress(exportId: string, progress: number, stage: string, message: string) {
  const data = { exportId, progress, stage, message };
  exportProgress.set(exportId, data);

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      // OPEN
      client.send(JSON.stringify(data));
    }
  });
}

// Main export endpoint
router.post(
  '/',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'video_0', maxCount: 1 },
    { name: 'video_1', maxCount: 1 },
    { name: 'video_2', maxCount: 1 },
    { name: 'video_3', maxCount: 1 },
    { name: 'video_4', maxCount: 1 },
    { name: 'video_5', maxCount: 1 },
    { name: 'video_6', maxCount: 1 },
    { name: 'video_7', maxCount: 1 },
    { name: 'video_8', maxCount: 1 },
    { name: 'video_9', maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    const exportId = uuidv4();

    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      // Get audio file
      const audioFile = files['audio']?.[0];
      if (!audioFile) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      // Collect video files
      const videoFiles: Array<{ path: string; label: string }> = [];
      for (let i = 0; i < 10; i++) {
        const videoFile = files[`video_${i}`]?.[0];
        if (videoFile) {
          const label = req.body[`video_${i}_label`] || 'Other';
          videoFiles.push({ path: videoFile.path, label });
        }
      }

      if (videoFiles.length === 0) {
        return res.status(400).json({ error: 'No video files provided' });
      }

      // Parse timeline and settings
      const timeline = JSON.parse(req.body.timeline || '[]');
      const outputLength = parseInt(req.body.outputLength) || 30;
      const videoMode = (req.body.videoMode || 'standard') as 'standard' | 'teaser';
      const teaserDuration = parseInt(req.body.teaserDuration) || 4;
      const bpm = parseInt(req.body.bpm) || 120;
      const exportAudioMode = (req.body.exportAudioMode || 'include') as 'include' | 'video-only';

      // Export options
      const options: ExportOptions = {
        audioPath: audioFile.path,
        videos: videoFiles,
        timeline,
        outputLength,
        outputPath: path.join(process.cwd(), 'output', `${exportId}.mp4`),
        width: 1080,
        height: 1920,
        videoMode,
        teaserDuration,
        bpm,
        includeAudio: exportAudioMode === 'include',
        onProgress: (progress, stage, message) => {
          broadcastProgress(exportId, progress, stage, message);
        },
      };

      broadcastProgress(exportId, 0, 'preparing', 'Starting export...');

      // Perform export
      const outputPath = await exportVideo(options);

      broadcastProgress(exportId, 100, 'complete', 'Export complete!');

      // Send the exported file
      res.sendFile(outputPath, (err) => {
        if (err) {
          console.error('Error sending exported file:', err);
          res.status(500).json({ error: 'Failed to send exported file' });
        }

        // Clean up after sending
        setTimeout(() => {
          exportProgress.delete(exportId);
          // Optionally clean up temp files
        }, 60000);
      });
    } catch (error) {
      console.error('Export error:', error);
      broadcastProgress(exportId, 0, 'error', 'Export failed');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Export failed',
      });
    }
  }
);

export default router;
