import type {
  AppData,
  Material,
  WorkEvent,
  MaterialSuggestion,
} from "../types";
import { addDays, dateKey } from "../constants";
export interface ReportEvent {
  event: WorkEvent;
  materials: Material[];
}
export interface ReportData {
  generatedAt: string;
  start?: string;
  end?: string;
  profile: AppData["profile"];
  events: ReportEvent[];
  materials: Material[];
  missing: MaterialSuggestion[];
  draftsPending: number;
}
const overlap = (m: Material, start: string, end: string) => {
  if (!start || !end) return true;
  if (!m.coverageStart)
    return (
      (m.createdAt || "").slice(0, 10) >= start &&
      (m.createdAt || "").slice(0, 10) <= end
    );
  const s = m.coverageStart;
  const e = m.coverageEnd || dateKey(new Date());
  return s <= end && e >= start;
};
export function buildReport(
  data: AppData,
  start?: string,
  end?: string,
): ReportData {
  const events = data.events
    .filter((e) => e.status === "confirmed")
    .filter((e) => {
      const day = e.occurredAt.slice(0, 10);
      return (!start || day >= start) && (!end || day <= end);
    })
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const ids = new Set(events.map((e) => e.id));
  const linked = data.materials.filter((m) =>
    m.eventIds.some((id) => ids.has(id)),
  );
  const extra = data.materials.filter(
    (m) =>
      !linked.includes(m) &&
      (m.status === "uploaded" || m.status === "saved_externally") &&
      overlap(m, start || "", end || ""),
  );
  const materials = [...linked, ...extra];
  const missing = data.suggestions
    .filter((s) => s.status === "pending" || s.status === "deferred")
    .filter((s) => !s.eventId || ids.has(s.eventId));
  return {
    generatedAt: new Date().toISOString(),
    start,
    end,
    profile: data.profile,
    events: events.map((event) => ({
      event,
      materials: data.materials.filter((m) => m.eventIds.includes(event.id)),
    })),
    materials,
    missing,
    draftsPending: data.events.filter((e) => e.status === "draft").length,
  };
}
const esc = (value: string) =>
  value.replaceAll("|", "\\|").replaceAll("\n", " ");
const row = (cells: string[]) => `| ${cells.map(esc).join(" | ")} |`;
export function reportToMarkdown(report: ReportData): string {
  const lines: string[] = [];
  lines.push(`# 职场记录报告（演示版）`);
  lines.push("");
  lines.push(
    `生成时间：${new Date(report.generatedAt).toLocaleString("zh-CN")}`,
  );
  lines.push(`统计范围：${report.start || "全部"} 至 ${report.end || "全部"}`);
  lines.push("");
  lines.push(
    "> 本报告只包含你已确认的事件。未确认的 AI 草稿不会作为事实进入报告；已自行保存的材料标记为“原文件未上传”。",
  );
  lines.push("");
  if (report.profile) {
    lines.push("## 基础工作信息");
    lines.push("");
    lines.push(row(["项目", "内容"]));
    lines.push("| --- | --- |");
    lines.push(row(["工作状态", report.profile.employmentStatus]));
    lines.push(row(["公司", report.profile.company || "未填写"]));
    lines.push(row(["岗位", report.profile.role || "未填写"]));
    lines.push(row(["入职日期", report.profile.startDate || "未填写"]));
    lines.push(row(["工作城市", report.profile.city || "未填写"]));
    lines.push("");
  }
  lines.push("## 已确认事件时间线");
  lines.push("");
  if (!report.events.length) lines.push("（所选范围内没有已确认的事件。）");
  else {
    lines.push(row(["日期", "标题", "关注程度", "材料数"]));
    lines.push("| --- | --- | --- | --- |");
    for (const { event, materials } of report.events)
      lines.push(
        row([
          event.occurredAt.slice(0, 10),
          event.title,
          event.attention === "priority"
            ? "优先处理"
            : event.attention === "watch"
              ? "值得关注"
              : "普通",
          String(materials.length),
        ]),
      );
  }
  lines.push("");
  lines.push("## 已确认事件详情");
  lines.push("");
  for (const { event, materials } of report.events) {
    lines.push(`### ${event.title}`);
    lines.push("");
    lines.push(`- 发生时间：${event.occurredAt.slice(0, 10)}`);
    lines.push(`- 涉及人物：${event.people.join("、") || "未填写"}`);
    lines.push(
      `- 关注程度：${event.attention === "priority" ? "优先处理" : event.attention === "watch" ? "值得关注" : "普通"}`,
    );
    lines.push(`- 事件描述：${esc(event.description)}`);
    if (event.updates.length) {
      lines.push(`- 后续进展：`);
      for (const update of event.updates)
        lines.push(
          `  - ${update.createdAt.slice(0, 10)}：${esc(update.content)}`,
        );
    }
    lines.push(
      `- 关联材料：${materials.map((m) => esc(m.name)).join("、") || "无"}`,
    );
    lines.push("");
  }
  lines.push("## 材料清单");
  lines.push("");
  if (!report.materials.length) lines.push("（所选范围内没有材料。）");
  else {
    lines.push(row(["名称", "类型", "状态", "覆盖范围", "摘要状态"]));
    lines.push("| --- | --- | --- | --- | --- |");
    for (const material of report.materials)
      lines.push(
        row([
          material.name,
          material.type,
          material.status === "uploaded"
            ? "已上传"
            : material.status === "saved_externally"
              ? "已自行保存（原文件未上传）"
              : "待保存",
          material.coverageStart
            ? `${material.coverageStart} 至 ${material.coverageEnd || "至今"}`
            : "未填写",
          material.extractionStatus === "confirmed"
            ? "摘要已确认"
            : material.extractionStatus === "draft"
              ? "摘要待确认"
              : "无摘要",
        ]),
      );
  }
  lines.push("");
  lines.push("## 缺失材料");
  lines.push("");
  if (!report.missing.length) lines.push("（没有待处理的留痕建议。）");
  else {
    for (const item of report.missing)
      lines.push(
        `- ${item.title}${item.coverageStart ? `（${item.coverageStart} 至 ${item.coverageEnd}）` : ""}：${item.reason}`,
      );
  }
  lines.push("");
  lines.push("## 用户备注");
  lines.push("");
  const notes = report.materials.filter((m) => m.note);
  if (!notes.length) lines.push("（没有备注。）");
  else
    for (const material of notes)
      lines.push(`- ${esc(material.name)}：${esc(material.note || "")}`);
  lines.push("");
  if (report.draftsPending)
    lines.push(
      `> 还有 ${report.draftsPending} 条 AI 草稿未确认，未计入本报告。`,
    );
  return lines.join("\n");
}
export const rangeFor = (preset: "30" | "90" | "all") => {
  if (preset === "all") return { start: undefined, end: undefined };
  const end = dateKey(new Date());
  return { start: addDays(end, preset === "30" ? -30 : -90), end };
};
