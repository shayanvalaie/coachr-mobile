export type LineupLaunchRequestInput = {
  gameId: string | null;
  autoGenerate?: boolean;
  lineupVersionId?: string | null;
  startInEditMode?: boolean;
};

export type LineupLaunchRequest = LineupLaunchRequestInput & {
  id: number;
};
