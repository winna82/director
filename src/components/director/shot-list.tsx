import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { labelShotSize } from "@/lib/director/compose";
import type { Shot, Storyboard, VideoJob } from "@/lib/director/types";
import { cn } from "@/lib/utils";

export function ShotList({
  board,
  shotJobs,
  onChange,
  onRollShot,
  rollingId,
}: {
  board: Storyboard;
  shotJobs: Record<string, VideoJob>;
  onChange: (id: string, patch: Partial<Shot>) => void;
  onRollShot: (shot: Shot) => void;
  rollingId: string | null;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {board.shots.map((shot) => (
        <ShotRow
          key={shot.id}
          shot={shot}
          job={shotJobs[shot.id]}
          onChange={onChange}
          onRollShot={onRollShot}
          rolling={rollingId === shot.id}
        />
      ))}
    </ol>
  );
}

function ShotRow({
  shot,
  job,
  onChange,
  onRollShot,
  rolling,
}: {
  shot: Shot;
  job?: VideoJob;
  onChange: (id: string, patch: Partial<Shot>) => void;
  onRollShot: (shot: Shot) => void;
  rolling: boolean;
}) {
  const [open, setOpen] = useState(false);
  const n = String(shot.index).padStart(2, "0");

  return (
    <li className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <span className="font-mono text-xs tabular-nums text-subtle">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium capitalize text-fg">
            {labelShotSize(shot.shotSize)}
            <span className="ml-2 font-normal text-muted">{shot.duration}s</span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-muted">{shot.action}</span>
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-subtle transition-transform duration-[var(--motion-quick)]",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          <Field label="Camera" value={shot.camera} onChange={(v) => onChange(shot.id, { camera: v })} />
          <Field label="Action" value={shot.action} multiline onChange={(v) => onChange(shot.id, { action: v })} />
          <Field
            label="Dialogue"
            value={shot.dialogue ? `${shot.dialogue.character}: ${shot.dialogue.line}` : ""}
            placeholder="Character: line"
            onChange={(v) => {
              const split = v.split(":");
              const character = split[0]?.trim() ?? "";
              const line = split.slice(1).join(":").trim();
              onChange(shot.id, {
                dialogue: character && line ? { character, line } : null,
              });
            }}
          />
          <Field label="Audio" value={shot.audio} onChange={(v) => onChange(shot.id, { audio: v })} />
          {job?.url && job.status === "done" ? (
            <video src={job.url} className="w-full rounded-md" controls playsInline />
          ) : null}
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" disabled={rolling} onClick={() => onRollShot(shot)}>
              {rolling ? "Rolling this shot" : "Roll this shot"}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const cls =
    "w-full rounded-md border border-border bg-raised px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">{label}</span>
      {multiline ? (
        <textarea className={cn(cls, "min-h-20 resize-y")} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={cn(cls, "h-10")} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
