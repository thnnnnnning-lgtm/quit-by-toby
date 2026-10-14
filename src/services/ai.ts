import type {
  AIConfig,
  Attention,
  DailyStatusInput,
  EventInput,
  Material,
  MockConfig,
  Mood,
  WorkEvent,
} from "../types";
import { MOODS, addDays, today, weekday } from "../constants";
import {
  matchingMaterials,
  requirementsForChange,
  type MaterialRequirement,
} from "./materials";
import { deepseekChat, deepseekJson, type ChatTurn } from "./deepseek";

/**
 * 这里是**模拟实现**。所有输出都来自本地规则模板，
 * 不是真实模型分析，界面上会统一标注「模拟 AI」。
 * 后续接入真实模型时，替换本文件即可，`aiService` 的签名保持不变。
 */
export const simulate = async (config: MockConfig) => {
  await new Promise((r) => setTimeout(r, Math.max(0, config.delayMs)));
  if (config.failNext)
    throw new Error("模拟服务暂时没有回应，你的输入仍然保留。请重试。");
};

/** 从一段自然语言里识别出值得记录的候选事件；纯情绪表达返回 null */
export function detectEvent(
  content: string,
  sourceType: EventInput["sourceType"],
  sourceId?: string,
  date = today(),
): EventInput | null {
  let title = "";
  let attention: EventInput["attention"] = "watch";
  if (/会议.*取消|取消.*会议/.test(content)) title = "会议安排变化";
  else if (/移出|项目群/.test(content)) title = "项目群成员变化";
  else if (/协议|签文件|签离职|签署/.test(content)) {
    title = "被要求签署文件";
    attention = /今天|当天|立即/.test(content) ? "priority" : "watch";
  } else if (/解除|辞退/.test(content)) {
    title = "收到解除沟通";
    attention = "priority";
  } else if (/调岗|停职/.test(content)) title = "工作安排调整";
  else if (/工资.*异常|工资.*没|欠薪|考勤/.test(content))
    title = "工资或考勤情况待核对";
  else if (/完成项目|表扬|绩效.*正常/.test(content)) {
    title = "工作中的积极进展";
    attention = "normal";
  } else if (/项目.*变化|项目.*调整/.test(content)) title = "项目安排变化";
  else if (/HR|人事/.test(content)) title = "HR 沟通记录";
  if (!title) return null;
  return {
    title,
    occurredAt: date,
    description: content,
    people: [],
    attention,
    sourceType,
    sourceId,
  };
}

export type Intent = "emotion" | "materials" | "urgent" | "event" | "smalltalk";

const EMOTION =
  /累|烦|难受|焦虑|委屈|开心|还行|撑不住|emo|心累|压力大|不想上班/;
const MATERIALS = /留什么|留点|保存什么|要保存|该保存|材料|证据|收集|截图/;
const URGENT =
  /今天签|当天签|立即签|今天就签|要求今天|今天离职|被通知解除|马上签|今天就办/;
/** 时间说得不确定，才需要补问一句 */
const VAGUE_TIME = /前几天|前阵子|上周|上个月|之前|某天|有段时间/;

/** 判断用户这句话想做什么，决定 AI 的回应方式 */
export function classifyIntent(text: string): Intent {
  if (URGENT.test(text)) return "urgent";
  if (MATERIALS.test(text)) return "materials";
  if (detectEvent(text, "chat")) return "event";
  if (EMOTION.test(text)) return "emotion";
  return "smalltalk";
}

/** 从「涉及主管、和 HR」这类说法里抽出人物 */
export function parsePeople(text: string): string[] {
  const mentioned = text.match(/(?:涉及|和|跟|与)([^，。,；;]+)/)?.[1];
  if (!mentioned) return [];
  return Array.from(
    new Set(
      mentioned
        .split(/[、,，和及]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

/**
 * 尽量用已有信息推断日期，**能推断就不补问**。
 * 说不清才返回 null，由调用方决定是否澄清。
 */
export function resolveDate(text: string, fallback: string): string | null {
  if (/今天|当天|刚刚|刚才/.test(text)) return fallback;
  if (/昨天|昨日/.test(text)) return addDays(fallback, -1);
  if (/前天/.test(text)) return addDays(fallback, -2);
  if (VAGUE_TIME.test(text)) return null;
  // 没提时间：默认就用这一天的记录日期
  return fallback;
}

export interface AssistantContext {
  /** 当前记录的日期 */
  date: string;
  /** 当前每日记录 id，作为候选事件与留痕建议的来源 */
  entryId: string;
  /** 当天全部用户原文（含本条） */
  userText: string;
  /** 当天已确认的事件 */
  confirmedEvents: WorkEvent[];
  /** 当天已有的草稿标题，避免重复生成同一候选 */
  draftTitles: string[];
  materials: Material[];
}

export interface AssistantReply {
  content: string;
  /** 需要用户确认的事件草稿。一般候选进「今日整理」，不必当场确认。 */
  candidateEvent?: EventInput;
  /** 这条草稿值得及时关注，在对话里给一张轻量卡片 */
  noteworthy?: boolean;
  /** 时间说不清，先补问一句 */
  clarify?: EventInput;
  /** 留痕建议（已按库存去重，只包含确实缺失的） */
  requirements?: MaterialRequirement[];
  /** 时间敏感，展示「整理当前情况」卡片 */
  emergency?: boolean;
  /** 已确认事件被补充，建议追加进展 */
  updateSuggestionEventId?: string;
  /** 这条回复来自本地模板而非真实模型（AI 未接入、调用失败或输出踩线） */
  fallback?: boolean;
}

/**
 * 用户问「该保存什么」时的基础清单。
 * 判断依据是当天全部原文加上当前这条消息——用户可能先说了情况再问该留什么。
 */
function baseRequirements(
  ctx: AssistantContext,
  text: string,
): MaterialRequirement[] {
  const haystack = `${ctx.userText} ${text}`;
  const list: MaterialRequirement[] = [
    {
      type: "contract",
      entryId: ctx.entryId,
      title: "当前有效劳动合同",
      reason: "用于确认劳动关系与岗位信息。",
      currentOnly: true,
    },
    {
      type: "salary",
      entryId: ctx.entryId,
      title: "最近一个月工资记录",
      reason: "便于核对发放情况，只补缺失的月份。",
    },
  ];
  if (/HR|人事|谈话|沟通/.test(haystack))
    list.push({
      type: "hr",
      entryId: ctx.entryId,
      title: "本次 HR 沟通记录",
      reason: "沟通内容建议保留原始记录。",
    });
  if (/考勤|打卡|加班/.test(haystack))
    list.push({
      type: "attendance",
      entryId: ctx.entryId,
      title: "相关考勤记录",
      reason: "考勤与工作时长建议留一份原始记录。",
    });
  if (/项目群|移出|群聊/.test(haystack))
    list.push({
      type: "project",
      entryId: ctx.entryId,
      title: "群聊变化记录",
      reason: "群成员或权限变化建议截图留存。",
    });
  return list;
}

/**
 * 根据用户输入生成结构化回应。
 *
 * 设计原则是**减少打扰**：
 * - 默认使用已有信息（日期默认就是这一天，人物从原话里抽），能整理就直接整理；
 * - 只有时间确实说不清（「前几天」）才补问一句；
 * - 一般候选直接进「今日整理」，不弹表单、不要求当场确认；
 * - 值得及时关注的变化才在对话里给一张轻量卡片。
 */
export function buildReply(text: string, ctx: AssistantContext): AssistantReply {
  const intent = classifyIntent(text);

  if (intent === "urgent") {
    return {
      content:
        "听起来这件事在时间上比较紧。我不会替你判断对错，但可以帮你把已知事实整理下来。要不要现在整理一下当前情况？一步一步来，整理完可以回到今天的记录。",
      emergency: true,
    };
  }

  if (intent === "materials") {
    const requirements = baseRequirements(ctx, text);
    const existing = requirements
      .filter((r) => matchingMaterials(r, ctx.materials).length > 0)
      .map((r) => matchingMaterials(r, ctx.materials)[0].name);
    const lines: string[] = ["我先查了你的材料库。"];
    lines.push(
      existing.length
        ? `已有：${Array.from(new Set(existing)).join("、")}，这些不需要重复处理。`
        : "材料库里暂时没有可以直接复用的材料。",
    );
    return {
      content: `${lines.join("")}\n下面只列出可能缺失的部分，按你知道的情况保存就好，不必勉强。`,
      requirements,
    };
  }

  const detected = detectEvent(text, "chat", ctx.entryId, ctx.date);

  if (detected) {
    // 已确认事件被新消息补充 → 建议追加进展，而不是新建重复事件
    const related = ctx.confirmedEvents.find((e) => e.title === detected.title);
    if (related) {
      return {
        content: `你提到的这件事，和已经记录的「${related.title}」看起来是同一件。要不要把这次的补充作为进展追加进去？我不会自动改写已确认的内容。`,
        updateSuggestionEventId: related.id,
      };
    }
    // 时间说不清才补问，其余一律先用已有信息整理
    const occurredAt = resolveDate(text, ctx.date);
    if (!occurredAt) {
      return {
        content:
          "这件事大概发生在哪一天？说个大概就行（例如「昨天」「就按今天」），我按你说的记。",
        clarify: detected,
      };
    }
    const draft: EventInput = {
      ...detected,
      occurredAt,
      people: parsePeople(text),
    };
    const requirements = requirementsForChange(
      `${ctx.userText} ${text}`,
      ctx.entryId,
      ctx.date,
    );
    if (ctx.draftTitles.includes(detected.title)) {
      return {
        content:
          "这件事今天已经有一条在「今日整理」里了，我不再重复生成。需要的话可以在那里确认或编辑。",
        requirements,
      };
    }
    const noteworthy = draft.attention !== "normal";
    return {
      content: noteworthy
        ? "听起来是个值得留意的变化。我先用现有信息整理了一条，要不要单独记下来？也可以先放着，之后在「今日整理」里处理。"
        : "我记下了一条，放在「今日整理」里，需要的时候再确认就好。",
      candidateEvent: draft,
      noteworthy,
      requirements,
    };
  }

  if (intent === "emotion") {
    return {
      content:
        "听起来今天挺消耗的。不需要每一次都发生特别的事，我会把你说的记在这里。想继续说也可以。",
    };
  }

  return {
    content:
      "我记下了。如果愿意，可以再说得具体一点，比如发生了什么、涉及谁、大概什么时候。",
  };
}

/** 用当天的状态与用户原文生成一段模拟总结（与原文分开保存） */
export function buildSummary(
  status: Partial<DailyStatusInput>,
  userText: string,
): string {
  const parts: string[] = [];
  if (status.mood)
    parts.push(`今天的你感到${MOODS[status.mood as Mood].label}`);
  const head = parts.length ? `${parts.join("，")}。` : "";
  const body = userText
    ? "已按关键词整理候选事件，请核对原文后再确认。"
    : "不需要每一天都发生特别的事，记录感受本身也有意义。";
  return `模拟 AI：${head}愿记录帮你看见自己的节奏。${body}`;
}

/* ---------- DeepSeek 接入：模型直接完成操作，失败自动回退本地规则 ---------- */

/** 界面上的红绿灯回调：成功亮绿、失败亮红 */
export type AIStatusReporter = (patch: Partial<AIConfig>) => void;

/**
 * 第一层约束：严格的系统提示词 + 固定的 JSON 结构。
 * 模型不只是"写回复"，而是把用户的自然语言直接整理成可执行的结构：
 * 事件标题 / 日期 / 人物 / 关注程度 / 是否紧急 / 是否补问时间。
 * 系统拿到 JSON 后直接执行（建草稿、弹卡片、补问），用户确认仍然保留。
 */
const structuredRules = [
  "你是「工作日记」应用里的陪伴式记录助手（角色名：小本）。",
  "把用户这句话整理成严格合法的 JSON（不要 Markdown 代码块、不要多余文字），系统会按 JSON 直接执行对应操作。",
  "",
  "输出 JSON 结构：",
  "{",
  '  "reply": "给用户的回应，2-3 句简体中文",',
  '  "urgent": false,',
  '  "needTime": false,',
  '  "addToExistingTitle": null,',
  '  "event": null',
  "}",
  "",
  "event 仅在用户描述了具体的职场变化时填写，否则整体为 null；填写时结构为：",
  "{",
  '  "title": "不超过 12 个字的客观标题，如：被移出项目群",',
  '  "occurredAt": "YYYY-MM-DD",',
  '  "people": ["仅从原文提取，不要编造"],',
  '  "attention": "normal | watch | priority",',
  '  "description": "用户原话的事实概括，不添加未提及的信息"',
  "}",
  "",
  "规则：",
  "1. 纯情绪、闲聊、提问不填 event。",
  "2. 时间：今天/昨天/前天按当前日期换算；说不清（如“前几天”）→ occurredAt 为 null 且 needTime=true，reply 里补问一句“大概哪一天”；没有提到时间默认用今天。",
  "3. attention：解除/辞退/强制签文件/停薪等 → priority；一般变化 → watch；积极进展 → normal。",
  "4. addToExistingTitle 仅当用户说的与「已确认事件标题」是同一件事时，原样填那个标题，否则 null。时间紧张（要求今天签、今天办理等）时 urgent=true。",
  "5. 禁止“公司违法”“一定能赢”“必须辞职”这类表述；不给法律结论；不用 emoji、不用列表。",
].join("\n");

export interface StructuredTurn {
  reply: string;
  urgent: boolean;
  needTime: boolean;
  addToExistingTitle: string | null;
  event: {
    title: string;
    occurredAt: string | null;
    people: string[];
    attention: Attention;
    description: string;
  } | null;
}

const ATTENTION_SET: Attention[] = ["normal", "watch", "priority"];

/**
 * 严格校验 YYYY-MM-DD 是否为真实存在的日历日期（拦截 2026-02-31、2026-99-99 等伪造日期）。
 */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}` === value;
}

/** 校验并清洗模型 JSON：任何字段不合规都会降级或丢弃，绝不直接信任模型输出 */
export function normalizeStructuredTurn(
  raw: unknown,
  date: string,
): StructuredTurn | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const reply =
    typeof o.reply === "string" ? o.reply.trim().slice(0, 600) : "";
  let event: StructuredTurn["event"] = null;
  if (o.event && typeof o.event === "object" && !Array.isArray(o.event)) {
    const ev = o.event as Record<string, unknown>;
    const title = typeof ev.title === "string" ? ev.title.trim().slice(0, 40) : "";
    if (title) {
      const rawDate =
        typeof ev.occurredAt === "string" ? ev.occurredAt.slice(0, 10) : "";
      const occurredAt =
        isValidDateString(rawDate) && rawDate <= date ? rawDate : null;
      event = {
        title,
        occurredAt,
        people: Array.isArray(ev.people)
          ? Array.from(
              new Set(
                ev.people
                  .filter((x): x is string => typeof x === "string")
                  .map((x) => x.trim().slice(0, 24))
                  .filter(Boolean),
              ),
            ).slice(0, 6)
          : [],
        attention: ATTENTION_SET.includes(ev.attention as Attention)
          ? (ev.attention as Attention)
          : "watch",
        description:
          typeof ev.description === "string"
            ? ev.description.trim().slice(0, 500)
            : "",
      };
    }
  }
  const urgent = o.urgent === true;
  const needTime = o.needTime === true;
  const addToExistingTitle =
    typeof o.addToExistingTitle === "string" && o.addToExistingTitle.trim()
      ? o.addToExistingTitle.trim().slice(0, 40)
      : null;
  if (!reply && !event && !urgent) return null;
  return { reply, urgent, needTime, addToExistingTitle, event };
}

/** 给模型看的上下文：当前日期、已确认事件、今天已有候选、今天的全部原文 */
const structuredMessages = (
  text: string,
  ctx: AssistantContext,
): ChatTurn[] => [
  {
    role: "system",
    content: `${structuredRules}

当前日期：${ctx.date}（周${weekday(ctx.date)}）
已确认事件标题：${ctx.confirmedEvents.map((e) => e.title).join("、") || "无"}
今天已有候选标题（不要重复）：${ctx.draftTitles.join("、") || "无"}
用户今天已说过的内容：
${ctx.userText.slice(-1500)}`,
  },
  { role: "user", content: text },
];

/**
 * 第二层约束：输出护栏。
 * 模型回复踩到产品明确不说的表述时，整条输出弃用、回退本地模板（保守优先）。
 * 这是演示级的安全网，极少数误判的代价只是一条稳妥的本地回复。
 */
const BANNED_REPLY =
  /(公司违法|违反劳动法|违法解除|违法辞退|一定能赢|仲裁必胜|稳赢|包赢|胜诉率|必须辞职|一定要辞职|建议你辞职|赶紧辞职|立刻辞职)/;
export const violatesReplyBoundaries = (text: string) => BANNED_REPLY.test(text);

/**
 * 第二层约束的完整版：模型输出里**所有会展示给用户的文本**都要过护栏。
 * 只扫 reply 是不够的——事件标题与描述同样会进入「今日整理」、回顾和报告，
 * 模型只要把越界表述塞进标题就能绕过检查。
 */
export const violatesTurnBoundaries = (turn: StructuredTurn) =>
  [turn.reply, turn.event?.title, turn.event?.description].some(
    (part) =>
      typeof part === "string" &&
      part.length > 0 &&
      violatesReplyBoundaries(part),
  );

/**
 * 把模型的结构化指令合并成系统动作：
 * - 生成/不生成候选事件（含标题、日期、人物、关注程度）
 * - 时间说不清 → 进入补问流程
 * - 是已确认事件的补充 → 建议追加进展
 * - 时间紧 → 展示整理入口卡片
 * 材料建议仍由本地规则基于材料库库存判断，模型不参与。
 */
function mergeStructuredTurn(
  turn: StructuredTurn,
  text: string,
  ctx: AssistantContext,
  local: AssistantReply,
): AssistantReply {
  const out: AssistantReply = { content: turn.reply || local.content };
  if (turn.urgent || local.emergency) out.emergency = true;

  if (!turn.event) {
    // 模型没识别出事件时保留本地兜底（例如“该保存什么材料”这类追问）
    if (local.requirements) out.requirements = local.requirements;
    return out;
  }

  const draft: EventInput = {
    title: turn.event.title,
    occurredAt: turn.event.occurredAt ?? ctx.date,
    people: turn.event.people,
    description: turn.event.description || text,
    attention: turn.event.attention,
    sourceType: "chat",
    sourceId: ctx.entryId,
  };
  const requirements = requirementsForChange(
    `${ctx.userText} ${text}`,
    ctx.entryId,
    ctx.date,
  );
  if (requirements.length) out.requirements = requirements;

  if (turn.needTime || !turn.event.occurredAt) {
    out.clarify = draft;
    return out;
  }
  const related =
    (turn.addToExistingTitle
      ? ctx.confirmedEvents.find((e) => e.title === turn.addToExistingTitle)
      : undefined) ?? ctx.confirmedEvents.find((e) => e.title === draft.title);
  if (related) {
    out.updateSuggestionEventId = related.id;
    return out;
  }
  if (ctx.draftTitles.includes(draft.title)) return out;
  out.candidateEvent = draft;
  out.noteworthy = draft.attention !== "normal";
  return out;
}

/**
 * 补问以后的回答交给模型换算日期/人物（能理解“上周五”这类说法），
 * 失败或没配 Key 时由调用方回退本地解析（resolveDate / parsePeople）。
 */
export async function fillClarifyAnswer(
  ai: AIConfig,
  awaiting: EventInput,
  answer: string,
  date: string,
): Promise<{ occurredAt: string | null; people: string[] } | null> {
  const raw = await deepseekJson(
    ai,
    [
      {
        role: "system",
        content: [
          `今天是 ${date}。用户在补充一件事发生的时间。`,
          "只输出 JSON：{\"occurredAt\": \"YYYY-MM-DD 或 null\", \"people\": [\"从回答中提取的人名\"]}。",
          "能推断就填具体日期（如“上周五”按今天换算）；说不清就 occurredAt 为 null；不要编造。",
        ].join("\n"),
      },
      {
        role: "user",
        content: `事件：${awaiting.title}\n原话：${awaiting.description}\n用户的补充：${answer}`,
      },
    ],
    120,
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const rawDate =
    typeof o.occurredAt === "string" ? o.occurredAt.slice(0, 10) : "";
  const occurredAt =
    isValidDateString(rawDate) && rawDate <= date ? rawDate : null;
  const people = Array.isArray(o.people)
    ? Array.from(
        new Set(
          o.people
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim().slice(0, 24))
            .filter(Boolean),
        ),
      ).slice(0, 6)
    : [];
  return { occurredAt, people };
}

const summaryRules = [
  "你是「工作日记」应用里的整理助手。",
  "用两句话以内写一段温和的今日小结：只概括用户自己写下的内容，不添加未提及的事实，不给结论、不评价对错；不使用 emoji，简体中文。",
].join("\n");

const summaryMessages = (
  status: Partial<DailyStatusInput>,
  userText: string,
): ChatTurn[] => {
  const mood = status.mood ? MOODS[status.mood as Mood].label : "未填写";
  return [
    { role: "system", content: summaryRules },
    {
      role: "user",
      content: `今天的心情：${mood}\n我今天的记录：\n${userText || "（今天没有写文字，只选了心情）"}`,
    },
  ];
};

export const aiService = {
  /**
   * 生成回应并直接完成操作。
   * 配置了 DeepSeek Key 时：模型把自然语言整理成结构化 JSON
   * （回复文本 + 事件标题/日期/人物/关注程度 + 是否紧急/补问），
   * 系统校验后直接执行：建事件草稿、弹轻量卡片、进入补问、给出整理入口。
   * 材料建议仍由本地规则基于材料库判断；任何失败都回退本地模板并显式标记。
   */
  async reply(
    text: string,
    ctx: AssistantContext,
    config: MockConfig,
    ai?: AIConfig,
    onStatus?: AIStatusReporter,
  ) {
    const local = buildReply(text, ctx);
    if (ai?.apiKey && ai.status !== "testing") {
      try {
        const raw = await deepseekJson(ai, structuredMessages(text, ctx));
        const turn = normalizeStructuredTurn(raw, ctx.date);
        if (!turn) throw new Error("AI 返回的内容无法识别，请重试。");
        onStatus?.({ status: "ok", lastError: undefined });
        // 输出踩到产品边界：整条弃用，回退本地模板并标记（回复、标题、描述都检查）
        if (violatesTurnBoundaries(turn))
          return { ...local, fallback: true };
        return mergeStructuredTurn(turn, text, ctx, local);
      } catch (e) {
        onStatus?.({ status: "error", lastError: (e as Error).message });
        // 调用失败：明确标记为本地回复，让用户看得见，而不是静默伪装
        return { ...local, fallback: true };
      }
    }
    await simulate(config);
    return local;
  },
  /** 生成今日总结：配置了 Key 时同样优先真实模型，并经过同样的输出护栏校验 */
  async summarize(
    status: Partial<DailyStatusInput>,
    userText: string,
    config: MockConfig,
    ai?: AIConfig,
    onStatus?: AIStatusReporter,
  ) {
    if (ai?.apiKey && ai.status !== "testing") {
      try {
        const content = await deepseekChat(
          ai,
          summaryMessages(status, userText),
          300,
        );
        onStatus?.({ status: "ok", lastError: undefined });
        if (violatesReplyBoundaries(content)) {
          return buildSummary(status, userText);
        }
        return content;
      } catch (e) {
        onStatus?.({ status: "error", lastError: (e as Error).message });
      }
    }
    await simulate(config);
    return buildSummary(status, userText);
  },
  async extract(file: File, config: MockConfig) {
    await simulate(config);
    if (file.name.toLowerCase().endsWith(".txt")) {
      const text = await file.text();
      return `模拟提取结果 · TXT 原文节选（最多 1200 字，未核实）\n${text.slice(0, 1200)}`;
    }
    return `模拟提取结果：已接收文件「${file.name}」。当前演示不读取图片或 PDF 中的人物与事实，请查看原文件并手动填写摘要。`;
  },
};
