'use client';

import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useAudioAnalysis } from '@/hooks/useAudioAnalysis';

interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;
  duration: number;
}

interface YouTubeResult {
  id: string;
  title: string;
  duration: string;
  thumbnail: string;
}

export function SongSearch() {
  const { setAudio, setAudioUrl, setSelectedSongName } = useProjectStore();
  const { analyze } = useAudioAnalysis();

  const [spotifySession, setSpotifySession] = useState<string | null>(null);
  const [spotifyUser, setSpotifyUser] = useState<{ name: string; image?: string } | null>(null);
  const [spotifyTracks, setSpotifyTracks] = useState<SpotifyTrack[]>([]);
  const [activeTab, setActiveTab] = useState<'recent' | 'top' | 'liked'>('recent');

  const [searchQuery, setSearchQuery] = useState('');
  const [youtubeResults, setYoutubeResults] = useState<YouTubeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedSong, setSelectedSong] = useState<string | null>(null);

  // Check for Spotify session on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('spotify_session') || localStorage.getItem('spotify_session');

    if (session) {
      localStorage.setItem('spotify_session', session);
      setSpotifySession(session);

      // Clean URL
      if (params.has('spotify_session')) {
        window.history.replaceState({}, '', '/editor');
      }
    }
  }, []);

  // Check Spotify connection status
  useEffect(() => {
    if (!spotifySession) return;

    fetch('/api/spotify/status', {
      headers: { 'x-spotify-session': spotifySession },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.connected) {
          setSpotifyUser(data.user);
          loadSpotifyTracks('recent');
        } else {
          localStorage.removeItem('spotify_session');
          setSpotifySession(null);
        }
      })
      .catch(() => {
        localStorage.removeItem('spotify_session');
        setSpotifySession(null);
      });
  }, [spotifySession]);

  const loadSpotifyTracks = async (tab: 'recent' | 'top' | 'liked') => {
    if (!spotifySession) return;

    setActiveTab(tab);

    try {
      const response = await fetch(`/api/spotify/${tab}`, {
        headers: { 'x-spotify-session': spotifySession },
      });
      const data = await response.json();
      setSpotifyTracks(data.tracks || []);
    } catch (err) {
      console.error('Failed to load tracks:', err);
    }
  };

  const connectSpotify = async () => {
    try {
      const response = await fetch('/api/spotify/auth');
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error('Failed to start Spotify auth:', err);
    }
  };

  const disconnectSpotify = async () => {
    if (spotifySession) {
      await fetch('/api/spotify/disconnect', {
        method: 'POST',
        headers: { 'x-spotify-session': spotifySession },
      });
    }
    localStorage.removeItem('spotify_session');
    setSpotifySession(null);
    setSpotifyUser(null);
    setSpotifyTracks([]);
  };

  const searchYouTube = async (query: string) => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      setYoutubeResults(data.results || []);
    } catch (err) {
      console.error('YouTube search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const searchForSpotifyTrack = async (track: SpotifyTrack) => {
    const query = `${track.name} ${track.artist}`;
    setSearchQuery(query);
    setSelectedSong(`${track.name} - ${track.artist}`);
    await searchYouTube(query);
  };

  const downloadAndUseAudio = useCallback(
    async (videoId: string, title: string) => {
      setIsDownloading(true);
      setDownloadingId(videoId);

      try {
        const response = await fetch('/api/youtube/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, title }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Download failed');
        }

        // Fetch the audio file
        const audioResponse = await fetch(data.path);
        const blob = await audioResponse.blob();
        const file = new File([blob], data.filename, { type: 'audio/mpeg' });

        setAudio(file);
        const url = URL.createObjectURL(file);
        setAudioUrl(url);
        await analyze(file);

        setSelectedSong(title);
        setSelectedSongName(title); // Store for export reminder
      } catch (err) {
        console.error('Download failed:', err);
        alert(err instanceof Error ? err.message : 'Download failed');
      } finally {
        setIsDownloading(false);
        setDownloadingId(null);
      }
    },
    [setAudio, setAudioUrl, analyze, setSelectedSongName]
  );

  const formatDuration = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Selected Song Display */}
      {selectedSong && (
        <div className="bg-primary-500/20 border border-primary-500/50 rounded-lg p-3">
          <p className="text-sm text-primary-300">Selected for TikTok:</p>
          <p className="text-white font-medium">{selectedSong}</p>
          <p className="text-xs text-gray-400 mt-1">
            Remember to add this song in TikTok after uploading
          </p>
        </div>
      )}

      {/* Spotify Section */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            <span className="text-white font-medium">Spotify</span>
          </div>

          {spotifyUser ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">{spotifyUser.name}</span>
              <button
                onClick={disconnectSpotify}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connectSpotify}
              className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded transition-colors"
            >
              Connect
            </button>
          )}
        </div>

        {spotifyUser && (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-3">
              {(['recent', 'top', 'liked'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => loadSpotifyTracks(tab)}
                  className={`text-xs px-3 py-1 rounded transition-colors ${
                    activeTab === tab
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                >
                  {tab === 'recent' ? 'Recent' : tab === 'top' ? 'Top' : 'Liked'}
                </button>
              ))}
            </div>

            {/* Track List */}
            <div className="max-h-48 overflow-y-auto space-y-1">
              {spotifyTracks.map((track) => (
                <button
                  key={track.id}
                  onClick={() => searchForSpotifyTrack(track)}
                  className="w-full flex items-center gap-3 p-2 rounded hover:bg-gray-600/50 transition-colors text-left"
                >
                  {track.albumArt && (
                    <img
                      src={track.albumArt}
                      alt={track.album}
                      className="w-10 h-10 rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{track.name}</p>
                    <p className="text-gray-400 text-xs truncate">{track.artist}</p>
                  </div>
                  <span className="text-gray-500 text-xs">
                    {formatDuration(track.duration)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* YouTube Search */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span className="text-white font-medium">YouTube Search</span>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchYouTube(searchQuery)}
            placeholder="Search for a song..."
            className="flex-1 bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white text-sm placeholder-gray-400"
          />
          <button
            onClick={() => searchYouTube(searchQuery)}
            disabled={isSearching}
            className="bg-red-500 hover:bg-red-600 disabled:bg-gray-600 text-white px-4 py-2 rounded transition-colors text-sm"
          >
            {isSearching ? '...' : 'Search'}
          </button>
        </div>

        {/* Results */}
        {youtubeResults.length > 0 && (
          <div className="space-y-2">
            {youtubeResults.map((result) => (
              <div
                key={result.id}
                className="flex items-center gap-3 p-2 rounded bg-gray-600/30"
              >
                {result.thumbnail && (
                  <img
                    src={result.thumbnail}
                    alt={result.title}
                    className="w-16 h-12 object-cover rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{result.title}</p>
                  <p className="text-gray-400 text-xs">{result.duration}</p>
                </div>
                <button
                  onClick={() => downloadAndUseAudio(result.id, result.title)}
                  disabled={isDownloading}
                  className="bg-primary-500 hover:bg-primary-600 disabled:bg-gray-600 text-white text-xs px-3 py-1 rounded transition-colors whitespace-nowrap"
                >
                  {downloadingId === result.id ? 'Downloading...' : 'Use This'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
