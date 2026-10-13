import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { FileDown, Printer } from "../components/doodles";
import { useAppStore } from "../store/useAppStore";
import {
  buildReport,
  reportToMarkdown,
  rangeFor,
  type ReportData,
} from "../services/report";
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  RequireProfile,
  SectionTitle,
  useToast,
} from "../components/ui";
import { MATERIAL_TYPES, fullDate } from "../constants";
import { downloadBlob } from "../services/files";
const PRESETS = [
  { key: "30", label: "最近 30 天" },
  { key: "90", label: "最近 90 天" },
  { key: "all", label: "全部" },
  { key: "custom", label: "自定义" },
];
export default function ReportPage() {
  const toast = useToast();
  // 注意：这里必须用 useShallow。直接返回新对象会让快照每次渲染都变化，
  // 触发 React「Maximum update depth exceeded」的无限更新。
  const data = useAppStore(
    useShallow((s) => ({
      profile: s.profile,
      entries: s.entries,
      events: s.events,
      materials: s.materials,
      suggestions: s.suggestions,
      emergencies: s.emergencies,
      messages: s.messages,
      mockConfig: s.mockConfig,
    })),
  );
  const [preset, setPreset] = useState("90");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const range =
    preset === "custom"
      ? { start: start || undefined, end: end || undefined }
      : rangeFor(preset as "30" | "90" | "all");
  const invalid = preset === "custom" && !!(start && end && start > end);
  const generate = () => {
    if (invalid) {
      setError("开始日期不能晚于结束日期。");
      setReport(null);
      return;
    }
    setError("");
    setReport(buildReport(data as never, range.start, range.end));
    toast("已生成报告预览");
  };
  const markdown = useMemo(
    () => (report ? reportToMarkdown(report) : ""),
    [report],
  );
  return (
    <RequireProfile>
      <div className="page stack">
        <div className="no-print">
          <PageHeader
            title="生成结构化报告"
            subtitle="只包含你确认过的内容。未确认的草稿不会进入报告。"
            back="/review"
          />
          {error && <ErrorState message={error} onRetry={() => setError("")} />}
          <div className="card stack">
            <SectionTitle title="统计范围" />
            <div className="tabs" role="tablist">
              {PRESETS.map((item) => (
                <button
                  key={item.key}
                  role="tab"
                  aria-selected={preset === item.key}
                  className={`tab kbd-focus ${preset === item.key ? "tab-active" : ""}`}
                  onClick={() => setPreset(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="start">
                    开始日期
                  </label>
                  <input
                    id="start"
                    type="date"
                    className="input"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="end">
                    结束日期
                  </label>
                  <input
                    id="end"
                    type="date"
                    className="input"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
            {invalid && <p className="error">开始日期不能晚于结束日期。</p>}
            <div className="button-row">
              <Button variant="primary" onClick={generate}>
                预览报告
              </Button>
            </div>
          </div>
          {report && (
            <div className="card stack">
              <div className="button-row">
                <Button onClick={() => window.print()}>
                  <Printer size={16} />
                  打印 / 另存为 PDF
                </Button>
                <Button
                  onClick={() => {
                    downloadBlob(
                      new Blob([markdown], { type: "text/markdown" }),
                      `职场记录报告-${report.start || "全部"}-${report.end || "全部"}.md`,
                    );
                    toast("Markdown 已下载");
                  }}
                >
                  <FileDown size={16} />
                  下载 Markdown
                </Button>
              </div>
              <p className="small muted">打印时会自动隐藏导航与操作按钮。</p>
            </div>
          )}
        </div>
        {report && (
          <article className="stack">
            {report.events.length === 0 && (
              <EmptyState
                title="这个范围内没有已确认的事件"
                description="报告只统计你确认过的内容，草稿不会计入。"
              />
            )}
            {report.profile && (
              <section className="card stack">
                <SectionTitle title="基础工作信息" />
                <dl className="grid-2 text-sm">
                  <div>
                    <dt className="muted">工作状态</dt>
                    <dd>{report.profile.employmentStatus}</dd>
                  </div>
                  <div>
                    <dt className="muted">公司</dt>
                    <dd>{report.profile.company || "未填写"}</dd>
                  </div>
                  <div>
                    <dt className="muted">岗位</dt>
                    <dd>{report.profile.role || "未填写"}</dd>
                  </div>
                  <div>
                    <dt className="muted">入职日期</dt>
                    <dd>{report.profile.startDate || "未填写"}</dd>
                  </div>
                  <div>
                    <dt className="muted">工作城市</dt>
                    <dd>{report.profile.city || "未填写"}</dd>
                  </div>
                  <div>
                    <dt className="muted">统计范围</dt>
                    <dd>
                      {report.start || "全部"} 至 {report.end || "全部"}
                    </dd>
                  </div>
                </dl>
              </section>
            )}
            {report.events.length > 0 && (
              <section className="card stack">
                <SectionTitle title="已确认事件时间线" />
                <table className="print-table w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="th">日期</th>
                      <th className="th">标题</th>
                      <th className="th">关注程度</th>
                      <th className="th">材料数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.events.map(({ event, materials }) => (
                      <tr key={event.id}>
                        <td className="td">{fullDate(event.occurredAt)}</td>
                        <td className="td">{event.title}</td>
                        <td className="td">
                          {event.attention === "priority"
                            ? "优先处理"
                            : event.attention === "watch"
                              ? "值得关注"
                              : "普通"}
                        </td>
                        <td className="td">{materials.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            {report.events.map(({ event, materials }) => (
              <section key={event.id} className="card stack">
                <SectionTitle
                  title={event.title}
                  subtitle={fullDate(event.occurredAt)}
                />
                <dl className="grid-2 text-sm">
                  <div>
                    <dt className="muted">涉及人物</dt>
                    <dd>{event.people.join("、") || "未填写"}</dd>
                  </div>
                  <div>
                    <dt className="muted">关注程度</dt>
                    <dd>
                      {event.attention === "priority"
                        ? "优先处理"
                        : event.attention === "watch"
                          ? "值得关注"
                          : "普通"}
                    </dd>
                  </div>
                </dl>
                <p className="whitespace-pre-line text-sm">
                  {event.description}
                </p>
                {event.updates.length > 0 && (
                  <ul className="stack">
                    {event.updates.map((update) => (
                      <li key={update.id} className="small muted">
                        {update.createdAt.slice(0, 10)}：{update.content}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="small muted">
                  关联材料：{materials.map((m) => m.name).join("、") || "无"}
                </p>
              </section>
            ))}
            <section className="card stack">
              <SectionTitle title="材料清单与保存状态" />
              <div className="overflow-x-auto">
                <table className="print-table w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="th">名称</th>
                      <th className="th">类型</th>
                      <th className="th">状态</th>
                      <th className="th">覆盖范围</th>
                      <th className="th">摘要</th>
                      <th className="th">备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.materials.map((material) => (
                      <tr key={material.id}>
                        <td className="td">{material.name}</td>
                        <td className="td">{MATERIAL_TYPES[material.type]}</td>
                        <td className="td">
                          {material.status === "uploaded"
                            ? "已上传"
                            : material.status === "saved_externally"
                              ? "已自行保存（原文件未上传）"
                              : "待保存"}
                        </td>
                        <td className="td">
                          {material.coverageStart
                            ? `${fullDate(material.coverageStart)} 至 ${material.coverageEnd ? fullDate(material.coverageEnd) : "至今"}`
                            : "未填写"}
                        </td>
                        <td className="td">
                          {material.extractionStatus === "confirmed"
                            ? "摘要已确认"
                            : material.extractionStatus === "draft"
                              ? "摘要待确认（未计入事实）"
                              : "无摘要"}
                        </td>
                        <td className="td">{material.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!report.materials.length && (
                <p className="muted">所选范围内没有材料记录。</p>
              )}
            </section>
            <section className="card stack">
              <SectionTitle title="缺失材料" />
              <ul className="stack">
                {report.missing.map((item) => (
                  <li key={item.id} className="small">
                    ○ {item.title}
                    {item.coverageStart
                      ? `（${item.coverageStart} 至 ${item.coverageEnd}）`
                      : ""}
                    ：{item.reason}
                  </li>
                ))}
              </ul>
              {!report.missing.length && (
                <p className="muted">没有待处理的留痕建议。</p>
              )}
            </section>
            {report.draftsPending > 0 && (
              <p className="notice small">
                还有 {report.draftsPending} 条 AI 草稿未确认，未计入本报告。
              </p>
            )}
            <p className="small muted">
              报告生成时间：
              {new Date(report.generatedAt).toLocaleString("zh-CN")} ·
              本地演示版本，数据仅保存在当前浏览器。
            </p>
          </article>
        )}
      </div>
    </RequireProfile>
  );
}
