import { SHOT_SIZES } from "./types.ts";
import type { AspectRatio, Continuity, SceneLayout, Shot, Storyboard, WorldBible } from "./types.ts";

/** Imagine sometimes renders a multi-shot prompt as panels side by side; say explicitly that it must not. */
export const SINGLE_FRAME_RULE =
  "Full-frame picture: exactly one shot fills the whole frame at any moment, and shots follow one another in time. No split screen, no grid, no collage, no picture-in-picture, no multiple panels.";

// Continuity snapshots taken before endings were story-only start with "close-up, eye-level. ".
const LEGACY_FRAMING = new RegExp(`^(?:${SHOT_SIZES.join("|")}), [^.]*\\.\\s+`, "i");

function worldBlock(world: WorldBible): string {
  const faces = world.characters
    .map((c) => `${c.name}: ${c.look}`)
    .join("; ");
  const who = faces ? `Characters stay identical across every cut — ${faces}.` : "";
  return [
    world.style,
    world.setting,
    world.lighting,
    world.palette ? `Palette: ${world.palette}.` : "",
    who,
    "Photoreal, cinematic, native sound. Keep wardrobe, faces, location, and lighting consistent on every shot.",
    // Imagine burned captions into a split-screen test take; spoken lines are audio only.
    "No subtitles or captions; dialogue is heard, not written on screen.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function lockWorld(generated: WorldBible, locked: WorldBible): WorldBible {
  const byName = new Map(locked.characters.map((c) => [c.name.toLowerCase(), c]));
  const characters = generated.characters.map((c) => byName.get(c.name.toLowerCase()) ?? c);
  for (const c of locked.characters) {
    if (!characters.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) {
      characters.push(c);
    }
  }
  return {
    setting: generated.setting || locked.setting,
    lighting: generated.lighting || locked.lighting,
    palette: locked.palette || generated.palette,
    style: locked.style || generated.style,
    characters,
  };
}

/** Shot counts Director may plan: panels are fixed, single-frame cuts scale with clip length. */
export function shotLimit(layout: SceneLayout, duration: number): { min: number; max: number } {
  if (layout === "split") return { min: 2, max: 2 };
  if (layout === "grid") return { min: 4, max: 4 };
  return { min: 1, max: duration <= 6 ? 2 : duration <= 10 ? 3 : 4 };
}

/** Panel positions in reading order; a vertical frame stacks a split. */
export function panelNames(layout: SceneLayout, aspectRatio: AspectRatio): string[] {
  if (layout === "split") return aspectRatio === "9:16" ? ["top", "bottom"] : ["left", "right"];
  if (layout === "grid") return ["top-left", "top-right", "bottom-left", "bottom-right"];
  return [];
}

export function composeContinuityLock(c: Continuity): string {
  const faces = c.world.characters.map((ch) => `${ch.name} remains ${ch.look}`).join(". ");
  const ending = c.fromLastShot.replace(LEGACY_FRAMING, "");
  return [
    `Continuation of "${c.fromTitle}". Same film, next scene — not a reboot.`,
    faces,
    `Style lock: ${c.world.style}. Palette lock: ${c.world.palette}.`,
    ending ? `The story picks up right after the previous scene ended: ${ending}` : "",
    "No title card. No recap montage.",
  ]
    .filter(Boolean)
    .join(" ");
}

function dialogueLine(shot: Shot): string {
  return shot.dialogue ? `${shot.dialogue.character} says, "${shot.dialogue.line}" with accurate lip-sync.` : "";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function composeSequencePrompt(
  board: Storyboard,
  continuity?: Continuity | null,
  aspectRatio: AspectRatio = "16:9",
): string {
  const layout = board.layout ?? "single";
  const shots = board.shots.slice().sort((a, b) => a.index - b.index);
  const opening = [
    continuity ? composeContinuityLock(continuity) : "",
    worldBlock(board.world),
    board.audio ? `Master audio: ${board.audio}.` : "",
  ];

  if (layout === "single") {
    let t = 0;
    const beats = shots.map((shot) => {
      const start = t;
      t += shot.duration;
      return `Shot ${shot.index} (${start}–${t}s): ${shot.shotSize}, ${shot.angle}. Camera: ${shot.camera}. ${shot.action} ${dialogueLine(shot)} Audio: ${shot.audio}. Hard cut.`;
    });
    return [
      ...opening,
      `One continuous ${t}-second clip made of ${shots.length} ${shots.length === 1 ? "shot" : "shots joined by hard cuts"}.`,
      SINGLE_FRAME_RULE,
      beats.join(" "),
    ]
      .filter(Boolean)
      .join(" ");
  }

  const names = panelNames(layout, aspectRatio);
  const seconds = Math.max(...shots.map((s) => s.duration));
  const panels = shots.slice(0, names.length).map((shot, i) => {
    return `${capitalize(names[i] ?? `panel ${i + 1}`)} panel: ${shot.shotSize}, ${shot.angle}. Camera: ${shot.camera}. ${shot.action} ${dialogueLine(shot)} Audio: ${shot.audio}.`;
  });
  const frame =
    layout === "split"
      ? `Split-screen clip: the frame is divided into two equal panels, ${names[0]} and ${names[1]}, separated by a thin dark line.`
      : "Four-panel grid: the frame is divided into a 2×2 grid of equal panels separated by thin dark lines.";
  return [
    ...opening,
    frame,
    `All ${names.length} panels play at the same time for the full ${seconds} seconds; each panel is one continuous shot with no cuts.`,
    panels.join(" "),
    `Keep exactly ${names.length} panels on screen from the first frame to the last.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A self-contained prompt for one shot. Built only from the structured fields — never from
 * `shot.prompt`, which holds this function's previous output and would compound on every edit.
 */
export function composeShotPrompt(board: Storyboard, shot: Shot, continuity?: Continuity | null): string {
  return [
    continuity ? composeContinuityLock(continuity) : "",
    worldBlock(board.world),
    `Single shot, ${shot.duration} seconds, no cuts.`,
    SINGLE_FRAME_RULE,
    `${shot.shotSize}, ${shot.angle}. Camera: ${shot.camera}.`,
    shot.action,
    dialogueLine(shot),
    `Audio: ${shot.audio}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function labelShotSize(size: string): string {
  return size.replace(/-/g, " ");
}
