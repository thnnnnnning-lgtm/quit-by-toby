import type { AppData, MessageStatus } from "../types";
import {
  DEFAULT_AI_MODEL,
  DEFAULT_CHECKIN_HOUR,
  LEGACY_AI_MODELS,
} from "../types";
import { today } from "../constants";
import { emptyData } from "./demo";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * 把旧数据升级到当前版本（每日记录 = 状态 + 日记 + 对话 + 结构化整理），
 * 并对外部导入或损坏的本地数据做防御性清洗（防止缺失子数组导致页面 .join/.map 崩溃）。
 *
 * v1 → v2：老数据只有 entries / messages 两个平铺数组，需要补齐
 * - DailyEntry.conversationId / eventIds / suggestionIds
 * - ChatMessage.conversationId / dailyEntryId / status
 *
 * v2 → v3：留痕建议可以脱离事件存在，需要补齐
 * - MaterialSuggestion.entryId（从引用它的每日记录反推）
 * - DailyEntry.draftText（缺失即为没有未发送草稿，无需补值）
 *
 * v4 ~ v6：工资提醒、下班打卡小时、DeepSeek 默认模型纠正与字段防御。
 */
export function migrateData(persisted: unknown): AppData {
  const base = emptyData();
  const data = isPlainObject(persisted)
    ? (persisted as Partial<AppData>)
    : {};
  const rawEvents = Array.isArray(data.events)
    ? data.events.filter(isPlainObject)
    : [];
  const events = rawEvents.map((ev) => ({
    ...ev,
    id: typeof ev.id === "string" ? ev.id : "",
    title: typeof ev.title === "string" ? ev.title : "未命名事件",
    occurredAt:
      typeof ev.occurredAt === "string" ? ev.occurredAt : today(),
    people: toStringArray(ev.people),
    description: typeof ev.description === "string" ? ev.description : "",
    status:
      ev.status === "confirmed" || ev.status === "dismissed"
        ? ev.status
        : ("draft" as const),
    attention:
      ev.attention === "normal" ||
      ev.attention === "watch" ||
      ev.attention === "priority"
        ? ev.attention
        : ("watch" as const),
    sourceType:
      ev.sourceType === "daily" ||
      ev.sourceType === "chat" ||
      ev.sourceType === "manual" ||
      ev.sourceType === "emergency"
        ? ev.sourceType
        : ("chat" as const),
    materialIds: toStringArray(ev.materialIds),
    updates: Array.isArray(ev.updates)
      ? ev.updates.filter(isPlainObject).map((u) => ({
          id: typeof u.id === "string" ? u.id : "",
          content: typeof u.content === "string" ? u.content : "",
          createdAt: typeof u.createdAt === "string" ? u.createdAt : today(),
        }))
      : [],
    createdAt: typeof ev.createdAt === "string" ? ev.createdAt : today(),
    updatedAt: typeof ev.updatedAt === "string" ? ev.updatedAt : today(),
  }));

  const rawSuggestions = Array.isArray(data.suggestions)
    ? data.suggestions.filter(isPlainObject)
    : [];
  const rawEntries = Array.isArray(data.entries)
    ? data.entries.filter(isPlainObject)
    : [];
  const entries = rawEntries.map((entry) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    const date = typeof entry.date === "string" ? entry.date : today();
    const conversationId =
      typeof entry.conversationId === "string"
        ? entry.conversationId
        : `conv-${date}`;
    const eventIds = Array.isArray(entry.eventIds)
      ? toStringArray(entry.eventIds)
      : events.filter((e) => e.sourceId === id).map((e) => e.id);
    const suggestionIds = Array.isArray(entry.suggestionIds)
      ? toStringArray(entry.suggestionIds)
      : rawSuggestions
          .filter(
            (s) =>
              (typeof s.eventId === "string" &&
                eventIds.includes(s.eventId)) ||
              s.entryId === id,
          )
          .map((s) => String(s.id ?? ""));
    return {
      ...entry,
      id,
      date,
      content: typeof entry.content === "string" ? entry.content : "",
      tags: toStringArray(entry.tags),
      conversationId,
      eventIds,
      suggestionIds,
      createdAt:
        typeof entry.createdAt === "string" ? entry.createdAt : today(),
      updatedAt:
        typeof entry.updatedAt === "string" ? entry.updatedAt : today(),
    };
  });

  // 建议归属：优先用已有的 entryId，否则找引用它的那一天
  const suggestions = rawSuggestions.map((s) => {
    const id = typeof s.id === "string" ? s.id : "";
    const normalized = {
      ...s,
      id,
      type: (typeof s.type === "string" ? s.type : "other") as AppData["suggestions"][number]["type"],
      title: typeof s.title === "string" ? s.title : "待补充材料",
      reason: typeof s.reason === "string" ? s.reason : "",
      status:
        s.status === "completed" ||
        s.status === "deferred" ||
        s.status === "not_needed"
          ? s.status
          : ("pending" as const),
      createdAt: typeof s.createdAt === "string" ? s.createdAt : today(),
    };
    if (typeof normalized.entryId === "string" && normalized.entryId)
      return normalized;
    const owner = entries.find((e) => e.suggestionIds.includes(id));
    return owner ? { ...normalized, entryId: owner.id } : normalized;
  });

  const materials = (
    Array.isArray(data.materials) ? data.materials.filter(isPlainObject) : []
  ).map((m) => ({
    ...m,
    id: typeof m.id === "string" ? m.id : "",
    name: typeof m.name === "string" ? m.name : "未命名材料",
    type: (typeof m.type === "string" ? m.type : "other") as AppData["materials"][number]["type"],
    status:
      m.status === "uploaded" || m.status === "saved_externally"
        ? m.status
        : ("pending" as const),
    isCurrent: typeof m.isCurrent === "boolean" ? m.isCurrent : true,
    eventIds: toStringArray(m.eventIds),
    extractionStatus:
      m.extractionStatus === "draft" || m.extractionStatus === "confirmed"
        ? m.extractionStatus
        : ("none" as const),
    createdAt: typeof m.createdAt === "string" ? m.createdAt : today(),
    updatedAt: typeof m.updatedAt === "string" ? m.updatedAt : today(),
  }));

  const emergencies = (
    Array.isArray(data.emergencies)
      ? data.emergencies.filter(isPlainObject)
      : []
  ).map((em) => ({
    ...em,
    id: typeof em.id === "string" ? em.id : "",
    category: (typeof em.category === "string"
      ? em.category
      : "other") as AppData["emergencies"][number]["category"],
    answers: isPlainObject(em.answers)
      ? (em.answers as Record<string, string>)
      : {},
    factsDraft: typeof em.factsDraft === "string" ? em.factsDraft : "",
    priority:
      em.priority === "routine" ||
      em.priority === "priority" ||
      em.priority === "urgent"
        ? em.priority
        : ("routine" as const),
    priorityReasons: toStringArray(em.priorityReasons),
    createdAt: typeof em.createdAt === "string" ? em.createdAt : today(),
  }));

  // v5 及以前默认写成了接口不支持的模型名，统一纠正并重置连接状态
  const rawAi = isPlainObject(data.ai) ? data.ai : undefined;
  const ai = rawAi
    ? LEGACY_AI_MODELS.includes(String(rawAi.model ?? ""))
      ? {
          ...base.ai,
          ...rawAi,
          model: DEFAULT_AI_MODEL,
          status: "unset" as const,
          lastError: undefined,
        }
      : { ...base.ai, ...rawAi }
    : base.ai;

  const fallbackEntry =
    entries.find((e) => e.date === today()) ?? entries[entries.length - 1];
  const rawMessages = Array.isArray(data.messages)
    ? data.messages.filter(isPlainObject)
    : [];
  const messages = rawMessages.map((message) => {
    const conversationId =
      typeof message.conversationId === "string"
        ? message.conversationId
        : "default";
    const owner =
      entries.find((e) => e.conversationId === conversationId) ?? fallbackEntry;
    return {
      ...message,
      id: typeof message.id === "string" ? message.id : "",
      role:
        message.role === "assistant"
          ? ("assistant" as const)
          : ("user" as const),
      content: typeof message.content === "string" ? message.content : "",
      conversationId,
      dailyEntryId:
        typeof message.dailyEntryId === "string" && message.dailyEntryId
          ? message.dailyEntryId
          : (owner?.id ?? ""),
      status: (message.status === "sending" || message.status === "failed"
        ? message.status
        : "sent") as MessageStatus,
      createdAt:
        typeof message.createdAt === "string" ? message.createdAt : today(),
    };
  });

  const rawHour = Number(data.checkInHour);
  const checkInHour = Number.isFinite(rawHour)
    ? Math.min(23, Math.max(0, Math.floor(rawHour)))
    : DEFAULT_CHECKIN_HOUR;

  return {
    ...base,
    ...data,
    profile: isPlainObject(data.profile)
      ? (data.profile as unknown as AppData["profile"])
      : null,
    onboarded: Boolean(data.onboarded),
    isDemo: Boolean(data.isDemo),
    entries: entries as AppData["entries"],
    events: events as AppData["events"],
    materials: materials as AppData["materials"],
    suggestions: suggestions as AppData["suggestions"],
    emergencies: emergencies as AppData["emergencies"],
    messages: messages as AppData["messages"],
    checkInHour,
    ai: ai as AppData["ai"],
  };
}
