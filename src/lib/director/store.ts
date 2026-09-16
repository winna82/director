import { create } from "zustand";
import { persist } from "zustand/middleware";
import { composeSequencePrompt, composeShotPrompt, lockWorld } from "./compose";
import {
  emptyProject,
  endingLine,
  reelIdOf,
  sceneNumber,
  type AspectRatio,
  type ClipDuration,
  type Continuity,
  type DirectorMode,
  type Project,
  type Shot,
  type Storyboard,
  type VideoJob,
} from "./types";

const MAX_PROJECTS = 16;

type DirectorState = {
  projects: Project[];
  currentId: string | null;
  planning: boolean;
  planError: string | null;
  current: () => Project;
  newProject: () => void;
  continueScene: (lastFrameDataUrl?: string | null) => Project | null;
  loadProject: (id: string) => void;
  patch: (partial: Partial<Project>) => void;
  setBrief: (brief: string) => void;
  setMode: (mode: DirectorMode) => void;
  setAspect: (aspectRatio: AspectRatio) => void;
  setDuration: (duration: ClipDuration) => void;
  setBoard: (board: Storyboard) => void;
  updateShot: (shotId: string, patch: Partial<Shot>) => void;
  setSequenceJob: (job: VideoJob | null) => void;
  setShotJob: (shotId: string, job: VideoJob) => void;
  setPlanning: (planning: boolean, error?: string | null) => void;
  hydrateFromCloud: (projects: Project[]) => void;
};

function touch(project: Project, partial: Partial<Project>): Project {
  return { ...project, ...partial, updatedAt: Date.now() };
}

function upsert(projects: Project[], next: Project): Project[] {
  const rest = projects.filter((p) => p.id !== next.id);
  const combined = [next, ...rest];
  if (combined.length <= MAX_PROJECTS) return combined;
  const keepReel = reelIdOf(next);
  const drop: string[] = [];
  for (let i = combined.length - 1; i >= 0 && combined.length - drop.length > MAX_PROJECTS; i--) {
    const row = combined[i];
    if (row && reelIdOf(row) !== keepReel) drop.push(row.id);
  }
  return combined.filter((p) => !drop.includes(p.id)).slice(0, MAX_PROJECTS);
}

export const useDirector = create<DirectorState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentId: null,
      planning: false,
      planError: null,
      current: () => {
        const { projects, currentId } = get();
        return projects.find((p) => p.id === currentId) ?? emptyProject({ id: "draft" });
      },
      newProject: () => {
        const project = emptyProject();
        set((s) => ({
          projects: upsert(s.projects, project),
          currentId: project.id,
          planning: false,
          planError: null,
        }));
      },
      continueScene: (lastFrameDataUrl = null) => {
        const cur = get().current();
        if (!cur.board || cur.id === "draft") return null;
        const continuity: Continuity = {
          fromTitle: cur.board.title,
          fromLogline: cur.board.logline,
          fromLastShot: endingLine(cur.board),
          world: cur.board.world,
          audio: cur.board.audio,
          previousVideoUrl: cur.sequence?.status === "done" ? cur.sequence.url : null,
          lastFrameDataUrl: lastFrameDataUrl ?? null,
        };
        const project = emptyProject({
          reelId: reelIdOf(cur),
          sceneIndex: sceneNumber(cur) + 1,
          parentId: cur.id,
          aspectRatio: cur.aspectRatio,
          duration: cur.duration,
          mode: cur.mode,
          continuity,
        });
        set((s) => ({
          projects: upsert(s.projects, project),
          currentId: project.id,
          planning: false,
          planError: null,
        }));
        return project;
      },
      loadProject: (id) => set({ currentId: id, planError: null }),
      patch: (partial) => {
        const cur = get().current();
        const base =
          cur.id === "draft"
            ? emptyProject({
                brief: cur.brief,
                mode: cur.mode,
                aspectRatio: cur.aspectRatio,
                duration: cur.duration,
                board: cur.board,
                sequence: cur.sequence,
                shotJobs: cur.shotJobs,
                reelId: cur.reelId,
                sceneIndex: cur.sceneIndex,
                parentId: cur.parentId,
                continuity: cur.continuity,
                ...partial,
              })
            : { ...cur, ...partial };
        const next = touch(base, {});
        set((s) => ({ projects: upsert(s.projects, next), currentId: next.id }));
      },
      setBrief: (brief) => get().patch({ brief }),
      setMode: (mode) => get().patch({ mode }),
      setAspect: (aspectRatio) => get().patch({ aspectRatio }),
      setDuration: (duration) => get().patch({ duration }),
      setBoard: (board) => {
        const cur = get().current();
        let next = board;
        if (cur.continuity) {
          const world = lockWorld(board.world, cur.continuity.world);
          next = { ...board, world };
          next.sequencePrompt = composeSequencePrompt(next, cur.continuity);
          next.shots = next.shots.map((shot) => ({
            ...shot,
            prompt: composeShotPrompt(next, shot, cur.continuity),
          }));
        }
        get().patch({ board: next, sequence: null, shotJobs: {} });
      },
      updateShot: (shotId, patch) => {
        const cur = get().current();
        if (!cur.board) return;
        const shots = cur.board.shots.map((shot) =>
          shot.id === shotId ? { ...shot, ...patch } : shot,
        );
        const board: Storyboard = { ...cur.board, shots };
        board.shots = board.shots.map((shot) => ({
          ...shot,
          prompt: composeShotPrompt(board, shot, cur.continuity),
        }));
        board.sequencePrompt = composeSequencePrompt(board, cur.continuity);
        get().patch({ board, sequence: null });
      },
      setSequenceJob: (job) => get().patch({ sequence: job }),
      setShotJob: (shotId, job) => {
        const cur = get().current();
        get().patch({ shotJobs: { ...cur.shotJobs, [shotId]: job } });
      },
      setPlanning: (planning, error = null) => set({ planning, planError: error ?? null }),
      hydrateFromCloud: (incoming) => {
        if (!incoming.length) return;
        set((s) => {
          const map = new Map(s.projects.map((p) => [p.id, p]));
          for (const row of incoming) {
            const local = map.get(row.id);
            if (!local || row.updatedAt >= local.updatedAt) map.set(row.id, row);
          }
          const projects = [...map.values()]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX_PROJECTS);
          const currentId =
            s.currentId && projects.some((p) => p.id === s.currentId)
              ? s.currentId
              : (projects[0]?.id ?? s.currentId);
          return { projects, currentId };
        });
      },
    }),
    {
      name: "director.v1",
      partialize: (s) => ({ projects: s.projects, currentId: s.currentId }),
    },
  ),
);
