import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppData,
  AIConfig,
  WorkProfile,
  DailyStatusInput,
  WorkEvent,
  EventInput,
  MaterialInput,
  EmergencySession,
  ChatMessage,
  ChatMessageInput,
  MaterialSuggestion,
  MessageStatus,
} from "../types";
import { isDiaryWorthy, uid, now } from "../constants";
import { emptyData, createDemo } from "../services/demo";
import { migrateData } from "../services/migrate";
import { fileService } from "../services/files";
import {
  createSuggestions,
  reconcileSuggestions,
  requirementsForEvent,
  type MaterialRequirement,
} from "../services/materials";

/**
 * 从日记原文里撤回**最后一次**追加的那一段（appendMessage 用 \n 拼接）。
 * 用最后一次出现的位置，避免误删早先写过的同样内容。
 */
function removeLastOccurrence(haystack: string, needle: string): string {
  if (!needle) return haystack;
  const index = haystack.lastIndexOf(needle);
  if (index === -1) return haystack;
  const before = haystack.slice(0, index);
  const after = haystack.slice(index + needle.length);
  // 去掉拼接时插入的分隔换行，保留用户自己写的换行
  const head = before.endsWith("\n") ? before.slice(0, -1) : before;
  const tail = !head && after.startsWith("\n") ? after.slice(1) : after;
  return head + tail;
}

export const STORAGE_KEY = "workday-companion-v1";
/**
 * 数据模型版本：
 * - 2 起为「每日记录 = 状态 + 日记 + 对话 + 结构化整理」
 * - 3 起心情为唯一主入口、新增未发送草稿、留痕建议可脱离事件存在
 * - 4 起新增工资月度提醒开关与 DeepSeek 接入配置（旧数据自动补默认值）
 * - 5 起新增快速打卡提醒时间（下班时间，默认 18 点）
 * - 6 起纠正误用的 DeepSeek 默认模型名（deepseek-v4.1-flash → deepseek-flash）
 */
const STORAGE_VERSION = 6;

export interface AppStore extends AppData {
  finishOnboarding: (profile: WorkProfile) => void;
  saveProfile: (profile: WorkProfile) => void;

  /** 取得某天的每日记录 id，不存在则创建一条空记录 */
  ensureEntry: (date: string) => string;
  /** 保存当天状态（心情必填），与对话分开 */
  setStatus: (input: DailyStatusInput) => string;
  /** 保存输入框里还没发送的文字，刷新后可以恢复 */
  setDraftText: (entryId: string, draftText: string) => void;
  /** 直接编辑某天的日记原文（方便用户修正错别字或补充记录） */
  updateEntryContent: (entryId: string, content: string) => void;
  /** 写入 AI 今日总结（与用户原文分开保存） */
  setSummary: (entryId: string, summary: string) => void;

  /** 追加一条对话消息；用户消息会同时累积进当天日记原文 */
  appendMessage: (input: ChatMessageInput) => string;
  setMessageStatus: (id: string, status: MessageStatus) => void;
  removeMessage: (id: string) => void;

  addDraft: (input: EventInput) => string;
  confirmEvent: (id: string) => void;
  updateEvent: (id: string, patch: Partial<WorkEvent>) => void;
  dismissEvent: (id: string) => void;
  deleteEvent: (id: string) => void;
  addUpdate: (id: string, content: string) => void;
  createManualEvent: (input: EventInput) => string;

  saveMaterial: (input: MaterialInput, suggestionId?: string) => string;
  deleteMaterial: (id: string) => Promise<void>;
  suggest: (requirements: MaterialRequirement[], entryId?: string) => string[];
  setSuggestionStatus: (
    id: string,
    status: MaterialSuggestion["status"],
  ) => void;

  saveEmergency: (session: EmergencySession) => void;
  updateEmergency: (id: string, patch: Partial<EmergencySession>) => void;
  confirmEmergency: (id: string) => string;

  setNotification: (enabled: boolean) => void;
  /** 每月工资提醒开关 */
  setSalaryReminder: (enabled: boolean) => void;
  /** 快速打卡提醒时间（小时） */
  setCheckInHour: (hour: number) => void;
  /** DeepSeek 接入配置与连接状态（红绿灯） */
  setAI: (patch: Partial<AIConfig>) => void;
  setMockConfig: (patch: Partial<AppData["mockConfig"]>) => void;
  consumeMockConfig: () => AppData["mockConfig"];
  /** 从备份文件导入用户数据；本机的 AI 接入配置与密钥不随备份覆盖 */
  importData: (data: AppData) => void;
  loadDemo: (replace?: boolean) => Promise<void>;
  clearData: () => Promise<void>;
}

const localJSONStorage = createJSONStorage<AppData>(() => ({
  getItem: (key) => localStorage.getItem(key),
  removeItem: (key) => localStorage.removeItem(key),
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      throw new Error(
        "浏览器存储写入失败，请释放空间后重试；当前修改可能未能保存。",
      );
    }
  },
}));

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...emptyData(),

      finishOnboarding: (profile) => set({ profile, onboarded: true }),
      saveProfile: (profile) => set({ profile }),

      ensureEntry: (date) => {
        const existing = get().entries.find((e) => e.date === date);
        if (existing) return existing.id;
        const id = uid();
        const stamp = now();
        set((s) => ({
          entries: [
            ...s.entries,
            {
              id,
              date,
              content: "",
              tags: [],
              conversationId: `conv-${date}`,
              eventIds: [],
              suggestionIds: [],
              createdAt: stamp,
              updatedAt: stamp,
            },
          ],
        }));
        return id;
      },

      setStatus: (input) => {
        const id = get().ensureEntry(input.date);
        const stamp = now();
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id
              ? {
                  ...e,
                  mood: input.mood,
                  updatedAt: stamp,
                }
              : e,
          ),
        }));
        return id;
      },

      setDraftText: (entryId, draftText) => {
        const current = get().entries.find((e) => e.id === entryId);
        if (!current || (current.draftText ?? "") === draftText) return;
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === entryId ? { ...e, draftText, updatedAt: now() } : e,
          ),
        }));
      },

      updateEntryContent: (entryId, content) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === entryId
              ? { ...e, content: content.trim(), updatedAt: now() }
              : e,
          ),
        })),

      setSummary: (entryId, summary) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === entryId
              ? { ...e, aiSummary: summary, updatedAt: now() }
              : e,
          ),
        })),

      appendMessage: (input) => {
        const id = uid();
        const stamp = now();
        set((s) => ({
          messages: [
            ...s.messages,
            {
              ...input,
              id,
              status: input.status ?? ("sent" as MessageStatus),
              createdAt: stamp,
            },
          ],
          entries:
            // 寒暄 / 测试 / 只对助手的提问仍然留在对话里，但不写进日记原文
            input.role === "user" && isDiaryWorthy(input.content)
              ? s.entries.map((e) =>
                  e.id === input.dailyEntryId
                    ? {
                        ...e,
                        content: e.content
                          ? `${e.content}\n${input.content}`
                          : input.content,
                        updatedAt: stamp,
                      }
                    : e,
                )
              : s.entries,
        }));
        return id;
      },

      setMessageStatus: (id, status) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, status } : m)),
        })),

      removeMessage: (id) =>
        set((s) => {
          const target = s.messages.find((m) => m.id === id);
          if (!target) return { messages: s.messages };
          return {
            messages: s.messages.filter((m) => m.id !== id),
            // 用户消息会同时并进当天日记原文，删掉消息时要把这一段也撤回。
            // 否则「重试这条」会先把原文留在里面、再追加一次，同一句话被写两遍。
            entries:
              target.role === "user"
                ? s.entries.map((e) =>
                    e.id === target.dailyEntryId
                      ? {
                          ...e,
                          content: removeLastOccurrence(
                            e.content,
                            target.content,
                          ),
                          updatedAt: now(),
                        }
                      : e,
                  )
                : s.entries,
          };
        }),

      addDraft: (input) => {
        const existing = get().events.find(
          (e) =>
            e.sourceType === input.sourceType &&
            e.sourceId === input.sourceId &&
            e.title === input.title,
        );
        if (existing) return existing.id;
        const id = uid();
        const stamp = now();
        set((s) => ({
          events: [
            ...s.events,
            {
              ...input,
              id,
              status: "draft",
              materialIds: [],
              updates: [],
              createdAt: stamp,
              updatedAt: stamp,
            },
          ],
          // 事件候选挂到当天的每日记录上，方便时间线与报告引用
          entries: input.sourceId
            ? s.entries.map((e) =>
                e.id === input.sourceId
                  ? { ...e, eventIds: Array.from(new Set([...e.eventIds, id])) }
                  : e,
              )
            : s.entries,
        }));
        return id;
      },

      confirmEvent: (id) => {
        const target = get().events.find((e) => e.id === id);
        if (!target || target.status !== "draft") return;
        const confirmed = {
          ...target,
          status: "confirmed" as const,
          confirmedAt: now(),
          updatedAt: now(),
        };
        set((s) => {
          const owner = confirmed.sourceId;
          const added = createSuggestions(
            requirementsForEvent(confirmed),
            s.materials,
            s.suggestions,
          ).map((x) => (owner ? { ...x, entryId: owner } : x));
          return {
            events: s.events.map((e) => (e.id === id ? confirmed : e)),
            suggestions: [...s.suggestions, ...added],
            entries: owner
              ? s.entries.map((e) =>
                  e.id === owner
                    ? {
                        ...e,
                        suggestionIds: Array.from(
                          new Set([
                            ...e.suggestionIds,
                            ...added.map((x) => x.id),
                          ]),
                        ),
                      }
                    : e,
                )
              : s.entries,
          };
        });
      },

      updateEvent: (id, patch) =>
        set((s) => {
          const events = s.events.map((e) =>
            e.id === id
              ? { ...e, ...patch, id: e.id, status: e.status, updatedAt: now() }
              : e,
          );
          const event = events.find((e) => e.id === id);
          if (!event || event.status !== "confirmed") return { events };
          const owner = event.sourceId;
          const mine = s.suggestions.filter((x) => x.eventId === id);
          // 已经处理过（已完成 / 明确不需要）的建议保留，不再打扰用户；
          // 还没处理的按事件的新内容重算，避免改完标题后留下对不上的旧建议
          const settled = mine.filter(
            (x) => x.status === "completed" || x.status === "not_needed",
          );
          const stale = new Set(
            mine
              .filter((x) => x.status === "pending" || x.status === "deferred")
              .map((x) => x.id),
          );
          const others = s.suggestions.filter((x) => x.eventId !== id);
          const added = createSuggestions(
            requirementsForEvent(event),
            s.materials,
            [...others, ...settled],
          ).map((x) => (owner ? { ...x, entryId: owner } : x));
          return {
            events,
            suggestions: reconcileSuggestions(
              [...others, ...settled, ...added],
              s.materials,
            ),
            entries: s.entries.map((e) => ({
              ...e,
              suggestionIds: Array.from(
                new Set([
                  ...e.suggestionIds.filter((sid) => !stale.has(sid)),
                  ...(owner === e.id ? added.map((x) => x.id) : []),
                ]),
              ),
            })),
          };
        }),

      dismissEvent: (id) =>
        set((s) => ({
          events: s.events.map((e) =>
            e.id === id && e.status === "draft"
              ? { ...e, status: "dismissed" }
              : e,
          ),
        })),

      deleteEvent: (id) =>
        set((s) => {
          // 这个事件名下的建议会被一并删除，日记里对它们的引用也要清掉，
          // 否则 DailyEntry.suggestionIds 会指向一个不存在的建议（悬空引用）
          const removedSuggestionIds = new Set(
            s.suggestions.filter((x) => x.eventId === id).map((x) => x.id),
          );
          return {
            events: s.events.filter((e) => e.id !== id),
            materials: s.materials.map((m) => ({
              ...m,
              eventIds: m.eventIds.filter((x) => x !== id),
            })),
            suggestions: s.suggestions.filter((x) => x.eventId !== id),
            emergencies: s.emergencies.map((x) =>
              x.eventId === id ? { ...x, eventId: undefined } : x,
            ),
            entries: s.entries.map((e) => ({
              ...e,
              eventIds: e.eventIds.filter((x) => x !== id),
              suggestionIds: e.suggestionIds.filter(
                (sid) => !removedSuggestionIds.has(sid),
              ),
            })),
          };
        }),

      addUpdate: (id, content) =>
        set((s) => ({
          events: s.events.map((e) =>
            e.id === id
              ? {
                  ...e,
                  updates: [
                    ...e.updates,
                    { id: uid(), content, createdAt: now() },
                  ],
                  updatedAt: now(),
                }
              : e,
          ),
        })),

      createManualEvent: (input) => {
        const id = get().addDraft({ ...input, sourceType: "manual" });
        get().confirmEvent(id);
        return id;
      },

      saveMaterial: (input, suggestionId) => {
        const id = input.id || uid();
        const stamp = now();
        const old = get().materials.find((m) => m.id === id);
        const material = {
          ...input,
          id,
          createdAt: old ? old.createdAt : stamp,
          updatedAt: stamp,
        };
        set((s) => {
          const materials = [
            ...s.materials.filter((m) => m.id !== id),
            material,
          ];
          const events = s.events.map((e) => ({
            ...e,
            materialIds: material.eventIds.includes(e.id)
              ? Array.from(new Set([...e.materialIds, id]))
              : e.materialIds.filter((x) => x !== id),
          }));
          let suggestions = reconcileSuggestions(s.suggestions, materials);
          if (suggestionId) {
            const target = suggestions.find((x) => x.id === suggestionId);
            if (target && target.status === "completed") {
              suggestions = suggestions.map((x) =>
                x.id === suggestionId ? { ...x, resolvedMaterialId: id } : x,
              );
            }
          }
          return { materials, events, suggestions };
        });
        return id;
      },

      deleteMaterial: async (id) => {
        const target = get().materials.find((m) => m.id === id);
        if (!target) return;
        if (target.fileId) {
          await fileService.remove(target.fileId).catch(() => {});
        }
        set((s) => {
          const materials = s.materials.filter((m) => m.id !== id);
          const events = s.events.map((e) => ({
            ...e,
            materialIds: e.materialIds.filter((x) => x !== id),
          }));
          const cleanedSuggestions = s.suggestions.map((sug) =>
            sug.resolvedMaterialId === id
              ? { ...sug, resolvedMaterialId: undefined }
              : sug,
          );
          return {
            materials,
            events,
            suggestions: reconcileSuggestions(cleanedSuggestions, materials),
          };
        });
      },

      suggest: (requirements, entryId) => {
        const added = createSuggestions(
          requirements,
          get().materials,
          get().suggestions,
        ).map((x) => (entryId ? { ...x, entryId } : x));
        set((s) => ({
          suggestions: reconcileSuggestions(
            [...s.suggestions, ...added],
            s.materials,
          ),
          entries: entryId
            ? s.entries.map((e) =>
                e.id === entryId
                  ? {
                      ...e,
                      suggestionIds: Array.from(
                        new Set([
                          ...e.suggestionIds,
                          ...added.map((x) => x.id),
                        ]),
                      ),
                    }
                  : e,
              )
            : s.entries,
        }));
        return added.map((x) => x.id);
      },

      setSuggestionStatus: (id, status) =>
        set((s) => ({
          suggestions: s.suggestions.map((x) =>
            x.id === id ? { ...x, status } : x,
          ),
        })),

      saveEmergency: (session) =>
        set((s) => ({
          emergencies: [
            ...s.emergencies.filter((x) => x.id !== session.id),
            session,
          ],
        })),

      updateEmergency: (id, patch) =>
        set((s) => ({
          emergencies: s.emergencies.map((x) =>
            x.id === id ? { ...x, ...patch, id: x.id } : x,
          ),
        })),

      confirmEmergency: (id) => {
        const session = get().emergencies.find((x) => x.id === id);
        if (!session) throw new Error("问卷记录不存在，请重新填写。");
        if (
          session.eventId &&
          get().events.some((e) => e.id === session.eventId)
        )
          return session.eventId as string;
        const title =
          session.factsDraft.split("\n")[0].replace("事项：", "") ||
          "紧急事项记录";
        const entryId = session.date
          ? get().ensureEntry(session.date)
          : undefined;
        const eventId = get().addDraft({
          title,
          occurredAt: session.date || session.createdAt.slice(0, 10),
          people: [],
          description: session.factsDraft,
          attention: session.priority === "routine" ? "watch" : "priority",
          sourceType: "emergency",
          sourceId: entryId,
        });
        get().confirmEvent(eventId);
        get().updateEmergency(id, { eventId });
        return eventId;
      },

      setNotification: (notificationEnabled) => set({ notificationEnabled }),
      setSalaryReminder: (salaryReminderEnabled) => set({ salaryReminderEnabled }),
      setCheckInHour: (checkInHour) =>
        set({ checkInHour: Math.min(23, Math.max(0, checkInHour)) }),
      setAI: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
      setMockConfig: (patch) =>
        set((s) => ({ mockConfig: { ...s.mockConfig, ...patch } })),
      consumeMockConfig: () => {
        const config = { ...get().mockConfig };
        if (config.failNext)
          set((s) => ({ mockConfig: { ...s.mockConfig, failNext: false } }));
        return config;
      },

      importData: (data) =>
        set((s) => ({
          ...data,
          // 备份里不含密钥（见 services/backup.ts），导入后继续用本机的 AI 配置
          ai: s.ai,
        })),

      loadDemo: async (replace = false) => {
        if (get().onboarded && !replace)
          throw new Error(
            "当前已有工作档案。请在「我的」中确认重置，避免覆盖你的数据。",
          );
        if (replace) await fileService.clear();
        const data = await createDemo();
        // 演示故事只覆盖「故事数据」，AI 接入配置与提醒设置属于用户偏好，需要保留
        set({
          ...data,
          ai: get().ai,
          salaryReminderEnabled: get().salaryReminderEnabled,
          checkInHour: get().checkInHour,
        });
      },

      clearData: async () => {
        await fileService.clear();
        set(emptyData());
        localStorage.removeItem(STORAGE_KEY);
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: localJSONStorage,
      migrate: (persisted) => migrateData(persisted),
    },
  ),
);
