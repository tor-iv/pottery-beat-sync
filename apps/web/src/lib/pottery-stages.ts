export const POTTERY_STAGE_ORDER = [
  'Centering',
  'Coning',
  'Opening',
  'Pulling',
  'Shaping',
  'Finishing',
  'Other',
] as const;

export type PotteryStage = (typeof POTTERY_STAGE_ORDER)[number];

export function getStageIndex(label: string): number {
  const index = POTTERY_STAGE_ORDER.indexOf(label as PotteryStage);
  return index === -1 ? POTTERY_STAGE_ORDER.length : index;
}

export function sortVideosByStage<T extends { label: string }>(videos: T[]): T[] {
  return [...videos].sort((a, b) => getStageIndex(a.label) - getStageIndex(b.label));
}
