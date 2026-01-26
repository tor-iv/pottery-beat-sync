import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

interface SearchResult {
  id: string;
  title: string;
  duration: string;
  channel: string;
  thumbnail: string;
}

// Search YouTube for songs
router.get('/search', async (req: Request, res: Response) => {
  const query = req.query.q as string;

  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }

  try {
    const results = await searchYouTube(query, 5);
    res.json({ results });
  } catch (err) {
    console.error('YouTube search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Search by Spotify track info
router.get('/search-track', async (req: Request, res: Response) => {
  const { name, artist } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'Track name required' });
  }

  const query = artist ? `${name} ${artist}` : name as string;

  try {
    const results = await searchYouTube(query, 3);
    res.json({ results });
  } catch (err) {
    console.error('YouTube search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Download audio from YouTube
router.post('/download', async (req: Request, res: Response) => {
  const { videoId, title } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Video ID required' });
  }

  try {
    const outputPath = await downloadAudio(videoId);

    // Return the file
    res.json({
      success: true,
      path: `/uploads/${path.basename(outputPath)}`,
      filename: path.basename(outputPath),
      title: title || 'YouTube Audio',
    });
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Download failed' });
  }
});

// Stream download (for direct file response)
router.get('/download/:videoId', async (req: Request, res: Response) => {
  const { videoId } = req.params;

  try {
    const outputPath = await downloadAudio(videoId);

    res.sendFile(outputPath, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
    });
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Download failed' });
  }
});

async function searchYouTube(query: string, limit: number = 5): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      `ytsearch${limit}:${query}`,
      '--get-id',
      '--get-title',
      '--get-duration',
      '--get-thumbnail',
      '--no-warnings',
      '--ignore-errors',
    ]);

    let stdout = '';
    let stderr = '';

    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code !== 0 && !stdout) {
        reject(new Error(`Search failed: ${stderr}`));
        return;
      }

      // Parse output - each result has: title, id, duration, thumbnail
      const lines = stdout.trim().split('\n').filter(Boolean);
      const results: SearchResult[] = [];

      // yt-dlp outputs in order: title, id, duration, thumbnail for each result
      for (let i = 0; i < lines.length; i += 4) {
        if (lines[i] && lines[i + 1]) {
          results.push({
            title: lines[i],
            id: lines[i + 1],
            duration: lines[i + 2] || 'Unknown',
            thumbnail: lines[i + 3] || '',
            channel: '', // Would need additional flag to get this
          });
        }
      }

      resolve(results);
    });

    ytdlp.on('error', (err) => {
      reject(new Error(`Failed to run yt-dlp: ${err.message}`));
    });
  });
}

async function downloadAudio(videoId: string): Promise<string> {
  const outputDir = path.join(process.cwd(), 'uploads');
  const outputTemplate = path.join(outputDir, `yt-${uuidv4()}.%(ext)s`);

  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      `https://www.youtube.com/watch?v=${videoId}`,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputTemplate,
      '--no-playlist',
    ]);

    let stderr = '';

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Download failed: ${stderr}`));
        return;
      }

      // Find the downloaded file
      const files = fs.readdirSync(outputDir)
        .filter(f => f.startsWith('yt-') && f.endsWith('.mp3'))
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
      reject(new Error(`Failed to run yt-dlp: ${err.message}`));
    });
  });
}

export default router;
