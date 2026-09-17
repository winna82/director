export const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const DURATIONS = [6, 10, 15] as const;
export type ClipDuration = (typeof DURATIONS)[number];

export const MODES = ["automatic", "storyboard"] as const;
export type DirectorMode = (typeof MODES)[number];

/** How the clip uses the frame: sequential full-frame shots, or panels on screen together. */
export const LAYOUTS = ["single", "split", "grid"] as const;
export type SceneLayout = (typeof LAYOUTS)[number];

export const LAYOUT_LABELS: Record<SceneLayout, string> = {
  single: "Single frame",
  split: "Split screen",
  grid: "Grid",
};

export function asLayout(value: unknown): SceneLayout {
  return (LAYOUTS as readonly unknown[]).includes(value) ? (value as SceneLayout) : "single";
}

export const SHOT_SIZES = [
  "extreme-close-up",
  "close-up",
  "medium-close-up",
  "medium",
  "medium-wide",
  "wide",
  "extreme-wide",
  "two-shot",
  "over-the-shoulder",
] as const;
export type ShotSize = (typeof SHOT_SIZES)[number];

export type Character = {
  name: string;
  look: string;
};

export type WorldBible = {
  setting: string;
  lighting: string;
  palette: string;
  style: string;
  characters: Character[];
};

export type Dialogue = {
  character: string;
  line: string;
};

export type Shot = {
  id: string;
  index: number;
  duration: number;
  shotSize: ShotSize | string;
  angle: string;
  camera: string;
  action: string;
  dialogue: Dialogue | null;
  audio: string;
  prompt: string;
};

export type Storyboard = {
  title: string;
  logline: string;
  world: WorldBible;
  audio: string;
  shots: Shot[];
  sequencePrompt: string;
  /** The layout Director planned these shots for; absent on boards from before layouts. */
  layout?: SceneLayout;
};

export type Continuity = {
  fromTitle: string;
  fromLogline: string;
  fromLastShot: string;
  world: WorldBible;
  audio: string;
  previousVideoUrl: string | null;
  lastFrameDataUrl: string | null;
};

export type VideoJob = {
  requestId: string;
  status: "queued" | "processing" | "done" | "failed" | "expired";
  url: string | null;
  error: string | null;
  kind: "sequence" | "shot";
  shotId: string | null;
  startedAt: number;
  takeId: string | null;
};

export type Project = {
  id: string;
  createdAt: number;
  updatedAt: number;
  brief: string;
  mode: DirectorMode;
  aspectRatio: AspectRatio;
  duration: ClipDuration;
  layout: SceneLayout;
  board: Storyboard | null;
  sequence: VideoJob | null;
  shotJobs: Record<string, VideoJob>;
  reelId: string;
  sceneIndex: number;
  parentId: string | null;
  continuity: Continuity | null;
};

export function emptyProject(partial?: Partial<Project>): Project {
  const id = partial?.id ?? crypto.randomUUID();
  return {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    brief: "",
    mode: "automatic",
    aspectRatio: "16:9",
    duration: 10,
    layout: "single",
    board: null,
    sequence: null,
    shotJobs: {},
    reelId: id,
    sceneIndex: 1,
    parentId: null,
    continuity: null,
    ...partial,
    id,
  };
}

export function reelIdOf(project: Project): string {
  return project.reelId || project.id;
}

export function sceneNumber(project: Project): number {
  return project.sceneIndex || 1;
}

export function bySceneOrder(a: Project, b: Project): number {
  return sceneNumber(a) - sceneNumber(b) || a.createdAt - b.createdAt;
}

/** On-screen scene number: position within the reel, so deleted scenes leave no gaps. */
export function scenePosition(project: Project, projects: Project[]): number {
  const reel = projects.filter((p) => reelIdOf(p) === reelIdOf(project)).sort(bySceneOrder);
  const index = reel.findIndex((p) => p.id === project.id);
  return index === -1 ? reel.length + 1 : index + 1;
}

/** Nothing written yet — not worth keeping in the cloud library. */
export function isBlankDraft(project: Project): boolean {
  return !project.brief.trim() && !project.board && !project.continuity && !project.sequence;
}

export function endingLine(board: Storyboard): string {
  const last = board.shots[board.shots.length - 1];
  if (!last) return board.logline;
  const line = last.dialogue
    ? `${last.dialogue.character} says, "${last.dialogue.line}"`
    : "";
  // Story, not framing: a camera description here reads to Imagine as another image to show.
  return `${last.action} ${line}`.trim();
}
