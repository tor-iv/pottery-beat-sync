'use client';

import { useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { db, Project, Preset } from '@/lib/db';

export function useProject() {
  const store = useProjectStore();

  const saveProject = useCallback(
    async (name: string) => {
      const project: Omit<Project, 'id'> = {
        name,
        createdAt: new Date(),
        updatedAt: new Date(),
        audioName: store.audio?.name || null,
        bpm: store.bpm,
        videoNames: store.videos.map((v) => v.name),
        videoLabels: store.videos.map((v) => v.label),
        outputLength: store.outputLength,
        cutsPerBeat: store.cutsPerBeat,
        snippetSelection: store.snippetSelection,
      };

      const id = await db.projects.add(project);
      return id;
    },
    [store]
  );

  const loadProject = useCallback(async (id: number) => {
    const project = await db.projects.get(id);
    if (!project) throw new Error('Project not found');

    store.setOutputLength(project.outputLength);
    store.setCutsPerBeat(project.cutsPerBeat);
    store.setSnippetSelection(project.snippetSelection);
    if (project.bpm) store.setBpm(project.bpm);

    return project;
  }, [store]);

  const listProjects = useCallback(async () => {
    return db.projects.orderBy('updatedAt').reverse().toArray();
  }, []);

  const deleteProject = useCallback(async (id: number) => {
    await db.projects.delete(id);
  }, []);

  const savePreset = useCallback(
    async (name: string) => {
      const preset: Omit<Preset, 'id'> = {
        name,
        createdAt: new Date(),
        outputLength: store.outputLength,
        cutsPerBeat: store.cutsPerBeat,
        snippetSelection: store.snippetSelection,
        stageOrder: store.videos.map((v) => v.label),
      };

      const id = await db.presets.add(preset);
      return id;
    },
    [store]
  );

  const loadPreset = useCallback(async (id: number) => {
    const preset = await db.presets.get(id);
    if (!preset) throw new Error('Preset not found');

    store.setOutputLength(preset.outputLength);
    store.setCutsPerBeat(preset.cutsPerBeat);
    store.setSnippetSelection(preset.snippetSelection);

    return preset;
  }, [store]);

  const listPresets = useCallback(async () => {
    return db.presets.orderBy('name').toArray();
  }, []);

  const deletePreset = useCallback(async (id: number) => {
    await db.presets.delete(id);
  }, []);

  return {
    saveProject,
    loadProject,
    listProjects,
    deleteProject,
    savePreset,
    loadPreset,
    listPresets,
    deletePreset,
  };
}
