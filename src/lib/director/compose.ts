import type { Continuity, Shot, Storyboard, WorldBible } from "./types";

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

export function composeContinuityLock(c: Continuity): string {
  const faces = c.world.characters.map((ch) => `${ch.name} remains ${ch.look}`).join(". ");
  return [
    `Continuation of "${c.fromTitle}". Same film, next scene — not a reboot.`,
    faces,
    `Style lock: ${c.world.style}. Palette lock: ${c.world.palette}.`,
    `Previous scene ended on: ${c.fromLastShot}. The first frames of this clip pick up from that beat.`,
    "No title card. No recap montage.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function composeSequencePrompt(board: Storyboard, continuity?: Continuity | null): string {
  const shots = board.shots
    .slice()
    .sort((a, b) => a.index - b.index);

  let t = 0;
  const beats = shots.map((shot) => {
    const start = t;
    t += shot.duration;
    const line = shot.dialogue
      ? `${shot.dialogue.character} says, "${shot.dialogue.line}" with accurate lip-sync.`
      : "";
    return `Shot ${shot.index} (${start}–${t}s): ${shot.shotSize}, ${shot.angle}. Camera: ${shot.camera}. ${shot.action} ${line} Audio: ${shot.audio}. Hard cut.`;
  });

  return [
    continuity ? composeContinuityLock(continuity) : "",
    worldBlock(board.world),
    board.audio ? `Master audio: ${board.audio}.` : "",
    `This is a multi-shot sequence with hard cinematic cuts inside one continuous clip. Total ${t} seconds.`,
    beats.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

export function composeShotPrompt(board: Storyboard, shot: Shot, continuity?: Continuity | null): string {
  const line = shot.dialogue
    ? `${shot.dialogue.character} says, "${shot.dialogue.line}" with accurate lip-sync.`
    : "";
  return [
    continuity ? composeContinuityLock(continuity) : "",
    worldBlock(board.world),
    `Single shot, ${shot.duration} seconds, no extra cuts.`,
    `${shot.shotSize}, ${shot.angle}. Camera: ${shot.camera}.`,
    shot.action,
    line,
    `Audio: ${shot.audio}.`,
    shot.prompt,
  ]
    .filter(Boolean)
    .join(" ");
}

export function labelShotSize(size: string): string {
  return size.replace(/-/g, " ");
}
