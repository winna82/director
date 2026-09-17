import { create } from "zustand";
import { persist } from "zustand/middleware";
import { composeSequencePrompt, composeShotPrompt, lockWorld } from "./compose";
import {
  asLayout,
  bySceneOrder,
  emptyProject,
  endingLine,
  reelIdOf,
  sceneNumber,
  type AspectRatio,
  type ClipDuration,
  type Continuity,
  type DirectorMode,
  type Project,
  type SceneLayout,
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
  setLayout: (layout: SceneLayout) => void;
  setBoard: (board: Storyboard) => void;
  updateShot: (shotId: string, patch: Partial<Shot>) => void;
  setSequenceJob: (job: VideoJob | null) => void;
  setShotJob: (shotId: string, job: VideoJob) => void;
  setContinuityFrame: (lastFrameDataUrl: string | null) => void;
  setJobFor: (sceneId: string, job: VideoJob) => void;
  applyTakes: (sceneId: string, sequence: VideoJob | null, shotJobs: Record<string, VideoJob>) => void;
  removeProjects: (ids: string[]) => void;
  setPlanning: (planning: boolean, error?: string | null) => void;
  hydrateFromCloud: (projects: Project[], opts?: { deletedIds?: string[]; focusId?: string }) => void;
};

/** Recompose every prompt from the board's structured fields for the scene's framing. */
function withPrompts(board: Storyboard, continuity: Continuity | null, aspectRatio: AspectRatio): Storyboard {
  const next: Storyboard = { ...board };
  next.sequencePrompt = composeSequencePrompt(next, continuity, aspectRatio);
  next.shots = next.shots.map((shot) => ({ ...shot, prompt: composeShotPrompt(next, shot, continuity) }));
  return next;
}

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
          layout: cur.layout,
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
                layout: cur.layout,
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
      setAspect: (aspectRatio) => {
        const cur = get().current();
        // Split panels sit side by side or stacked depending on the frame, so prompts follow the aspect.
        get().patch({
          aspectRatio,
          ...(cur.board ? { board: withPrompts(cur.board, cur.continuity, aspectRatio) } : {}),
        });
      },
      setDuration: (duration) => get().patch({ duration }),
      // The board stays planned for its own layout; the studio asks for a re-plan on mismatch.
      setLayout: (layout) => get().patch({ layout }),
      setBoard: (board) => {
        const cur = get().current();
        const world = cur.continuity ? lockWorld(board.world, cur.continuity.world) : board.world;
        const next = withPrompts({ ...board, world }, cur.continuity, cur.aspectRatio);
        get().patch({ board: next, sequence: null, shotJobs: {} });
      },
      updateShot: (shotId, patch) => {
        const cur = get().current();
        if (!cur.board) return;
        const shots = cur.board.shots.map((shot) =>
          shot.id === shotId ? { ...shot, ...patch } : shot,
        );
        const board = withPrompts({ ...cur.board, shots }, cur.continuity, cur.aspectRatio);
        get().patch({ board, sequence: null });
      },
      setSequenceJob: (job) => get().patch({ sequence: job }),
      setShotJob: (shotId, job) => {
        const cur = get().current();
        get().patch({ shotJobs: { ...cur.shotJobs, [shotId]: job } });
      },
      setContinuityFrame: (lastFrameDataUrl) => {
        const cur = get().current();
        if (!cur.continuity) return;
        get().patch({ continuity: { ...cur.continuity, lastFrameDataUrl } });
      },
      // Rolls land on the scene that started them, even if another scene is open by then.
      setJobFor: (sceneId, job) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== sceneId) return p;
            if (job.kind === "shot" && job.shotId) {
              return { ...p, shotJobs: { ...p.shotJobs, [job.shotId]: job }, updatedAt: Date.now() };
            }
            return { ...p, sequence: job, updatedAt: Date.now() };
          }),
        })),
      applyTakes: (sceneId, sequence, shotJobs) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === sceneId ? { ...p, sequence, shotJobs, updatedAt: Date.now() } : p,
          ),
        })),
      removeProjects: (ids) => {
        const gone = new Set(ids);
        set((s) => {
          if (!s.projects.some((p) => gone.has(p.id))) return {};
          const projects = s.projects.filter((p) => !gone.has(p.id));
          const was = s.projects.find((p) => p.id === s.currentId);
          if (!was || !gone.has(was.id)) return { projects };
          // Land on the neighbouring scene of the same reel, else the latest work.
          const reel = s.projects.filter((p) => reelIdOf(p) === reelIdOf(was)).sort(bySceneOrder);
          const at = reel.findIndex((p) => p.id === was.id);
          const neighbour = [...reel.slice(0, at).reverse(), ...reel.slice(at + 1)].find((p) => !gone.has(p.id));
          const next = neighbour ?? projects[0];
          if (next) return { projects, currentId: next.id, planError: null };
          const fresh = emptyProject();
          return { projects: [fresh], currentId: fresh.id, planError: null };
        });
      },
      setPlanning: (planning, error = null) => set({ planning, planError: error ?? null }),
      hydrateFromCloud: (incoming, opts = {}) => {
        const gone = new Set(opts.deletedIds ?? []);
        if (!incoming.length && !gone.size) return;
        set((s) => {
          const map = new Map(s.projects.filter((p) => !gone.has(p.id)).map((p) => [p.id, p]));
          for (const row of incoming) {
            const local = map.get(row.id);
            if (!local || row.updatedAt >= local.updatedAt) map.set(row.id, row);
          }
          const focusId = opts.focusId && map.has(opts.focusId) ? opts.focusId : s.currentId;
          const focus = focusId ? map.get(focusId) : undefined;
          // Keep the whole focused reel even when the cap would cut some of its scenes.
          const sorted = [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
          const inReel = sorted.filter((p) => focus && reelIdOf(p) === reelIdOf(focus));
          const others = sorted.filter((p) => !focus || reelIdOf(p) !== reelIdOf(focus));
          const projects = [...inReel, ...others.slice(0, Math.max(0, MAX_PROJECTS - inReel.length))].sort(
            (a, b) => b.updatedAt - a.updatedAt,
          );
          const currentId =
            focusId && projects.some((p) => p.id === focusId) ? focusId : (projects[0]?.id ?? null);
          if (currentId) return { projects, currentId };
          const fresh = emptyProject();
          return { projects: [fresh], currentId: fresh.id };
        });
      },
    }),
    {
      name: "director.v1",
      version: 1,
      // v0 projects predate layouts.
      migrate: (persisted) => {
        const state = persisted as { projects?: Project[]; currentId?: string | null };
        return {
          ...state,
          projects: (state.projects ?? []).map((p) => ({ ...p, layout: asLayout(p.layout) })),
        } as DirectorState;
      },
      partialize: (s) => ({ projects: s.projects, currentId: s.currentId }),
    },
  ),
);
