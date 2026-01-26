import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { generateThumbnail, analyzeVideoQuality } from '../services/ffmpeg.js';

const router = Router();

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `video-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video file type'));
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
});

// Generate thumbnail from video
router.post('/thumbnail', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  try {
    const thumbnailPath = await generateThumbnail(req.file.path);

    res.sendFile(thumbnailPath, (err) => {
      if (err) {
        console.error('Error sending thumbnail:', err);
        res.status(500).json({ error: 'Failed to send thumbnail' });
      }
    });
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate thumbnail',
    });
  }
});

// Analyze video quality for snippet selection
router.post('/quality', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const segmentCount = parseInt(req.body.segmentCount) || 10;

  try {
    const analysis = await analyzeVideoQuality(req.file.path, segmentCount);
    res.json(analysis);
  } catch (error) {
    console.error('Quality analysis error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to analyze video',
    });
  }
});

// Get video duration
router.post('/duration', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  try {
    const { getVideoDuration } = await import('../services/ffmpeg.js');
    const duration = await getVideoDuration(req.file.path);
    res.json({ duration });
  } catch (error) {
    console.error('Duration detection error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get video duration',
    });
  }
});

export default router;
