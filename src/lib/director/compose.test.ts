import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SINGLE_FRAME_RULE,
  composeContinuityLock,
  composeSequencePrompt,
  composeShotPrompt,
  shotLimit,
} from "./compose.ts";
import type { Continuity, Shot, Storyboard } from "./types.ts";

function shot(index: number, duration: number, action: string): Shot {
  return {
    id: `s${index}`,
    index,
    duration,
    shotSize: "medium",
    angle: "eye-level",
    camera: "static",
    action,
    dialogue: null,
    audio: "rain",
    prompt: "",
  };
}

function board(layout: Storyboard["layout"], shots: Shot[]): Storyboard {
  return {
    title: "Late Again",
    logline: "Maya waits.",
    world: { setting: "bus stop", lighting: "overcast", palette: "grey", style: "35mm", characters: [] },
    audio: "rain",
    shots,
    sequencePrompt: "",
    layout,
  };
}

const continuity: Continuity = {
  fromTitle: "Late Again",
  fromLogline: "Maya waits.",
  fromLastShot: "close-up, eye-level. Maya raises her wrist to check her watch",
  world: { setting: "bus stop", lighting: "overcast", palette: "grey", style: "35mm", characters: [] },
  audio: "rain",
  previousVideoUrl: null,
  lastFrameDataUrl: null,
};

describe("composeSequencePrompt", () => {
  it("single frame: timed hard cuts and an explicit no-panels rule", () => {
    const prompt = composeSequencePrompt(board("single", [shot(1, 3, "Maya waits."), shot(2, 3, "Maya looks up.")]));
    assert.ok(prompt.includes(SINGLE_FRAME_RULE));
    assert.ok(prompt.includes("Shot 1 (0–3s)"));
    assert.ok(prompt.includes("Shot 2 (3–6s)"));
    assert.ok(prompt.includes("One continuous 6-second clip made of 2 shots joined by hard cuts."));
  });

  it("boards from before layouts compose as single frame", () => {
    const prompt = composeSequencePrompt(board(undefined, [shot(1, 6, "Maya waits.")]));
    assert.ok(prompt.includes(SINGLE_FRAME_RULE));
  });

  it("split screen: two simultaneous panels, left/right in landscape", () => {
    const prompt = composeSequencePrompt(board("split", [shot(1, 6, "Maya calls."), shot(2, 6, "Kenji answers.")]), null, "16:9");
    assert.ok(prompt.includes("two equal panels, left and right"));
    assert.ok(prompt.includes("Left panel: medium, eye-level. Camera: static. Maya calls."));
    assert.ok(prompt.includes("Right panel: medium, eye-level. Camera: static. Kenji answers."));
    assert.ok(prompt.includes("for the full 6 seconds"));
    assert.ok(!prompt.includes("Hard cut"));
    assert.ok(!prompt.includes(SINGLE_FRAME_RULE));
    assert.ok(prompt.includes("No subtitles or captions"));
  });

  it("split screen stacks top/bottom in a vertical frame", () => {
    const prompt = composeSequencePrompt(board("split", [shot(1, 6, "A."), shot(2, 6, "B.")]), null, "9:16");
    assert.ok(prompt.includes("Top panel:"));
    assert.ok(prompt.includes("Bottom panel:"));
  });

  it("grid: four named panels", () => {
    const prompt = composeSequencePrompt(
      board("grid", [shot(1, 6, "A."), shot(2, 6, "B."), shot(3, 6, "C."), shot(4, 6, "D.")]),
    );
    for (const name of ["Top-left panel: ", "Top-right panel: ", "Bottom-left panel: ", "Bottom-right panel: "]) {
      assert.ok(prompt.includes(name), name);
    }
    assert.ok(prompt.includes("Keep exactly 4 panels on screen"));
  });
});

describe("composeContinuityLock", () => {
  it("describes the previous ending as story, stripping legacy camera framing", () => {
    const lock = composeContinuityLock(continuity);
    assert.ok(lock.includes("The story picks up right after the previous scene ended: Maya raises her wrist"));
    assert.ok(!lock.includes("close-up, eye-level"));
  });

  it("leaves story endings that merely contain commas untouched", () => {
    const lock = composeContinuityLock({ ...continuity, fromLastShot: "Maya, soaked, steps aboard." });
    assert.ok(lock.includes("ended: Maya, soaked, steps aboard."));
  });
});

describe("composeShotPrompt", () => {
  it("is single frame and does not compound its previous output", () => {
    const b = board("single", [shot(1, 3, "Maya waits.")]);
    const first = composeShotPrompt(b, b.shots[0]!);
    const again = composeShotPrompt(b, { ...b.shots[0]!, prompt: first });
    assert.equal(again, first);
    assert.ok(first.includes(SINGLE_FRAME_RULE));
  });
});

describe("shotLimit", () => {
  it("fixes panel counts and scales single-frame cuts with length", () => {
    assert.deepEqual(shotLimit("split", 10), { min: 2, max: 2 });
    assert.deepEqual(shotLimit("grid", 6), { min: 4, max: 4 });
    assert.deepEqual(shotLimit("single", 6), { min: 1, max: 2 });
    assert.deepEqual(shotLimit("single", 10), { min: 1, max: 3 });
    assert.deepEqual(shotLimit("single", 15), { min: 1, max: 4 });
  });
});
