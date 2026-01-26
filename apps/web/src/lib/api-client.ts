const API_BASE = '/api';

export interface AnalyzeQualityResult {
  snippets: Array<{
    startTime: number;
    duration: number;
    qualityScore: number;
    motionScore: number;
    sharpnessScore: number;
    brightnessScore: number;
  }>;
}

export interface ExportProgress {
  progress: number;
  stage: 'preparing' | 'extracting' | 'encoding' | 'finalizing';
  message: string;
}

export const api = {
  // Audio endpoints
  async extractTiktokAudio(url: string): Promise<Blob> {
    const response = await fetch(`${API_BASE}/audio/extract-tiktok`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to extract audio');
    }

    return response.blob();
  },

  // Analyze endpoints
  async generateThumbnail(videoFile: File): Promise<Blob> {
    const formData = new FormData();
    formData.append('video', videoFile);

    const response = await fetch(`${API_BASE}/analyze/thumbnail`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to generate thumbnail');
    }

    return response.blob();
  },

  async analyzeQuality(
    videoFile: File,
    segmentCount: number
  ): Promise<AnalyzeQualityResult> {
    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('segmentCount', segmentCount.toString());

    const response = await fetch(`${API_BASE}/analyze/quality`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to analyze quality');
    }

    return response.json();
  },

  // Export endpoints
  async exportVideo(
    formData: FormData,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    // Set up SSE for progress updates if callback provided
    let eventSource: EventSource | null = null;
    if (onProgress) {
      eventSource = new EventSource(`${API_BASE}/export/progress`);
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data) as ExportProgress;
        onProgress(data);
      };
    }

    try {
      const response = await fetch(`${API_BASE}/export`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Export failed');
      }

      return response.blob();
    } finally {
      eventSource?.close();
    }
  },
};
