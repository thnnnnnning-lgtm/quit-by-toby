import type {
  Material,
  MaterialSuggestion,
  MaterialType,
  WorkEvent,
} from "../types";
import { addDays, monthRange, now, uid } from "../constants";
export interface MaterialRequirement {
  type: MaterialType;
  title: string;
  reason: string;
  eventId?: string;
  /** 建议来源的那一天。材料收集不以确认事件为前提，所以这里可以独立存在。 */
  entryId?: string;
  coverageStart?: string;
  coverageEnd?: string;
  currentOnly?: boolean;
  /** 时间敏感：界面上突出显示，建议优先保存 */
  priority?: boolean;
}
const eventScoped = new Set<MaterialType>([
  "hr",
  "meeting",
  "project",
  "notice",
  "performance",
  "other",
]);
export const isSaved = (m: Material) =>
  m.status === "uploaded" || m.status === "saved_externally";
export function matchingMaterials(
  req: MaterialRequirement,
  materials: Material[],
) {
  return materials.filter(
    (m) =>
      isSaved(m) &&
      m.type === req.type &&
      m.isCurrent &&
      (!req.eventId ||
        !eventScoped.has(req.type) ||
        m.eventIds.includes(req.eventId)),
  );
}
/** Returns the uncovered portions of a requested inclusive date interval (union coverage). */
export function missingRanges(
  start: string,
  end: string,
  materials: Material[],
) {
  let cursor = start;
  const gaps: { start: string; end: string }[] = [];
  const ranges = materials
    .filter((m) => m.coverageStart && m.coverageEnd)
    .map((m) => ({ start: m.coverageStart!, end: m.coverageEnd! }))
    .sort((a, b) => a.start.localeCompare(b.start));
  for (const r of ranges) {
    if (r.end < cursor || r.start > end) continue;
    if (r.start > cursor)
      gaps.push({ start: cursor, end: addDays(r.start, -1) });
    if (r.end >= cursor) cursor = addDays(r.end, 1);
    if (cursor > end) break;
  }
  if (cursor <= end) gaps.push({ start: cursor, end });
  return gaps;
}
export function requirementSatisfied(
  req: MaterialRequirement,
  materials: Material[],
) {
  const matches = matchingMaterials(req, materials);
  return req.coverageStart && req.coverageEnd
    ? missingRanges(req.coverageStart, req.coverageEnd, matches).length === 0
    : matches.length > 0;
}
const sameKey = (a: MaterialRequirement, b: MaterialSuggestion) =>
  a.type === b.type &&
  a.eventId === b.eventId &&
  a.entryId === b.entryId &&
  a.coverageStart === b.coverageStart &&
  a.coverageEnd === b.coverageEnd &&
  a.title === b.title;
export function createSuggestions(
  requirements: MaterialRequirement[],
  materials: Material[],
  existing: MaterialSuggestion[],
): MaterialSuggestion[] {
  const added: MaterialSuggestion[] = [];
  for (const req of requirements) {
    if (requirementSatisfied(req, materials)) continue;
    const gaps =
      req.coverageStart && req.coverageEnd
        ? missingRanges(
            req.coverageStart,
            req.coverageEnd,
            matchingMaterials(req, materials),
          )
        : [null];
    for (const gap of gaps) {
      const r = {
        ...req,
        ...(gap ? { coverageStart: gap.start, coverageEnd: gap.end } : {}),
      };
      if ([...existing, ...added].some((s) => sameKey(r, s))) continue;
      added.push({
        id: uid(),
        type: r.type,
        title: r.title,
        reason: r.reason,
        eventId: r.eventId,
        entryId: r.entryId,
        coverageStart: r.coverageStart,
        coverageEnd: r.coverageEnd,
        priority: r.priority,
        status: "pending",
        createdAt: now(),
      });
    }
  }
  return added;
}
export function reconcileSuggestions(
  suggestions: MaterialSuggestion[],
  materials: Material[],
): MaterialSuggestion[] {
  return suggestions.map((s) => {
    if (s.status === "not_needed") return s;
    const satisfied = requirementSatisfied(s, materials);
    if (satisfied)
      return {
        ...s,
        status: "completed" as const,
        resolvedMaterialId: matchingMaterials(s, materials)[0]?.id,
      };
    if (s.status === "completed")
      return {
        ...s,
        status: "pending" as const,
        resolvedMaterialId: undefined,
      };
    return s;
  });
}
export function requirementsForEvent(event: WorkEvent): MaterialRequirement[] {
  const txt = `${event.title} ${event.description}`;
  const base = {
    eventId: event.id,
    reason: "与这次已确认事件相关，建议保留原始材料，方便日后回顾。",
  };
  const list: MaterialRequirement[] = [];
  if (/会议|取消/.test(txt))
    list.push({ ...base, type: "meeting", title: "会议变化通知" });
  if (/移出|项目群|群聊/.test(txt))
    list.push(
      { ...base, type: "project", title: "群聊变化记录" },
      { ...base, type: "hr", title: "主管沟通记录" },
    );
  if (/HR|人事|离职|协议|签署|签文件|解除/.test(txt))
    list.push(
      {
        ...base,
        type: "contract",
        eventId: undefined,
        title: "当前有效劳动合同",
      },
      { ...base, type: "hr", title: "本次 HR 沟通" },
    );
  if (/协议|签署|签文件/.test(txt))
    list.push(
      { ...base, type: "notice", title: "离职协议或待签文件" },
      { ...base, type: "other", title: "当前系统权限状态" },
    );
  if (/工资|薪资|协议|离职/.test(txt)) {
    const range = monthRange(event.occurredAt);
    list.push({
      ...base,
      eventId: undefined,
      type: "salary",
      title: `${Number(event.occurredAt.slice(5, 7))} 月工资记录`,
      coverageStart: range.start,
      coverageEnd: range.end,
      reason: "只补充本月缺失范围，不重复收集已覆盖月份。",
    });
  }
  if (/调岗|停职/.test(txt))
    list.push(
      { ...base, type: "notice", title: "岗位变化书面通知" },
      { ...base, type: "jd", eventId: undefined, title: "当前岗位说明" },
    );
  if (/权限|账号/.test(txt) && !list.some((r) => r.type === "other"))
    list.push({ ...base, type: "other", title: "当前系统权限状态" });
  if (/加班/.test(txt)) {
    list.push({
      ...base,
      eventId: undefined,
      type: "attendance",
      title: "当日考勤记录",
      coverageStart: event.occurredAt.slice(0, 10),
      coverageEnd: event.occurredAt.slice(0, 10),
    });
  }
  return list;
}
export const pendingSuggestions = (suggestions: MaterialSuggestion[]) =>
  suggestions.filter((s) => s.status === "pending" || s.status === "deferred");

/**
 * 从「当天记录的内容」直接推导留痕建议——**不需要先确认事件**。
 * 材料可以先挂在当天的每日记录上，等事件确认后再补事件关联。
 * 判断依据是当天的用户原文（含本条），所以同一天继续聊天时只会更新、不重复创建。
 */
export function requirementsForChange(
  text: string,
  entryId: string,
  date: string,
): MaterialRequirement[] {
  const base = {
    entryId,
    reason: "与今天记录的情况相关，建议保留原始材料，方便以后回顾。",
  };
  const list: MaterialRequirement[] = [];
  const timeSensitive = /今天签|当天签|立即|马上|今天就|要求今天|被通知解除/.test(
    text,
  );
  if (/会议|取消/.test(text))
    list.push({ ...base, type: "meeting", title: "会议变更通知" });
  if (/移出|项目群|群聊/.test(text))
    list.push(
      { ...base, type: "project", title: "群聊变化记录" },
      { ...base, type: "hr", title: "主管沟通记录" },
    );
  if (/HR|人事|谈话|沟通/.test(text) && !list.some((r) => r.type === "hr"))
    list.push({ ...base, type: "hr", title: "本次沟通记录" });
  if (/协议|签文件|签署/.test(text))
    list.push({
      ...base,
      type: "notice",
      title: "待签署文件或通知",
      priority: timeSensitive,
    });
  if (/解除|辞退/.test(text))
    list.push({
      ...base,
      type: "notice",
      title: "书面解除通知",
      priority: true,
    });
  if (/调岗|停职/.test(text))
    list.push({ ...base, type: "notice", title: "岗位变化书面通知" });
  if (/工资|薪资|欠薪|没发/.test(text)) {
    const range = monthRange(date);
    list.push({
      ...base,
      type: "salary",
      title: `${Number(date.slice(5, 7))} 月工资记录`,
      coverageStart: range.start,
      coverageEnd: range.end,
      reason: "只补充本月缺失的时间段，已经覆盖的月份不会重复收集。",
    });
  }
  if (/考勤|打卡|加班/.test(text))
    list.push({
      ...base,
      type: "attendance",
      title: "当日考勤记录",
      coverageStart: date.slice(0, 10),
      coverageEnd: date.slice(0, 10),
      reason: "考勤类材料按天补充，只建议缺失的那一天。",
    });
  if (/权限|账号|门禁/.test(text))
    list.push({
      ...base,
      type: "other",
      title: "当前系统权限状态",
      priority: timeSensitive,
    });
  return list;
}

/** 今天是否需要留痕：没有任何具体要求时返回 false，界面显示「今天暂无特别需要补充的材料」 */
export const hasPendingWork = (suggestions: MaterialSuggestion[]) =>
  pendingSuggestions(suggestions).length > 0;

/**
 * 新上传材料时按类型自动预填名称与覆盖日期，减少要填的东西。
 * 只作为默认值，用户随时可以改。
 */
export function materialAutofill(
  type: MaterialType,
  date: string,
): Partial<
  Pick<Material, "name" | "coverageStart" | "coverageEnd" | "isCurrent">
> {
  switch (type) {
    case "salary": {
      const range = monthRange(date);
      return {
        name: `${Number(date.slice(5, 7))} 月工资记录`,
        coverageStart: range.start,
        coverageEnd: range.end,
        isCurrent: true,
      };
    }
    case "attendance":
      return {
        name: `${date.replaceAll("-", ".")} 考勤记录`,
        coverageStart: date,
        coverageEnd: date,
        isCurrent: true,
      };
    case "contract":
      return { name: "当前有效劳动合同", isCurrent: true };
    case "offer":
      return { name: "入职 Offer", isCurrent: true };
    case "jd":
      return { name: "岗位说明 / JD", isCurrent: true };
    default:
      return {};
  }
}

/**
 * 本月工资记录是否还没保存（用于「每月提醒补充工资」）。
 * 已有覆盖本月、仍然有效的工资类材料时返回 false。
 */
export function monthlySalaryMissing(materials: Material[], date: string) {
  const range = monthRange(date);
  const salary = materials.filter(
    (m) => m.type === "salary" && isSaved(m) && m.isCurrent,
  );
  return missingRanges(range.start, range.end, salary).length > 0;
}
