import { describe, expect, it } from "vitest";
import { buildMediaPath, MEDIA_MAX_BYTES_BY_KIND , mediaSizeProblem } from "./upload-media";

const ACCOUNT = "11111111-2222-3333-4444-555555555555";

describe("buildMediaPath", () => {
  it("namespaces under account-<id> so RLS write policies match", () => {
    const path = buildMediaPath(ACCOUNT, "photo.png", 1700000000000);
    expect(path).toBe(`account-${ACCOUNT}/1700000000000-photo.png`);
    expect(path.split("/")[0]).toBe(`account-${ACCOUNT}`);
  });

  it("lower-cases the extension and sanitizes the basename", () => {
    const path = buildMediaPath(ACCOUNT, "My Invoice (final).PDF", 1700000000000);
    expect(path).toBe(`account-${ACCOUNT}/1700000000000-My_Invoice_final_.pdf`);
  });

  it("caps the basename at 40 chars", () => {
    const long = "a".repeat(100) + ".png";
    const path = buildMediaPath(ACCOUNT, long, 1700000000000);
    const base = path.split("/")[1].replace("1700000000000-", "").replace(".png", "");
    expect(base.length).toBe(40);
  });

  it("falls back to 'file' / 'bin' for a nameless input", () => {
    const path = buildMediaPath(ACCOUNT, "", 1700000000000);
    expect(path).toBe(`account-${ACCOUNT}/1700000000000-file.bin`);
  });

  it("defaults the extension to bin when there is none", () => {
    const path = buildMediaPath(ACCOUNT, "README", 1700000000000);
    expect(path).toBe(`account-${ACCOUNT}/1700000000000-README.bin`);
  });
});

describe("MEDIA_MAX_BYTES_BY_KIND", () => {
  it("caps images at Meta's tighter 5 MB limit", () => {
    expect(MEDIA_MAX_BYTES_BY_KIND.image).toBe(5 * 1024 * 1024);
  });

  it("caps video/audio at 16 MB and documents at Meta's 100 MB (F7)", () => {
    expect(MEDIA_MAX_BYTES_BY_KIND.video).toBe(16 * 1024 * 1024);
    expect(MEDIA_MAX_BYTES_BY_KIND.audio).toBe(16 * 1024 * 1024);
    expect(MEDIA_MAX_BYTES_BY_KIND.document).toBe(100 * 1024 * 1024);
  });
});

describe("mediaSizeProblem (F7, Meta limits per kind)", () => {
  const MB = 1024 * 1024;
  it("image is capped at 5 MB", () => {
    expect(mediaSizeProblem("image", 5 * MB)).toBeNull();
    expect(mediaSizeProblem("image", 6 * MB)).toEqual({ limitMb: 5 });
  });
  it("video and audio at 16 MB", () => {
    expect(mediaSizeProblem("video", 16 * MB)).toBeNull();
    expect(mediaSizeProblem("video", 17 * MB)).toEqual({ limitMb: 16 });
    expect(mediaSizeProblem("audio", 17 * MB)).toEqual({ limitMb: 16 });
  });
  it("document at 100 MB", () => {
    expect(mediaSizeProblem("document", 50 * MB)).toBeNull();
    expect(mediaSizeProblem("document", 101 * MB)).toEqual({ limitMb: 100 });
  });
});
