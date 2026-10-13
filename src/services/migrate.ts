import type { AppData, MessageStatus } from "../types";
import { DEFAULT_AI_MODEL, LEGACY_AI_MODELS } from "../types";
import { today } from "../constants";
import { emptyData } from "./demo";

/**
 * 把旧数据升级到当前版本（每日记录 = 状态 + 日记 + 对话 + 结构化整理）。
 *
 * v1 → v2：老数据只有 entries / messages 两个平铺数组，需要补齐
 * - DailyEntry.conversationId / eventIds / suggestionIds
 * - ChatMessage.conversationId / dailyEntryId / status
 *
 * v2 → v3：留痕建议可以脱离事件存在，需要补齐
 * - MaterialSuggestion.entryId（从引用它的每日记录反推）
 * - DailyEntry.draftText（缺失即为没有未发送草稿，无需补值）
 *
 * v3 之内还删掉了 DailyEntry.stress / workingHours（状态只保留心情）。
 * 这两个字段只是可选项，老数据里残留的键会原样留在对象上、不再被读取，
 * 因此不需要额外的迁移分支，也不影响历史记录与对话。
 */
export function migrateData(persisted: unknown): AppData {
  const data = (persisted ?? {}) as Partial<AppData>;
  const events = data.events ?? [];
  const rawSuggestions = data.suggestions ?? [];
  const entries = (data.entries ?? []).map((entry) => {
    const conversationId = entry.conversationId ?? `conv-${entry.date}`;
    const eventIds =
      entry.eventIds ??
      events.filter((e) => e.sourceId === entry.id).map((e) => e.id);
    const suggestionIds =
      entry.suggestionIds ??
      rawSuggestions
        .filter(
          (s) =>
            (s.eventId && eventIds.includes(s.eventId)) || s.entryId === entry.id,
        )
        .map((s) => s.id);
    return { ...entry, conversationId, eventIds, suggestionIds };
  });
  // 建议归属：优先用已有的 entryId，否则找引用它的那一天
  const suggestions = rawSuggestions.map((s) => {
    if (s.entryId) return s;
    const owner = entries.find((e) => e.suggestionIds.includes(s.id));
    return owner ? { ...s, entryId: owner.id } : s;
  });
  // v5 及以前默认写成了接口不支持的模型名，统一纠正并重置连接状态
  const ai =
    data.ai && LEGACY_AI_MODELS.includes(data.ai.model)
      ? {
          ...data.ai,
          model: DEFAULT_AI_MODEL,
          status: "unset" as const,
          lastError: undefined,
        }
      : data.ai;
  const fallbackEntry =
    entries.find((e) => e.date === today()) ?? entries[entries.length - 1];
  const messages = (data.messages ?? []).map((message) => {
    const conversationId = message.conversationId ?? "default";
    const owner =
      entries.find((e) => e.conversationId === conversationId) ?? fallbackEntry;
    return {
      ...message,
      conversationId,
      dailyEntryId: message.dailyEntryId ?? owner?.id ?? "",
      status: message.status ?? ("sent" as MessageStatus),
    };
  });
  return {
    ...emptyData(),
    ...data,
    entries,
    messages,
    suggestions,
    ...(ai ? { ai } : {}),
  };
}
