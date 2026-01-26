import { create } from 'zustand';

export interface VideoSegment {
  id: string;
  file: File;
  name: string;
  label: string;
  duration: number;
  thumbnailUrl: string | null;
  snippets: Snippet[];
}

export interface Snippet {
  id: string;
  segmentId: string;
  startTime: number;
  duration: number;
  qualityScore: number;
}

export interface Beat {
  time: number;
  strength: number;
}

export interface ProjectState {
  // Audio
  audio: File | null;
  audioUrl: string | null;
  bpm: number | null;
  beats: Beat[];

  // Videos
  videos: VideoSegment[];

  // Settings
  outputLength: number;
  cutsPerBeat: string;
  snippetSelection: 'quality' | 'even' | 'random';
  videoMode: 'standard' | 'teaser';
  teaserDuration: number; // Duration of the finished pot reveal at start (in beats)
  exportAudioMode: 'include' | 'video-only'; // Whether to include audio in export
  selectedSongName: string | null; // For reminding user what song to add in TikTok

  // Timeline
  timeline: Array<{
    snippetId: string;
    beatIndex: number;
    duration: number;
  }>;

  // Export
  isExporting: boolean;
  exportProgress: number;

  // Actions
  setAudio: (file: File | null) => void;
  setAudioUrl: (url: string | null) => void;
  setBpm: (bpm: number | null) => void;
  setBeats: (beats: Beat[]) => void;
  addVideo: (video: VideoSegment) => void;
  removeVideo: (id: string) => void;
  updateVideo: (id: string, updates: Partial<VideoSegment>) => void;
  reorderVideos: (fromIndex: number, toIndex: number) => void;
  setOutputLength: (length: number) => void;
  setCutsPerBeat: (value: string) => void;
  setSnippetSelection: (value: 'quality' | 'even' | 'random') => void;
  setVideoMode: (mode: 'standard' | 'teaser') => void;
  setTeaserDuration: (beats: number) => void;
  setExportAudioMode: (mode: 'include' | 'video-only') => void;
  setSelectedSongName: (name: string | null) => void;
  setTimeline: (timeline: ProjectState['timeline']) => void;
  setExporting: (isExporting: boolean) => void;
  setExportProgress: (progress: number) => void;
  reset: () => void;
}

const initialState = {
  audio: null,
  audioUrl: null,
  bpm: null,
  beats: [],
  videos: [],
  outputLength: 30,
  cutsPerBeat: 'variable',
  snippetSelection: 'quality' as const,
  videoMode: 'standard' as const,
  teaserDuration: 4, // 4 beats for the finished pot reveal
  exportAudioMode: 'video-only' as const, // Default to video-only for TikTok workflow
  selectedSongName: null,
  timeline: [],
  isExporting: false,
  exportProgress: 0,
};

export const useProjectStore = create<ProjectState>((set) => ({
  ...initialState,

  setAudio: (file) => set({ audio: file }),

  setAudioUrl: (url) => set({ audioUrl: url }),

  setBpm: (bpm) => set({ bpm }),

  setBeats: (beats) => set({ beats }),

  addVideo: (video) =>
    set((state) => ({ videos: [...state.videos, video] })),

  removeVideo: (id) =>
    set((state) => ({
      videos: state.videos.filter((v) => v.id !== id),
    })),

  updateVideo: (id, updates) =>
    set((state) => ({
      videos: state.videos.map((v) =>
        v.id === id ? { ...v, ...updates } : v
      ),
    })),

  reorderVideos: (fromIndex, toIndex) =>
    set((state) => {
      const videos = [...state.videos];
      const [removed] = videos.splice(fromIndex, 1);
      videos.splice(toIndex, 0, removed);
      return { videos };
    }),

  setOutputLength: (length) => set({ outputLength: length }),

  setCutsPerBeat: (value) => set({ cutsPerBeat: value }),

  setSnippetSelection: (value) => set({ snippetSelection: value }),

  setVideoMode: (mode) => set({ videoMode: mode }),

  setTeaserDuration: (beats) => set({ teaserDuration: beats }),

  setExportAudioMode: (mode) => set({ exportAudioMode: mode }),

  setSelectedSongName: (name) => set({ selectedSongName: name }),

  setTimeline: (timeline) => set({ timeline }),

  setExporting: (isExporting) => set({ isExporting }),

  setExportProgress: (progress) => set({ exportProgress: progress }),

  reset: () => set(initialState),
}));
