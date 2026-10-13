import type {
  AppData,
  ChatMessage,
  DailyEntry,
  Material,
  WorkEvent,
} from "../types";
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_CHECKIN_HOUR,
} from "../types";
import { addDays, dateKey, now, today, uid } from "../constants";
import { fileService } from "./files";
import {
  createSuggestions,
  requirementsForChange,
  requirementsForEvent,
} from "./materials";

export const emptyData = (): AppData => ({
  profile: null,
  onboarded: false,
  isDemo: false,
  entries: [],
  events: [],
  materials: [],
  suggestions: [],
  emergencies: [],
  messages: [],
  notificationEnabled: false,
  salaryReminderEnabled: true,
  checkInHour: DEFAULT_CHECKIN_HOUR,
  ai: {
    apiKey: "",
    model: DEFAULT_AI_MODEL,
    baseUrl: DEFAULT_AI_BASE_URL,
    status: "unset",
  },
  mockConfig: { delayMs: 650, failNext: false },
});

/**
 * 演示故事：全部为虚构内容，不含任何真实个人信息。
 * 覆盖「状态已填 + 有对话 + 有草稿 + 有已确认事件 + 有材料建议」的完整状态。
 */
export async function createDemo(): Promise<AppData> {
  const t = today();
  const stamp = now();
  const day1 = addDays(t, -4);
  const day2 = addDays(t, -3);
  const day3 = addDays(t, -2);
  const day4 = addDays(t, -1);

  const entries: DailyEntry[] = [
    {
      id: uid(),
      date: day1,
      mood: "tired",
      content: "今天有些疲惫，老板取消了两个项目会议，我还不太清楚后续安排。",
      tags: ["会议变化"],
      conversationId: `conv-${day1}`,
      eventIds: [],
      suggestionIds: [],
      aiSummary:
        "模拟 AI：今天的你感到疲惫。愿记录帮你看见自己的节奏。已按关键词整理候选事件，请核对原文后再确认。",
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: uid(),
      date: day2,
      mood: "okay",
      content: "完成了手头的小任务，下班后散步了。",
      tags: ["今天挺正常"],
      conversationId: `conv-${day2}`,
      eventIds: [],
      suggestionIds: [],
      aiSummary: "模拟 AI：普通的一天，也有自己的小小进展。",
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: uid(),
      date: day3,
      mood: "sad",
      content:
        "今天被移出项目群了，想找主管了解一下情况。\n就按今天，涉及主管。",
      tags: ["项目变化"],
      conversationId: `conv-${day3}`,
      eventIds: [],
      suggestionIds: [],
      aiSummary:
        "模拟 AI：今天的你感到委屈。愿记录帮你看见自己的节奏。已按关键词整理候选事件，请核对原文后再确认。",
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: uid(),
      date: day4,
      mood: "neutral",
      content: "整理了一下自己的工作记录。",
      tags: ["今天挺正常"],
      conversationId: `conv-${day4}`,
      eventIds: [],
      suggestionIds: [],
      aiSummary: "模拟 AI：给自己一点整理的时间。",
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  const [entry1, , entry3] = entries;

  const draftEventId = uid();
  const confirmedEventId = uid();

  const events: WorkEvent[] = [
    {
      id: draftEventId,
      title: "会议安排变化",
      occurredAt: day1,
      people: ["主管（虚构）"],
      description: entry1.content,
      status: "draft",
      attention: "watch",
      sourceType: "chat",
      sourceId: entry1.id,
      materialIds: [],
      updates: [],
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: confirmedEventId,
      title: "被移出项目群",
      occurredAt: day3,
      people: ["主管（虚构）"],
      description: entry3.content,
      status: "confirmed",
      attention: "watch",
      sourceType: "chat",
      sourceId: entry3.id,
      materialIds: [],
      updates: [],
      confirmedAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];

  entry1.eventIds = [draftEventId];
  entry3.eventIds = [confirmedEventId];

  const year = new Date().getFullYear();
  const file = new File(
    [
      "虚构演示材料，非真实工资凭证。\n7 月、8 月、9 月工资记录示例。\n不含真实姓名、金额、银行卡或身份信息。",
    ],
    `${year}年7-9月工资-虚构示例.txt`,
    { type: "text/plain" },
  );
  const fileId = await fileService.put(file);
  const materials: Material[] = [
    {
      id: uid(),
      name: "当前有效劳动合同",
      type: "contract",
      status: "saved_externally",
      isCurrent: true,
      eventIds: [],
      externalLocationNote: "家中资料夹（虚构示例）",
      extractionStatus: "none",
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: uid(),
      name: "入职 Offer",
      type: "offer",
      status: "saved_externally",
      isCurrent: true,
      eventIds: [],
      externalLocationNote: "个人邮箱（虚构示例）",
      extractionStatus: "none",
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: uid(),
      name: "7–9 月工资记录 · 虚构示例",
      type: "salary",
      status: "uploaded",
      coverageStart: `${year}-07-01`,
      coverageEnd: `${year}-09-30`,
      isCurrent: true,
      eventIds: [],
      fileId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      extractionDraft: "虚构演示文件，仅用于展示保存和下载。",
      extractionStatus: "draft",
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];

  // 已确认事件带来的留痕建议（关联到事件）
  const suggestions = createSuggestions(
    requirementsForEvent(events[1]),
    materials,
    [],
  ).map((s) => ({ ...s, entryId: entry3.id }));
  // 只挂在当天记录上的留痕建议：事件还没确认，也可以先保存材料
  const entrySuggestions = createSuggestions(
    requirementsForChange(entry1.content, entry1.id, day1),
    materials,
    suggestions,
  );
  entry1.suggestionIds = entrySuggestions.map((s) => s.id);
  entry3.suggestionIds = suggestions.map((s) => s.id);
  const allSuggestions = [...suggestions, ...entrySuggestions];

  const messages: ChatMessage[] = [
    {
      id: uid(),
      conversationId: entry1.conversationId,
      dailyEntryId: entry1.id,
      role: "user",
      content: "今天老板取消了两个项目会议，我还不太清楚后续安排。",
      status: "sent",
      createdAt: stamp,
    },
    {
      id: uid(),
      conversationId: entry1.conversationId,
      dailyEntryId: entry1.id,
      role: "assistant",
      content:
        "听起来是个值得留意的变化。我先用现有信息整理了一条，要不要单独记下来？也可以先放着，之后在「今日整理」里处理。",
      candidateEventIds: [draftEventId],
      suggestionIds: entrySuggestions.map((s) => s.id),
      status: "sent",
      createdAt: stamp,
    },
    {
      id: uid(),
      conversationId: entry3.conversationId,
      dailyEntryId: entry3.id,
      role: "user",
      content: "今天被移出项目群了，想找主管了解一下情况。",
      status: "sent",
      createdAt: stamp,
    },
    {
      id: uid(),
      conversationId: entry3.conversationId,
      dailyEntryId: entry3.id,
      role: "assistant",
      content:
        "听起来是个值得留意的变化。我先用现有信息整理了一条，要不要单独记下来？也可以先放着，之后在「今日整理」里处理。",
      candidateEventIds: [confirmedEventId],
      status: "sent",
      createdAt: stamp,
    },
    {
      id: uid(),
      conversationId: entry3.conversationId,
      dailyEntryId: entry3.id,
      role: "assistant",
      content:
        "已记入回顾。下面这些材料建议已经查过你的材料库，只列出缺失的部分。",
      suggestionIds: suggestions.map((s) => s.id),
      status: "sent",
      createdAt: stamp,
    },
  ];

  return {
    ...emptyData(),
    profile: {
      id: uid(),
      employmentStatus: "在职",
      company: "青禾设计工作室（虚构）",
      role: "产品设计师",
      city: "杭州",
      startDate: dateKey(new Date(year - 1, 2, 1)),
    },
    onboarded: true,
    isDemo: true,
    entries,
    events,
    materials,
    suggestions: allSuggestions,
    messages,
  };
}
