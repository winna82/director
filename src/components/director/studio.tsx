import { Clapperboard, Copy, LoaderCircle, PanelLeft, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FramePicker } from "@/components/director/frame-picker";
import { LibraryDrawer } from "@/components/director/library-drawer";
import { SceneStrip } from "@/components/director/scene-strip";
import { Segmented } from "@/components/director/segmented";
import { Monitor } from "@/components/director/monitor";
import { watchJob } from "@/components/director/poll";
import { ShotList } from "@/components/director/shot-list";
import { TakeList } from "@/components/director/take-list";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserButton } from "@/lib/auth/gates";
import { checkAi, grabFrame, planStoryboard, startVideo } from "@/lib/director/ai";
import { composeShotPrompt } from "@/lib/director/compose";
import { EXAMPLES } from "@/lib/director/examples";
import { listReelScenes } from "@/lib/director/library";
import { archiveTake, listScenes, saveScene } from "@/lib/director/persist";
import { useDirector } from "@/lib/director/store";
import { vaultPut } from "@/lib/director/vault";
import { isBlankDraft, reelIdOf, scenePosition, type Shot, type VideoJob } from "@/lib/director/types";
import { cn } from "@/lib/utils";

const LIBRARY_OPEN_KEY = "director.library-open";

type Busy = { sceneId: string; kind: VideoJob["kind"]; shotId: string | null };

function isRolling(job: VideoJob | null | undefined): job is VideoJob {
  return Boolean(job) && (job?.status === "queued" || job?.status === "processing");
}

export function Studio() {
  const {
    current,
    projects,
    planning,
    planError,
    newProject,
    continueScene,
    loadProject,
    setBrief,
    setMode,
    setAspect,
    setDuration,
    setBoard,
    updateShot,
    setJobFor,
    setContinuityFrame,
    removeProjects,
    setPlanning,
    hydrateFromCloud,
  } = useDirector();
  const project = current();

  const [ready, setReady] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [pickingFrame, setPickingFrame] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // One poller per in-flight generation, keyed by request id.
  const watchers = useRef(new Map<string, () => void>());

  // The take the continuity frame comes from: the parent scene's current sequence
  // (it may have been rolled after Next scene). The whole reel is loaded, so a
  // missing parent means it was deleted.
  const parent = project.parentId ? projects.find((p) => p.id === project.parentId) : undefined;
  const parentDeleted = Boolean(project.parentId) && !parent;
  const previousTakeUrl = parent?.sequence?.status === "done" ? parent.sequence.url : null;

  useEffect(() => {
    try {
      setLibraryOpen(window.localStorage.getItem(LIBRARY_OPEN_KEY) === "1");
    } catch {
      /* storage unavailable — start closed */
    }
  }, []);

  function toggleLibrary(open: boolean) {
    setLibraryOpen(open);
    try {
      window.localStorage.setItem(LIBRARY_OPEN_KEY, open ? "1" : "0");
    } catch {
      /* per-viewer convenience only */
    }
  }

  useEffect(() => {
    setPickingFrame(false);
  }, [project.id]);

  useEffect(() => {
    const ensure = () => {
      if (!useDirector.getState().currentId) {
        useDirector.getState().newProject();
      }
      setReady(true);
    };
    if (useDirector.persist.hasHydrated()) ensure();
    return useDirector.persist.onFinishHydration(ensure);
  }, []);

  useEffect(() => {
    checkAi()
      .then((r) => setAiReady(r.ok))
      .catch(() => setAiReady(false));
  }, []);

  useEffect(() => {
    if (!ready) return;
    listScenes()
      .then(async (res) => {
        if (!res.ok) return;
        hydrateFromCloud(res.projects, { deletedIds: res.deletedIds });
        // Recent scenes are capped; load the open reel in full so numbering and continuity are complete.
        const open = useDirector.getState().current();
        if (open.id === "draft") return;
        const reel = await listReelScenes({ data: { reelId: reelIdOf(open) } });
        hydrateFromCloud(reel.projects);
      })
      .catch(() => {});
  }, [ready, hydrateFromCloud]);

  useEffect(() => {
    if (!ready) return;
    const p = useDirector.getState().current();
    if (p.id === "draft" || isBlankDraft(p)) return;
    const timer = window.setTimeout(() => {
      const scene = useDirector.getState().current();
      saveScene({ data: scene })
        .then((res) => {
          // Deleted in another tab or device: drop the local copy instead of resurrecting it.
          if (!res.ok && res.deleted) removeProjects([scene.id]);
        })
        .catch(() => {});
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [ready, project.id, project.updatedAt, removeProjects]);

  useEffect(() => {
    const active = watchers.current;
    return () => {
      for (const stop of active.values()) stop();
      active.clear();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Resume in-flight rolls of the open scene after a refresh or scene switch.
    for (const job of [project.sequence, ...Object.values(project.shotJobs)]) {
      if (isRolling(job)) beginWatch(project.id, job);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, project.id]);

  function sceneById(id: string) {
    return useDirector.getState().projects.find((p) => p.id === id);
  }

  async function lockTake(
    sceneId: string,
    partial: VideoJob,
    next: Pick<VideoJob, "status" | "url" | "error">,
  ): Promise<VideoJob> {
    const merged: VideoJob = { ...partial, ...next, takeId: partial.takeId ?? null };
    if (next.status !== "done" || !next.url || next.url.startsWith("/api/media/")) return merged;
    const scene = sceneById(sceneId);
    if (!scene) return merged;
    try {
      await saveScene({ data: scene });
      const archived = await archiveTake({
        data: {
          sceneId,
          requestId: partial.requestId,
          videoUrl: next.url,
          kind: partial.kind,
          shotId: partial.shotId,
        },
      });
      if (!archived.ok) return merged;
      try {
        const blob = await fetch(archived.playUrl).then((r) => r.blob());
        await vaultPut(archived.takeId, blob);
      } catch {
        /* vault is best-effort */
      }
      return { ...merged, url: archived.playUrl, takeId: archived.takeId };
    } catch {
      return merged;
    }
  }

  function beginWatch(sceneId: string, seed: VideoJob, onSettled?: (job: VideoJob) => void) {
    if (watchers.current.has(seed.requestId)) return;
    const stop = watchJob(seed.requestId, (next) => {
      void lockTake(sceneId, seed, next).then((job) => {
        setJobFor(sceneId, job);
        if (isRolling(job)) return;
        watchers.current.delete(seed.requestId);
        const scene = sceneById(sceneId);
        if (scene) void saveScene({ data: scene }).catch(() => {});
        onSettled?.(job);
      });
    });
    watchers.current.set(seed.requestId, stop);
  }

  async function onPlan() {
    if (aiReady === false) {
      toast.error("AI is not available in this environment.");
      return;
    }
    setPlanning(true, null);
    const continuity = project.continuity
      ? {
          fromTitle: project.continuity.fromTitle,
          fromLogline: project.continuity.fromLogline,
          fromLastShot: project.continuity.fromLastShot,
          world: project.continuity.world,
          audio: project.continuity.audio,
        }
      : null;
    const result = await planStoryboard({
      data: {
        brief: project.brief,
        mode: project.mode,
        aspectRatio: project.aspectRatio,
        duration: project.duration,
        continuity,
      },
    });
    if (!result.ok) {
      setPlanning(false, result.error);
      toast.error(result.error);
      return;
    }
    setBoard(result.board);
    setPlanning(false, null);
    toast.success("Coverage is locked.");
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      requestAnimationFrame(() => {
        document.getElementById("storyboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  async function rollSequence() {
    if (!project.board) return;
    if (aiReady === false) {
      toast.error("AI is not available in this environment.");
      return;
    }
    const sceneId = project.id;
    setBusy({ sceneId, kind: "sequence", shotId: null });
    const result = await startVideo({
      data: {
        prompt: project.board.sequencePrompt,
        duration: project.duration,
        aspectRatio: project.aspectRatio,
        startImageDataUrl: project.continuity?.lastFrameDataUrl ?? null,
      },
    });
    if (!result.ok) {
      setBusy(null);
      toast.error(result.error);
      return;
    }
    const job: VideoJob = {
      requestId: result.requestId,
      status: "queued",
      url: null,
      error: null,
      kind: "sequence",
      shotId: null,
      startedAt: Date.now(),
      takeId: null,
    };
    setJobFor(sceneId, job);
    beginWatch(sceneId, job, (settled) => {
      setBusy(null);
      if (settled.status === "done") toast.success("Take is in and archived.");
      else toast.error(settled.error || "The take failed.");
    });
  }

  async function rollShot(shot: Shot) {
    if (!project.board) return;
    if (aiReady === false) {
      toast.error("AI is not available in this environment.");
      return;
    }
    const duration = Math.min(15, Math.max(1, shot.duration));
    const prompt = shot.prompt || composeShotPrompt(project.board, shot);
    const sceneId = project.id;
    setBusy({ sceneId, kind: "shot", shotId: shot.id });
    const result = await startVideo({
      data: {
        prompt,
        duration,
        aspectRatio: project.aspectRatio,
        // Only the opening shot picks up from the previous scene's frame.
        startImageDataUrl: shot.index === 1 ? (project.continuity?.lastFrameDataUrl ?? null) : null,
      },
    });
    if (!result.ok) {
      setBusy(null);
      toast.error(result.error);
      return;
    }
    const job: VideoJob = {
      requestId: result.requestId,
      status: "queued",
      url: null,
      error: null,
      kind: "shot",
      shotId: shot.id,
      startedAt: Date.now(),
      takeId: null,
    };
    setJobFor(sceneId, job);
    beginWatch(sceneId, job, (settled) => {
      setBusy(null);
      if (settled.status !== "done") toast.error(settled.error || "The shot failed.");
    });
  }

  async function onContinue() {
    if (!project.board) return;
    setContinuing(true);
    let lastFrame: string | null = null;
    if (project.sequence?.status === "done" && project.sequence.url) {
      const frame = await grabFrame({ data: { videoUrl: project.sequence.url } });
      if (frame.ok) lastFrame = frame.dataUrl;
    }
    const next = continueScene(lastFrame);
    setContinuing(false);
    if (!next) {
      toast.error("Board a scene before continuing.");
      return;
    }
    const position = scenePosition(next, useDirector.getState().projects);
    toast.success(
      lastFrame
        ? `Scene ${position} is on the desk. Last frame is locked.`
        : `Scene ${position} is on the desk. Write what happens next.`,
    );
    requestAnimationFrame(() => document.getElementById("brief")?.focus());
  }

  async function pickFrameAt(seconds: number) {
    if (!previousTakeUrl) return;
    setGrabbing(true);
    try {
      const frame = await grabFrame({ data: { videoUrl: previousTakeUrl, atSeconds: seconds } });
      if (!frame.ok) {
        toast.error(frame.error);
        return;
      }
      setContinuityFrame(frame.dataUrl);
      setPickingFrame(false);
      toast.success(`Scene ${n} opens on the frame at ${seconds.toFixed(1)}s.`);
    } catch {
      toast.error("Couldn't pull that frame.");
    } finally {
      setGrabbing(false);
    }
  }

  async function copyPrompt() {
    if (!project.board) return;
    try {
      await navigator.clipboard.writeText(project.board.sequencePrompt);
      toast.success("Sequence prompt copied.");
    } catch {
      toast.error("Couldn't copy the prompt.");
    }
  }

  function closeLibraryOnSmallScreens() {
    if (window.innerWidth < 1024) toggleLibrary(false);
  }

  async function openReel(reelId: string) {
    try {
      const res = await listReelScenes({ data: { reelId } });
      const latest = [...res.projects].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!latest) {
        toast.error("That reel has no scenes left.");
        return;
      }
      hydrateFromCloud(res.projects, { focusId: latest.id });
      closeLibraryOnSmallScreens();
    } catch {
      toast.error("Couldn't open the reel.");
    }
  }

  function openScene(sceneId: string) {
    loadProject(sceneId);
    closeLibraryOnSmallScreens();
  }

  function startReel() {
    newProject();
    closeLibraryOnSmallScreens();
    requestAnimationFrame(() => document.getElementById("brief")?.focus());
  }

  const canPlan = project.brief.trim().length >= 8 && !planning && busy === null && !continuing;
  const canRoll = Boolean(project.board) && busy === null && !planning && !continuing;
  const canContinue = Boolean(project.board) && busy === null && !planning && !continuing;
  const rollingHere = busy?.sceneId === project.id ? busy : null;
  const n = scenePosition(project, projects);

  return (
    <div
      className={cn(
        "min-h-dvh bg-bg text-fg transition-[padding] duration-[var(--motion-fast)] ease-[var(--ease-out)]",
        libraryOpen && "lg:pl-80",
      )}
    >
      <LibraryDrawer
        open={libraryOpen}
        onClose={() => toggleLibrary(false)}
        project={project}
        projects={projects}
        onOpenReel={(reelId) => void openReel(reelId)}
        onOpenScene={openScene}
        onNewReel={startReel}
      />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={libraryOpen ? "Close library" : "Open library"}
              aria-expanded={libraryOpen}
              onClick={() => toggleLibrary(!libraryOpen)}
              className="-ml-2"
            >
              <PanelLeft className="size-5" />
            </Button>
            <Clapperboard className="size-5 text-fg" />
            <div>
              <p className="font-display text-2xl leading-none tracking-tight">Director</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-subtle">
                Grok Imagine
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UserButton />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canContinue}
              onClick={onContinue}
            >
              {continuing ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Next scene
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={startReel}>
              <Plus className="size-4" />
              New reel
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-display text-4xl leading-none tracking-tight sm:text-5xl">
              {project.continuity ? "Pick up from the last cut." : "Block the scene."}
              <span className="italic text-muted"> Then roll.</span>
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              {project.continuity
                ? "Faces, wardrobe, and style stay locked from the previous scene. Write only what happens next."
                : "Grok directs coverage like a DP — shots, camera, dialogue, sound. Imagine exposes a multi-shot clip from that board."}
            </p>
          </div>

          <SceneStrip project={project} projects={projects} onSelect={loadProject} />

          {project.continuity ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
              <div className="flex gap-3">
                {project.continuity.lastFrameDataUrl ? (
                  <img
                    src={project.continuity.lastFrameDataUrl}
                    alt="Opening frame"
                    className="h-16 w-24 shrink-0 rounded-md object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-widest text-subtle">
                    Continuing scene {String(n).padStart(2, "0")}
                  </p>
                  <p className="mt-1 text-sm text-fg">{project.continuity.fromTitle}</p>
                  <p className="mt-1 text-sm text-muted">Ended on: {project.continuity.fromLastShot}</p>
                  <p className="mt-1 text-xs text-subtle">
                    {project.continuity.lastFrameDataUrl
                      ? "The take opens on this frame."
                      : previousTakeUrl
                        ? "No opening frame — faces and wardrobe are locked by description only."
                        : parentDeleted
                          ? "The previous scene was deleted — faces and wardrobe stay locked by description."
                          : "Roll camera on the previous scene to open on one of its frames."}
                  </p>
                  {previousTakeUrl && !pickingFrame ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => setPickingFrame(true)}
                      >
                        Choose frame
                      </Button>
                      {project.continuity.lastFrameDataUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => setContinuityFrame(null)}
                        >
                          No frame
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              {pickingFrame && previousTakeUrl ? (
                <FramePicker
                  videoUrl={previousTakeUrl}
                  busy={grabbing}
                  onPick={pickFrameAt}
                  onCancel={() => setPickingFrame(false)}
                />
              ) : null}
            </div>
          ) : null}

          {aiReady === false ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
              AI features are unavailable here. The desk still opens; generation is paused.
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="brief" className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">
                Scene brief
              </label>
              <Segmented
                ariaLabel="Director mode"
                value={project.mode}
                onChange={setMode}
                options={[
                  { value: "automatic", label: "Automatic" },
                  { value: "storyboard", label: "Storyboard" },
                ]}
              />
            </div>
            <Textarea
              id="brief"
              value={project.brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={
                project.continuity
                  ? "What happens next. Same people, same world — pick up from the last shot."
                  : project.mode === "storyboard"
                    ? "Shot 1, 4s, wide: rainy alley, slow dolly in. Shot 2, close-up, she says…"
                    : "Who is in the frame, where, what happens, and what is said."
              }
            />
            {!project.continuity ? (
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setBrief(ex.brief)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:text-fg"
                >
                  {ex.label}
                </button>
              ))}
            </div>
            ) : (
              <p className="text-xs text-subtle">
                Locked: {project.continuity.world.characters.map((c) => c.name).join(", ") || "world bible"}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">
                Format
              </span>
              <div className="flex flex-wrap gap-2">
                <Segmented
                  ariaLabel="Aspect ratio"
                  value={project.aspectRatio}
                  onChange={setAspect}
                  options={[
                    { value: "16:9", label: "16:9" },
                    { value: "9:16", label: "9:16" },
                    { value: "1:1", label: "1:1" },
                  ]}
                />
                <Segmented
                  ariaLabel="Duration"
                  value={project.duration}
                  onChange={setDuration}
                  options={[
                    { value: 6, label: "6s" },
                    { value: 10, label: "10s" },
                    { value: 15, label: "15s" },
                  ]}
                />
              </div>
            </div>
            <Button type="button" size="lg" disabled={!canPlan} onClick={onPlan}>
              {planning ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Blocking
                </>
              ) : (
                "Call Director"
              )}
            </Button>
          </div>

          {planError ? <p className="text-sm text-danger">{planError}</p> : null}

        </section>

        <section className="flex flex-col gap-8">
          {project.board ? (
            <div id="storyboard" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">
                    Storyboard · Scene {String(n).padStart(2, "0")}
                  </p>
                  <h2 className="mt-1 font-display text-2xl tracking-tight">
                    {project.board.title}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={copyPrompt}>
                    <Copy className="size-3.5" />
                    Copy prompt
                  </Button>
                  <Button type="button" size="sm" disabled={!canRoll} onClick={rollSequence}>
                    {rollingHere?.kind === "sequence" ? (
                      <>
                        <LoaderCircle className="size-3.5 animate-spin" />
                        Rolling
                      </>
                    ) : (
                      "Roll camera"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!canContinue}
                    onClick={onContinue}
                  >
                    Next scene
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted">
                {project.board.world.style}. {project.board.audio}
              </p>
              <ShotList
                board={project.board}
                shotJobs={project.shotJobs}
                onChange={updateShot}
                onRollShot={rollShot}
                rollingId={rollingHere?.kind === "shot" ? rollingHere.shotId : null}
              />
              <p className="text-xs text-subtle">
                Roll camera generates one {project.duration}s sequence from the full board.
                Next scene carries faces, wardrobe, and the ending beat into the following clip.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-5 py-8 text-sm text-muted">
              {project.continuity
                ? "Write the next beat, then Call Director. Coverage will pick up from the previous ending with the same faces and wardrobe."
                : "Automatic mode lets Grok choose coverage. Storyboard mode follows the shots you write in the brief."}
            </div>
          )}

          <Monitor
            aspect={project.aspectRatio}
            job={project.sequence}
            title={project.board?.logline}
          />

          <TakeList project={project} />
        </section>
      </main>
    </div>
  );
}
