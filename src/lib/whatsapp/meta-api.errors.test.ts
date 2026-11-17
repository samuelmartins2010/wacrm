import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaApiError, sendTemplateMessage } from "./meta-api";

// Error envelopes exactly as the Graph API returns them for
// POST /{phone-number-id}/messages.
const PAUSED = {
  error: {
    message: "(#132015) Template is Paused",
    type: "OAuthException",
    code: 132015,
    error_subcode: 2494010,
    error_data: { messaging_product: "whatsapp", details: "Template is paused due to low quality." },
    fbtrace_id: "AbCdEf123",
  },
};
const NO_CODE_IN_TEXT = {
  error: { message: "Template is disabled", type: "OAuthException", code: 132016, fbtrace_id: "x" },
};

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
  );
}

const ARGS = { phoneNumberId: "p", accessToken: "t", to: "5511999990000", templateName: "volta", language: "pt_BR" };

describe("Meta error envelope", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps code and error_subcode on the thrown error", async () => {
    stubFetch(400, PAUSED);
    const err = await sendTemplateMessage(ARGS).catch((e) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err).toMatchObject({ code: 132015, subcode: 2494010, message: "(#132015) Template is Paused" });
  });

  it("keeps the code even when the message text does not carry it", async () => {
    stubFetch(400, NO_CODE_IN_TEXT);
    const err = await sendTemplateMessage(ARGS).catch((e) => e);
    expect(err).toMatchObject({ code: 132016, message: "Template is disabled" });
  });

  it("non-JSON bodies still throw a MetaApiError without code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
    const err = await sendTemplateMessage(ARGS).catch((e) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err.code).toBeUndefined();
    expect(err.message).toMatch(/502/);
  });
});

describe("sendTemplateMessage timeout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("aborts when Meta does not answer within timeoutMs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_res, rej) => {
            init?.signal?.addEventListener("abort", () => rej(init.signal!.reason));
          }),
      ),
    );
    const started = Date.now();
    await expect(sendTemplateMessage({ ...ARGS, timeoutMs: 50 })).rejects.toThrow(/timeout|abort/i);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
