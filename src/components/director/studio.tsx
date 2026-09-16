import { Clapperboard, Copy, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SceneStrip } from "@/components/director/scene-strip";
import { Segmented } from "@/components/director/segmented";
import { Monitor } from "@/components/director/monitor";
import { watchJob } from "@/components/director/poll";
import { ShotList } from "@/components/director/shot-list";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserButton } from "@/lib/auth/gates";
import { checkAi, grabLastFrame, planStoryboard, startVideo } from "@/lib/director/ai";
import { composeShotPrompt } from "@/lib/director/compose";
import { EXAMPLES } from "@/lib/director/examples";
import { archiveTake, listScenes, saveScene } from "@/lib/director/persist";
import { useDirector } from "@/lib/director/store";
import { vaultPut } from "@/lib/director/vault";
import { sceneNumber, type Shot, type VideoJob } from "@/lib/director/types";

export function Studio() {
  const {
    current, projects, planning, planError, newProject, continueScene, loadProject,
    setBrief, setMode, setAspect, setDuration, setBoard, updateShot, setSequenceJob,
    setShotJob, setPlanning, hydrateFromCloud,
  } = useDirector();
  const project = current();
  const [ready, setReady] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [busyKind, setBusyKind] = useState<"sequence" | "shot" | null>(null);
  const [busyShotId, setBusyShotId] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const stopWatch = useRef<(() => void) | null>(null);

  useEffect(() => {
    const ensure = () => {
      if (!useDirector.getState().currentId) useDirector.getState().newProject();
      setReady(true);
    };
    if (useDirector.persist.hasHydrated()) ensure();
    return useDirector.persist.onFinishHydration(ensure);
  }, []);

  useEffect(() => {
    checkAi().then((r) => setAiReady(r.ok)).catch(() => setAiReady(false));
  }, []);

  useEffect(() => {
    if (!ready) return;
    listScenes().then((res) => { if (res.ok) hydrateFromCloud(res.projects); }).catch(() => {});
  }, [ready, hydrateFromCloud]);

  useEffect(() => {
    if (!ready) return;
    const p = useDirector.getState().current();
    if (p.id === "draft") return;
    const timer = window.setTimeout(() => {
      saveScene({ data: useDirector.getState().current() }).catch(() => {});
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [ready, project.id, project.updatedAt]);

  useEffect(() => () => stopWatch.current?.(), []);

  useEffect(() => {
    if (!ready) return;
    const job = project.sequence;
    if (!job || job.status === "done" || job.status === "failed" || job.status === "expired") return;
    beginWatch(job.requestId, job.kind, job.shotId, (next) => setSequenceJob({ ...job, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, project.id]);

  async function lockTake(partial: VideoJob, next: Pick<VideoJob, "status" | "url" | "error">): Promise<VideoJob> {
    const merged: VideoJob = { ...partial, ...next, takeId: partial.takeId ?? null };
    if (next.status !== "done" || !next.url || next.url.startsWith("/api/media/")) return merged;
    try {
      await saveScene({ data: useDirector.getState().current() });
      const archived = await archiveTake({
        data: {
          sceneId: useDirector.getState().current().id,
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
      } catch {}
      return { ...merged, url: archived.playUrl, takeId: archived.takeId };
    } catch {
      return merged;
    }
  }

  function beginWatch(requestId: string, kind: VideoJob["kind"], shotId: string | null, apply: (next: VideoJob) => void) {
    stopWatch.current?.();
    const seed: VideoJob = {
      requestId, status: "queued", url: null, error: null, kind, shotId, startedAt: Date.now(), takeId: null,
    };
    stopWatch.current = watchJob(requestId, (next) => {
      void lockTake(seed, next).then((job) => apply(job));
    });
  }

  async function onPlan() {
    if (aiReady === false) { toast.error("AI is not available in this environment."); return; }
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
    if (!result.ok) { setPlanning(false, result.error); toast.error(result.error); return; }
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
    if (aiReady === false) { toast.error("AI is not available in this environment."); return; }
    setBusyKind("sequence");
    const result = await startVideo({
      data: {
        prompt: project.board.sequencePrompt,
        duration: project.duration,
        aspectRatio: project.aspectRatio,
        startImageDataUrl: project.continuity?.lastFrameDataUrl ?? null,
      },
    });
    if (!result.ok) { setBusyKind(null); toast.error(result.error); return; }
    const job: VideoJob = {
      requestId: result.requestId, status: "queued", url: null, error: null,
      kind: "sequence", shotId: null, startedAt: Date.now(), takeId: null,
    };
    setSequenceJob(job);
    beginWatch(result.requestId, "sequence", null, (next) => {
      setSequenceJob(next);
      if (next.status === "done") { setBusyKind(null); toast.success("Take is in and archived."); }
      if (next.status === "failed" || next.status === "expired") {
        setBusyKind(null);
        toast.error(next.error || "The take failed.");
      }
    });
  }

  async function rollShot(shot: Shot) {
    if (!project.board) return;
    if (aiReady === false) { toast.error("AI is not available in this environment."); return; }
    const duration = Math.min(15, Math.max(1, shot.duration));
    const prompt = shot.prompt || composeShotPrompt(project.board, shot);
    setBusyKind("shot");
    setBusyShotId(shot.id);
    const result = await startVideo({
      data: {
        prompt, duration, aspectRatio: project.aspectRatio,
        startImageDataUrl: project.continuity?.lastFrameDataUrl ?? null,
      },
    });
    if (!result.ok) { setBusyKind(null); setBusyShotId(null); toast.error(result.error); return; }
    const job: VideoJob = {
      requestId: result.requestId, status: "queued", url: null, error: null,
      kind: "shot", shotId: shot.id, startedAt: Date.now(), takeId: null,
    };
    setShotJob(shot.id, job);
    beginWatch(result.requestId, "shot", shot.id, (next) => {
      setShotJob(shot.id, next);
      if (next.status === "done" || next.status === "failed" || next.status === "expired") {
        setBusyKind(null);
        setBusyShotId(null);
      }
    });
  }

  async function onContinue() {
    if (!project.board) return;
    setContinuing(true);
    let lastFrame: string | null = null;
    if (project.sequence?.status === "done" && project.sequence.url) {
      const frame = await grabLastFrame({ data: { videoUrl: project.sequence.url } });
      if (frame.ok) lastFrame = frame.dataUrl;
    }
    const next = continueScene(lastFrame);
    setContinuing(false);
    if (!next) { toast.error("Board a scene before continuing."); return; }
    toast.success(
      lastFrame
        ? `Scene ${sceneNumber(next)} is on the desk. Last frame is locked.`
        : `Scene ${sceneNumber(next)} is on the desk. Write what happens next.`,
    );
    requestAnimationFrame(() => document.getElementById("brief")?.focus());
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

  const canPlan = project.brief.trim().length >= 8 && !planning && busyKind === null && !continuing;
  const canRoll = Boolean(project.board) && busyKind === null && !planning && !continuing;
  const canContinue = Boolean(project.board) && busyKind === null && !planning && !continuing;
  const n = sceneNumber(project);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Clapperboard className="size-5 text-fg" />
            <div>
              <p className="font-display text-2xl leading-none tracking-tight">Director</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-subtle">Grok Imagine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UserButton />
            <Button type="button" variant="secondary" size="sm" disabled={!canContinue} onClick={onContinue}>
              {continuing ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Next scene
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => newProject()}>
              <Plus className="size-4" /> New reel
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
            <div className="flex gap-3 rounded-xl border border-border bg-surface p-4">
              {project.continuity.lastFrameDataUrl ? (
                <img src={project.continuity.lastFrameDataUrl} alt="" className="size-16 shrink-0 rounded-md object-cover" />
              ) : null}
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-widest text-subtle">Continuing scene {String(n).padStart(2, "0")}</p>
                <p className="mt-1 text-sm text-fg">{project.continuity.fromTitle}</p>
                <p className="mt-1 text-sm text-muted">Ended on: {project.continuity.fromLastShot}</p>
              </div>
            </div>
          ) : null}
          {aiReady === false ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">AI features are unavailable here. The desk still opens; generation is paused.</p>
          ) : null}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="brief" className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Scene brief</label>
              <Segmented ariaLabel="Director mode" value={project.mode} onChange={setMode} options={[{ value: "automatic", label: "Automatic" }, { value: "storyboard", label: "Storyboard" }]} />
            </div>
            <Textarea id="brief" value={project.brief} onChange={(e) => setBrief(e.target.value)} placeholder={project.continuity ? "What happens next. Same people, same world — pick up from the last shot." : project.mode === "storyboard" ? "Shot 1, 4s, wide: rainy alley, slow dolly in. Shot 2, close-up, she says\u2026" : "Who is in the frame, where, what happens, and what is said."} />
            {!project.continuity ? (
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex.label} type="button" onClick={() => setBrief(ex.brief)} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:text-fg">{ex.label}</button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-subtle">Locked: {project.continuity.world.characters.map((c) => c.name).join(", ") || "world bible"}</p>
            )}
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Format</span>
              <div className="flex flex-wrap gap-2">
                <Segmented ariaLabel="Aspect ratio" value={project.aspectRatio} onChange={setAspect} options={[{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }]} />
                <Segmented ariaLabel="Duration" value={project.duration} onChange={setDuration} options={[{ value: 6, label: "6s" }, { value: 10, label: "10s" }, { value: 15, label: "15s" }]} />
              </div>
            </div>
            <Button type="button" size="lg" disabled={!canPlan} onClick={onPlan}>
              {planning ? (<><LoaderCircle className="size-4 animate-spin" /> Blocking</>) : "Call Director"}
            </Button>
          </div>
          {planError ? <p className="text-sm text-danger">{planError}</p> : null}
        </section>
        <section className="flex flex-col gap-8">
          {project.board ? (
            <div id="storyboard" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Storyboard · Scene {String(n).padStart(2, "0")}</p>
                  <h2 className="mt-1 font-display text-2xl tracking-tight">{project.board.title}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={copyPrompt}><Copy className="size-3.5" /> Copy prompt</Button>
                  <Button type="button" size="sm" disabled={!canRoll} onClick={rollSequence}>
                    {busyKind === "sequence" ? (<><LoaderCircle className="size-3.5 animate-spin" /> Rolling</>) : "Roll camera"}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" disabled={!canContinue} onClick={onContinue}>Next scene</Button>
                </div>
              </div>
              <p className="text-sm text-muted">{project.board.world.style}. {project.board.audio}</p>
              <ShotList board={project.board} shotJobs={project.shotJobs} onChange={updateShot} onRollShot={rollShot} rollingId={busyKind === "shot" ? busyShotId : null} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-5 py-8 text-sm text-muted">
              {project.continuity
                ? "Write the next beat, then Call Director. Coverage will pick up from the previous ending with the same faces and wardrobe."
                : "Automatic mode lets Grok choose coverage. Storyboard mode follows the shots you write in the brief."}
            </div>
          )}
          <Monitor aspect={project.aspectRatio} job={project.sequence} title={project.board?.logline} />
        </section>
      </main>
    </div>
  );
}
