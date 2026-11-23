import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/automations/ping", () => ({
  pingAutomationEvents: vi.fn(),
}));

import { pingAutomationEvents } from "@/lib/automations/ping";
import { transferConversation, TransferError, type TransferClient } from "./transfer";

type RpcError = { code?: string; message?: string } | null;

function fakeClient(error: RpcError = null) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error });
  return { client: { rpc } as unknown as TransferClient, rpc };
}

beforeEach(() => {
  vi.mocked(pingAutomationEvents).mockClear();
});

describe("transferConversation", () => {
  it.each([
    ["vazia", ""],
    ["só espaços e quebras", "  \n\t  "],
    ["só invisíveis", "​ ﻿"],
  ])("manda p_note null quando a observação é %s", async (_label, note) => {
    const { client, rpc } = fakeClient();
    await transferConversation(client, "conv-1", "user-2", note);
    expect(rpc).toHaveBeenCalledWith("transfer_conversation", {
      p_conversation_id: "conv-1",
      p_to_user_id: "user-2",
      p_note: null,
    });
  });

  it("manda a observação aparada quando há texto", async () => {
    const { client, rpc } = fakeClient();
    await transferConversation(client, "conv-1", "user-2", "  2ª via do boleto \n");
    expect(rpc).toHaveBeenCalledWith("transfer_conversation", {
      p_conversation_id: "conv-1",
      p_to_user_id: "user-2",
      p_note: "2ª via do boleto",
    });
  });

  it("remover responsável manda p_to_user_id null e não chama as automações", async () => {
    const { client, rpc } = fakeClient();
    await transferConversation(client, "conv-1", null, "");
    expect(rpc).toHaveBeenCalledWith("transfer_conversation", {
      p_conversation_id: "conv-1",
      p_to_user_id: null,
      p_note: null,
    });
    expect(pingAutomationEvents).not.toHaveBeenCalled();
  });

  it("chama as automações quando transfere para alguém e dá certo", async () => {
    const { client } = fakeClient();
    await transferConversation(client, "conv-1", "user-2", "");
    expect(pingAutomationEvents).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ code: "42501", message: "not allowed to transfer this conversation" }, "forbidden"],
    [{ code: "22023", message: "assignee has a view-only role in this account" }, "viewer"],
    [{ code: "22023", message: "assignee is not a member of this account" }, "not_member"],
    [{ code: "P0002", message: "conversation x not found" }, "unknown"],
    [{ message: "Failed to fetch" }, "unknown"],
  ] as const)("lança TransferError quando a RPC devolve erro (%o → %s)", async (error, kind) => {
    const { client } = fakeClient(error);
    const promise = transferConversation(client, "conv-1", "user-2", "nota");
    await expect(promise).rejects.toBeInstanceOf(TransferError);
    await expect(promise).rejects.toMatchObject({ kind });
    expect(pingAutomationEvents).not.toHaveBeenCalled();
  });
});
