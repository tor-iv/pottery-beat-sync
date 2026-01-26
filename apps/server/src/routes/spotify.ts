import { Router, Request, Response } from 'express';
import crypto from 'crypto';

const router = Router();

// Spotify OAuth config - loaded from environment
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/api/spotify/callback';

// In-memory token storage (in production, use a proper session store)
const tokenStore = new Map<string, { accessToken: string; refreshToken: string; expiresAt: number }>();

// Generate authorization URL
router.get('/auth', (req: Request, res: Response) => {
  if (!SPOTIFY_CLIENT_ID) {
    return res.status(500).json({ error: 'Spotify not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const scope = 'user-read-recently-played user-top-read user-library-read playlist-read-private';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state,
  });

  res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
});

// OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`/?spotify_error=${error}`);
  }

  if (!code || typeof code !== 'string') {
    return res.redirect('/?spotify_error=no_code');
  }

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return res.redirect(`/?spotify_error=${tokens.error}`);
    }

    // Store tokens with a session ID
    const sessionId = crypto.randomBytes(32).toString('hex');
    tokenStore.set(sessionId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    // Redirect back to app with session ID
    res.redirect(`/editor?spotify_session=${sessionId}`);
  } catch (err) {
    console.error('Spotify auth error:', err);
    res.redirect('/?spotify_error=auth_failed');
  }
});

// Middleware to get access token
async function getAccessToken(sessionId: string): Promise<string | null> {
  const session = tokenStore.get(sessionId);
  if (!session) return null;

  // Refresh if expired
  if (Date.now() >= session.expiresAt - 60000) {
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: session.refreshToken,
        }),
      });

      const tokens = await response.json();
      if (tokens.access_token) {
        session.accessToken = tokens.access_token;
        session.expiresAt = Date.now() + tokens.expires_in * 1000;
        if (tokens.refresh_token) {
          session.refreshToken = tokens.refresh_token;
        }
      }
    } catch (err) {
      console.error('Token refresh failed:', err);
      return null;
    }
  }

  return session.accessToken;
}

// Get user's recently played tracks
router.get('/recent', async (req: Request, res: Response) => {
  const sessionId = req.headers['x-spotify-session'] as string;
  const accessToken = await getAccessToken(sessionId);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=20', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const data = await response.json();

    const tracks = data.items?.map((item: any) => ({
      id: item.track.id,
      name: item.track.name,
      artist: item.track.artists.map((a: any) => a.name).join(', '),
      album: item.track.album.name,
      albumArt: item.track.album.images[0]?.url,
      duration: item.track.duration_ms,
      playedAt: item.played_at,
    })) || [];

    res.json({ tracks });
  } catch (err) {
    console.error('Failed to fetch recent tracks:', err);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Get user's top tracks
router.get('/top', async (req: Request, res: Response) => {
  const sessionId = req.headers['x-spotify-session'] as string;
  const accessToken = await getAccessToken(sessionId);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const data = await response.json();

    const tracks = data.items?.map((item: any) => ({
      id: item.id,
      name: item.name,
      artist: item.artists.map((a: any) => a.name).join(', '),
      album: item.album.name,
      albumArt: item.album.images[0]?.url,
      duration: item.duration_ms,
    })) || [];

    res.json({ tracks });
  } catch (err) {
    console.error('Failed to fetch top tracks:', err);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Get user's liked songs
router.get('/liked', async (req: Request, res: Response) => {
  const sessionId = req.headers['x-spotify-session'] as string;
  const accessToken = await getAccessToken(sessionId);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me/tracks?limit=20', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const data = await response.json();

    const tracks = data.items?.map((item: any) => ({
      id: item.track.id,
      name: item.track.name,
      artist: item.track.artists.map((a: any) => a.name).join(', '),
      album: item.track.album.name,
      albumArt: item.track.album.images[0]?.url,
      duration: item.track.duration_ms,
      addedAt: item.added_at,
    })) || [];

    res.json({ tracks });
  } catch (err) {
    console.error('Failed to fetch liked tracks:', err);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Get user's playlists
router.get('/playlists', async (req: Request, res: Response) => {
  const sessionId = req.headers['x-spotify-session'] as string;
  const accessToken = await getAccessToken(sessionId);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=20', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const data = await response.json();

    const playlists = data.items?.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      image: item.images[0]?.url,
      trackCount: item.tracks.total,
    })) || [];

    res.json({ playlists });
  } catch (err) {
    console.error('Failed to fetch playlists:', err);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// Check if connected
router.get('/status', async (req: Request, res: Response) => {
  const sessionId = req.headers['x-spotify-session'] as string;

  if (!sessionId) {
    return res.json({ connected: false });
  }

  const accessToken = await getAccessToken(sessionId);

  if (!accessToken) {
    return res.json({ connected: false });
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return res.json({ connected: false });
    }

    const user = await response.json();
    res.json({
      connected: true,
      user: {
        name: user.display_name,
        image: user.images?.[0]?.url,
      },
    });
  } catch {
    res.json({ connected: false });
  }
});

// Disconnect
router.post('/disconnect', (req: Request, res: Response) => {
  const sessionId = req.headers['x-spotify-session'] as string;
  if (sessionId) {
    tokenStore.delete(sessionId);
  }
  res.json({ success: true });
});

export default router;
