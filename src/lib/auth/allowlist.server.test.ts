import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isEmailAllowed } from "./allowlist.server.ts";

describe("isEmailAllowed", () => {
  it("allows a listed email regardless of case and spacing", () => {
    assert.equal(isEmailAllowed("Me@Example.com", " other@x.io , me@example.com "), true);
  });

  it("rejects an email that is not listed", () => {
    assert.equal(isEmailAllowed("stranger@example.com", "me@example.com"), false);
  });

  it("fails closed when the list is unset or empty", () => {
    assert.equal(isEmailAllowed("me@example.com", undefined), false);
    assert.equal(isEmailAllowed("me@example.com", ""), false);
    assert.equal(isEmailAllowed("me@example.com", " , "), false);
  });

  it("rejects a missing email", () => {
    assert.equal(isEmailAllowed(null, "me@example.com"), false);
    assert.equal(isEmailAllowed("  ", "me@example.com"), false);
  });
});
