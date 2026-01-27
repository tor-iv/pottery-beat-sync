import Dexie, { Table } from 'dexie';

export interface Project {
  id?: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  audioName: string | null;
  bpm: number | null;
  videoNames: string[];
  videoLabels: string[];
  outputLength: number;
  snippetSelection: 'quality' | 'even' | 'random';
}

export interface Preset {
  id?: number;
  name: string;
  createdAt: Date;
  outputLength: number;
  snippetSelection: 'quality' | 'even' | 'random';
  stageOrder: string[];
}

class PotteryBeatSyncDB extends Dexie {
  projects!: Table<Project>;
  presets!: Table<Preset>;

  constructor() {
    super('PotteryBeatSyncDB');

    this.version(1).stores({
      projects: '++id, name, createdAt, updatedAt',
      presets: '++id, name, createdAt',
    });
  }
}

export const db = new PotteryBeatSyncDB();
