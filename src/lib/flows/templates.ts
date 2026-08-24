/**
 * Starter flow templates.
 *
 * Three pre-canned flows users can clone with one click instead of
 * building from scratch. Each template is a plain JS object describing
 * the same shape `/api/flows` PUT accepts — name, trigger config,
 * entry_node_id, fallback_policy, nodes[] — keyed by a stable
 * `slug`.
 *
 * The clone path (`/api/flows` POST with `template_slug`) creates a
 * NEW flow_row + flow_nodes rows for the user. `node_key`s are kept
 * verbatim (they're stable strings, not UUIDs, so cloning never
 * needs to rewrite edge references).
 *
 * Choosing a single static module over a DB-backed gallery for v1
 * because: (a) the set is small and changes with code releases, not
 * data; (b) keeps templates portable across self-hosted instances
 * without migrations; (c) editing in source is the lowest-friction
 * way to add the next template.
 */

import type {
  CollectInputNodeConfig,
  ConditionNodeConfig,
  HandoffNodeConfig,
  KeywordTriggerConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMessageNodeConfig,
  StartNodeConfig,
} from "./types";

type Translator = (key: string, values?: Record<string, string | number>) => string;

export type FlowTemplateNodeType =
  | "start"
  | "send_message"
  | "send_buttons"
  | "send_list"
  | "collect_input"
  | "condition"
  | "set_tag"
  | "handoff"
  | "end";

export interface FlowTemplateNode {
  node_key: string;
  node_type: FlowTemplateNodeType;
  config:
    | StartNodeConfig
    | SendMessageNodeConfig
    | SendButtonsNodeConfig
    | SendListNodeConfig
    | CollectInputNodeConfig
    | ConditionNodeConfig
    | HandoffNodeConfig
    | Record<string, unknown>;
}

export interface FlowTemplate {
  slug: string;
  name: string;
  description: string;
  /** Used by the gallery to surface a relevant icon. lucide-react name. */
  icon: "MessageSquare" | "HelpCircle" | "UserPlus";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: KeywordTriggerConfig | Record<string, unknown>;
  entry_node_id: string;
  nodes: FlowTemplateNode[];
}

// ============================================================
// 1. Welcome menu — the example from the owner's brief
// ============================================================
const WELCOME_MENU: FlowTemplate = {
  slug: "welcome_menu",
  name: "Welcome menu",
  description:
    "Greet customers who type a keyword and route them to the right agent based on whether they're new or existing.",
  icon: "MessageSquare",
  trigger_type: "keyword",
  trigger_config: { keywords: ["support", "help", "hi"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "welcome" },
    },
    {
      node_key: "welcome",
      node_type: "send_buttons",
      config: {
        text: "Hi! 👋 Welcome to support. Are you an existing customer or new here?",
        footer_text: "Tap a button below to continue.",
        buttons: [
          {
            reply_id: "existing",
            title: "Existing customer",
            next_node_key: "existing_handoff",
          },
          {
            reply_id: "new",
            title: "New customer",
            next_node_key: "new_handoff",
          },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "existing_handoff",
      node_type: "handoff",
      config: {
        note: "Existing customer needs assistance — please check account history before replying.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "new_handoff",
      node_type: "handoff",
      config: {
        note: "New customer — share pricing + onboarding link.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 2. FAQ bot — list-message answers, fully automated
// ============================================================
const FAQ_BOT: FlowTemplate = {
  slug: "faq_bot",
  name: "FAQ bot",
  description:
    "Answer common questions automatically. Customer picks a topic from a list; the bot replies with the answer and ends.",
  icon: "HelpCircle",
  trigger_type: "keyword",
  trigger_config: {
    keywords: ["faq", "question", "info"],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "topics" },
    },
    {
      node_key: "topics",
      node_type: "send_list",
      config: {
        text: "What can I help you with?",
        button_label: "View topics",
        sections: [
          {
            title: "Common questions",
            rows: [
              {
                reply_id: "hours",
                title: "Opening hours",
                next_node_key: "answer_hours",
              },
              {
                reply_id: "pricing",
                title: "Pricing",
                next_node_key: "answer_pricing",
              },
              {
                reply_id: "refunds",
                title: "Refund policy",
                next_node_key: "answer_refunds",
              },
            ],
          },
          {
            title: "Other",
            rows: [
              {
                reply_id: "human",
                title: "Talk to a human",
                next_node_key: "human_handoff",
              },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "answer_hours",
      node_type: "send_message",
      config: {
        text: "We're open Mon–Fri, 9am–6pm local time. Weekend support is limited to urgent issues.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_pricing",
      node_type: "send_message",
      config: {
        text: "Our pricing starts at $9/mo. Visit https://example.com/pricing for the full breakdown.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_refunds",
      node_type: "send_message",
      config: {
        text: "Refunds are honored within 30 days of purchase. Reply with your order number and we'll process it.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "human_handoff",
      node_type: "handoff",
      config: {
        note: "Customer asked to talk to a human from the FAQ bot.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 3. Lead capture — collect_input chain, ends in a handoff
// ============================================================
const LEAD_CAPTURE: FlowTemplate = {
  slug: "lead_capture",
  name: "Lead capture",
  description:
    "Greet first-time inbounds, capture name + email + company, then hand off to sales with the answers in the note.",
  icon: "UserPlus",
  trigger_type: "first_inbound_message",
  trigger_config: {},
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "intro" },
    },
    {
      node_key: "intro",
      node_type: "send_message",
      config: {
        text: "Welcome! 👋 I'll ask a few quick questions so we can get you to the right person.",
        next_node_key: "ask_name",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_name",
      node_type: "collect_input",
      config: {
        prompt_text: "What's your name?",
        var_key: "name",
        next_node_key: "ask_email",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_email",
      node_type: "collect_input",
      config: {
        prompt_text: "Thanks {{vars.name}}! What's your work email?",
        var_key: "email",
        next_node_key: "ask_company",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_company",
      node_type: "collect_input",
      config: {
        prompt_text: "Almost done — what's your company name?",
        var_key: "company",
        next_node_key: "handoff",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "handoff",
      node_type: "handoff",
      config: {
        note: "New lead — name={{vars.name}}, email={{vars.email}}, company={{vars.company}}.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// Localization — templates ship with English name/description/node
// content baked into the static objects above (kept in English so
// the source stays a single, unambiguous source of truth for the
// engine and for the translation-key names below). When a flow is
// cloned from a template, `getLocalizedFlowTemplate` swaps every
// user-facing string for its translated counterpart under the
// "Flows.templates" i18n namespace, so the flow that lands in the
// user's account — its name, description, and every seeded node's
// text/buttons/prompts/handoff notes — comes out in the app's
// configured locale instead of always in English.
//
// Node structure (types, edges, node_key, icon, trigger_config) is
// NOT touched here — only the handful of string fields a person
// actually reads. `{{vars.x}}` placeholders in lead_capture's prompts
// are the flow engine's own runtime interpolation syntax (resolved
// when the flow sends the message), not ICU — the translation
// strings above wrap them in a leading/trailing straight quote so
// next-intl's ICU parser treats the double braces as literal text
// instead of a malformed argument.
// ============================================================

function cloneNode(n: FlowTemplateNode): FlowTemplateNode {
  return { ...n, config: JSON.parse(JSON.stringify(n.config)) };
}

function localizeWelcomeMenu(
  template: FlowTemplate,
  t: Translator,
): FlowTemplate {
  const c = (key: string) => t(`welcome_menu.content.${key}`);
  const nodes = template.nodes.map(cloneNode);
  const welcome = nodes.find((n) => n.node_key === "welcome");
  if (welcome) {
    const cfg = welcome.config as SendButtonsNodeConfig;
    cfg.text = c("welcomeText");
    cfg.footer_text = c("welcomeFooter");
    if (cfg.buttons[0]) cfg.buttons[0].title = c("existingButton");
    if (cfg.buttons[1]) cfg.buttons[1].title = c("newButton");
  }
  const existingHandoff = nodes.find((n) => n.node_key === "existing_handoff");
  if (existingHandoff) {
    (existingHandoff.config as HandoffNodeConfig).note = c("existingNote");
  }
  const newHandoff = nodes.find((n) => n.node_key === "new_handoff");
  if (newHandoff) {
    (newHandoff.config as HandoffNodeConfig).note = c("newNote");
  }
  return {
    ...template,
    name: t("welcome_menu.name"),
    description: t("welcome_menu.description"),
    nodes,
  };
}

function localizeFaqBot(template: FlowTemplate, t: Translator): FlowTemplate {
  const c = (key: string) => t(`faq_bot.content.${key}`);
  const nodes = template.nodes.map(cloneNode);
  const topics = nodes.find((n) => n.node_key === "topics");
  if (topics) {
    const cfg = topics.config as SendListNodeConfig;
    cfg.text = c("topicsText");
    cfg.button_label = c("topicsButtonLabel");
    if (cfg.sections[0]) {
      cfg.sections[0].title = c("sectionCommon");
      if (cfg.sections[0].rows[0]) cfg.sections[0].rows[0].title = c("rowHours");
      if (cfg.sections[0].rows[1]) cfg.sections[0].rows[1].title = c("rowPricing");
      if (cfg.sections[0].rows[2]) cfg.sections[0].rows[2].title = c("rowRefunds");
    }
    if (cfg.sections[1]) {
      cfg.sections[1].title = c("sectionOther");
      if (cfg.sections[1].rows[0]) cfg.sections[1].rows[0].title = c("rowHuman");
    }
  }
  const hours = nodes.find((n) => n.node_key === "answer_hours");
  if (hours) (hours.config as SendMessageNodeConfig).text = c("answerHours");
  const pricing = nodes.find((n) => n.node_key === "answer_pricing");
  if (pricing) (pricing.config as SendMessageNodeConfig).text = c("answerPricing");
  const refunds = nodes.find((n) => n.node_key === "answer_refunds");
  if (refunds) (refunds.config as SendMessageNodeConfig).text = c("answerRefunds");
  const humanHandoff = nodes.find((n) => n.node_key === "human_handoff");
  if (humanHandoff) {
    (humanHandoff.config as HandoffNodeConfig).note = c("humanHandoffNote");
  }
  return {
    ...template,
    name: t("faq_bot.name"),
    description: t("faq_bot.description"),
    nodes,
  };
}

function localizeLeadCapture(
  template: FlowTemplate,
  t: Translator,
): FlowTemplate {
  const c = (key: string) => t(`lead_capture.content.${key}`);
  const nodes = template.nodes.map(cloneNode);
  const intro = nodes.find((n) => n.node_key === "intro");
  if (intro) (intro.config as SendMessageNodeConfig).text = c("introText");
  const askName = nodes.find((n) => n.node_key === "ask_name");
  if (askName) (askName.config as CollectInputNodeConfig).prompt_text = c("askNamePrompt");
  const askEmail = nodes.find((n) => n.node_key === "ask_email");
  if (askEmail) (askEmail.config as CollectInputNodeConfig).prompt_text = c("askEmailPrompt");
  const askCompany = nodes.find((n) => n.node_key === "ask_company");
  if (askCompany) (askCompany.config as CollectInputNodeConfig).prompt_text = c("askCompanyPrompt");
  const handoff = nodes.find((n) => n.node_key === "handoff");
  if (handoff) (handoff.config as HandoffNodeConfig).note = c("handoffNote");
  return {
    ...template,
    name: t("lead_capture.name"),
    description: t("lead_capture.description"),
    nodes,
  };
}

const LOCALIZERS: Record<
  string,
  (template: FlowTemplate, t: Translator) => FlowTemplate
> = {
  welcome_menu: localizeWelcomeMenu,
  faq_bot: localizeFaqBot,
  lead_capture: localizeLeadCapture,
};

/**
 * Returns the template with name, description, and every seeded
 * node's text swapped for the translated version under the
 * "Flows.templates" namespace. Falls back to the raw (English)
 * template if the slug has no registered localizer.
 */
export function getLocalizedFlowTemplate(
  slug: string,
  t: Translator,
): FlowTemplate | null {
  const template = getFlowTemplate(slug);
  if (!template) return null;
  const localize = LOCALIZERS[slug];
  return localize ? localize(template, t) : template;
}

// ============================================================
// Registry
// ============================================================

const TEMPLATES: Record<string, FlowTemplate> = {
  welcome_menu: WELCOME_MENU,
  faq_bot: FAQ_BOT,
  lead_capture: LEAD_CAPTURE,
};

export function getFlowTemplate(slug: string): FlowTemplate | null {
  return TEMPLATES[slug] ?? null;
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.values(TEMPLATES);
}
