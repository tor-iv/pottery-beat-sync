declare module 'essentia.js' {
  export function EssentiaWASM(): Promise<any>;
  export class Essentia {
    constructor(wasmModule: any);
    arrayToVector(arr: Float32Array): any;
    vectorToArray(vec: any): Float32Array;
    RhythmExtractor2013(signal: any, options?: any): {
      bpm: number;
      ticks: Float32Array;
      estimates: Float32Array;
      bpmIntervals: Float32Array;
    };
    OnsetDetection(signal: any, options?: any): {
      onsetDetection: Float32Array;
    };
    Energy(signal: any): { energy: number };
    RMS(signal: any): { rms: number };
    delete(): void;
  }
}
