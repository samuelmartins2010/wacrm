import { describe, expect, it } from "vitest";
import { validateStepReferences, type AccountRefs } from "./references";

const refs: AccountRefs = {
  tagIds: new Set(["tag-ok"]),
  stagesByPipeline: new Map([["p-ok", new Set(["s-ok"])]]),
  memberIds: new Set(["agent-ok"]),
  customFieldIds: new Set(["cf-ok"]),
};
const s = (step_type: string, step_config: Record<string, unknown>) => ({ step_type, step_config });

describe("validateStepReferences (A6, at save)", () => {
  it("accepts references that exist in the account", () => {
    expect(
      validateStepReferences(
        [
          s("add_tag", { tag_id: "tag-ok" }),
          s("assign_conversation", { mode: "specific", agent_id: "agent-ok" }),
          s("create_deal", { pipeline_id: "p-ok", stage_id: "s-ok" }),
          s("update_contact_field", { field: "custom:cf-ok" }),
          s("update_contact_field", { field: "email" }),
        ],
        refs,
      ),
    ).toEqual([]);
  });

  it("flags each missing reference with its path, including inside branches", () => {
    const issues = validateStepReferences(
      [
        s("add_tag", { tag_id: "gone" }),
        {
          ...s("condition", { subject: "message_content", value: "x" }),
          branches: { yes: [s("assign_conversation", { mode: "specific", agent_id: "stranger" })], no: [] },
        },
        s("create_deal", { pipeline_id: "p-ok", stage_id: "s-wrong" }),
        s("create_deal", { pipeline_id: "p-gone", stage_id: "s-ok" }),
        s("update_contact_field", { field: "phone" }),
        s("update_contact_field", { field: "custom:cf-gone" }),
      ],
      refs,
    );
    expect(issues.map((i) => i.path)).toEqual([
      "steps[0].tag_id",
      "steps[1].yes.steps[0].agent_id",
      "steps[2].stage_id",
      "steps[3].pipeline_id",
      "steps[4].field",
      "steps[5].field",
    ]);
  });

  it("empty values are left to the activation check (drafts may be incomplete)", () => {
    expect(validateStepReferences([s("add_tag", { tag_id: "" })], refs)).toEqual([]);
  });
});
