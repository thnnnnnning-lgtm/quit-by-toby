import { describe, expect, it } from "vitest";
import {
  createSuggestions,
  materialAutofill,
  matchingMaterials,
  missingRanges,
  monthlySalaryMissing,
  reconcileSuggestions,
  requirementSatisfied,
  requirementsForEvent,
  type MaterialRequirement,
} from "../src/services/materials";
import {
  buildReport,
  reportToMarkdown,
  rangeFor,
} from "../src/services/report";
import { emptyData } from "../src/services/demo";
import type { AppData, Material, WorkEvent } from "../src/types";

const material = (
  patch: Partial<Material> & { id: string; type: Material["type"] },
): Material => ({
  id: patch.id,
  name: patch.name ?? patch.id,
  type: patch.type,
  status: patch.status ?? "saved_externally",
  isCurrent: patch.isCurrent ?? true,
  eventIds: patch.eventIds ?? [],
  extractionStatus: patch.extractionStatus ?? "none",
  coverageStart: patch.coverageStart,
  coverageEnd: patch.coverageEnd,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const event = (patch: Partial<WorkEvent> & { id: string }): WorkEvent => ({
  id: patch.id,
  title: patch.title ?? "事件",
  occurredAt: patch.occurredAt ?? "2026-10-10",
  people: patch.people ?? [],
  description: patch.description ?? "",
  status: patch.status ?? "confirmed",
  attention: patch.attention ?? "watch",
  sourceType: patch.sourceType ?? "manual",
  sourceId: patch.sourceId,
  materialIds: [],
  updates: [],
  createdAt: "2026-10-10T00:00:00.000Z",
  updatedAt: "2026-10-10T00:00:00.000Z",
});

describe("材料去重规则", () => {
  it("已保存的当前有效劳动合同不再生成待办", () => {
    const materials = [material({ id: "m1", type: "contract" })];
    const req: MaterialRequirement[] = [
      { type: "contract", title: "当前有效劳动合同", reason: "确认劳动关系" },
    ];
    expect(requirementSatisfied(req[0], materials)).toBe(true);
    expect(createSuggestions(req, materials, [])).toHaveLength(0);
  });

  it("7-9 月工资已有，需要 10 月时只建议补充 10 月", () => {
    const materials = [
      material({
        id: "m1",
        type: "salary",
        coverageStart: "2026-07-01",
        coverageEnd: "2026-09-30",
      }),
    ];
    const req: MaterialRequirement[] = [
      {
        type: "salary",
        title: "10 月工资记录",
        coverageStart: "2026-07-01",
        coverageEnd: "2026-10-31",
        reason: "核对发放",
      },
    ];
    const gaps = missingRanges(
      "2026-07-01",
      "2026-10-31",
      matchingMaterials(req[0], materials),
    );
    expect(gaps).toEqual([{ start: "2026-10-01", end: "2026-10-31" }]);
    const created = createSuggestions(req, materials, []);
    expect(created).toHaveLength(1);
    expect(created[0].coverageStart).toBe("2026-10-01");
  });

  it("同一事件的 HR 沟通已存在时不重复创建", () => {
    const materials = [material({ id: "m1", type: "hr", eventIds: ["e1"] })];
    const req: MaterialRequirement[] = [
      {
        type: "hr",
        title: "本次 HR 沟通",
        eventId: "e1",
        reason: "保留沟通记录",
      },
    ];
    expect(createSuggestions(req, materials, [])).toHaveLength(0);
  });

  it("不同事件的 HR 沟通不会因为类型相同被错误去重", () => {
    const materials = [material({ id: "m1", type: "hr", eventIds: ["e1"] })];
    const req: MaterialRequirement[] = [
      {
        type: "hr",
        title: "本次 HR 沟通",
        eventId: "e2",
        reason: "保留沟通记录",
      },
    ];
    expect(createSuggestions(req, materials, [])).toHaveLength(1);
  });

  it("已自行保存也算已有材料", () => {
    const materials = [
      material({ id: "m1", type: "contract", status: "saved_externally" }),
    ];
    const req: MaterialRequirement[] = [
      { type: "contract", title: "劳动合同", reason: "" },
    ];
    expect(requirementSatisfied(req[0], materials)).toBe(true);
  });

  it("处理建议后不会产生重复或矛盾的待办", () => {
    const req: MaterialRequirement[] = [
      { type: "notice", title: "离职协议文件", reason: "" },
    ];
    const first = createSuggestions(req, [], []);
    const again = createSuggestions(req, [], first);
    expect(again).toHaveLength(0);
  });

  it("事件材料建议按事件内容生成", () => {
    const list = requirementsForEvent(
      event({
        id: "e1",
        title: "被移出项目群",
        description: "今天被移出项目群",
      }),
    );
    expect(list.some((r) => r.type === "project")).toBe(true);
    expect(list.some((r) => r.type === "hr")).toBe(true);
  });

  it("库存补齐后待办自动标记为已完成，撤掉材料后回到待处理", () => {
    const req: MaterialRequirement[] = [
      { type: "contract", title: "劳动合同", reason: "" },
    ];
    const created = createSuggestions(req, [], []);
    expect(created[0].status).toBe("pending");
    const done = reconcileSuggestions(created, [
      material({ id: "m1", type: "contract" }),
    ]);
    expect(done[0].status).toBe("completed");
    const back = reconcileSuggestions(done, []);
    expect(back[0].status).toBe("pending");
  });
});

describe("报告规则", () => {
  const base: AppData = {
    ...emptyData(),
    profile: { id: "p1", employmentStatus: "在职", company: "示例公司" },
    events: [
      event({
        id: "e1",
        title: "被移出项目群",
        occurredAt: "2026-10-01",
        status: "confirmed",
      }),
      event({
        id: "e2",
        title: "会议安排变化",
        occurredAt: "2026-10-05",
        status: "draft",
      }),
      event({
        id: "e3",
        title: "更早的事件",
        occurredAt: "2026-06-01",
        status: "confirmed",
      }),
    ],
    materials: [material({ id: "m1", type: "contract", eventIds: ["e1"] })],
    suggestions: [
      {
        id: "s1",
        type: "notice",
        title: "离职协议",
        reason: "示例",
        status: "pending",
        createdAt: "2026-10-06T00:00:00.000Z",
      },
    ],
  };

  it("未确认草稿不会进入报告", () => {
    const report = buildReport(base);
    expect(report.events.map((r) => r.event.id)).toEqual(["e3", "e1"]);
    expect(report.draftsPending).toBe(1);
  });

  it("日期范围筛选真实生效", () => {
    const all = buildReport(base);
    expect(all.events).toHaveLength(2);
    const recent = buildReport(base, "2026-09-01", "2026-10-31");
    expect(recent.events.map((r) => r.event.id)).toEqual(["e1"]);
    const range = buildReport(
      base,
      ...(["2026-09-01", "2026-10-31"] as [string, string]),
    );
    expect(range.events).toHaveLength(1);
    const preset = rangeFor("30");
    expect(preset.start! < preset.end!).toBe(true);
  });

  it("已自行保存的材料标记为原文件未上传", () => {
    const data: AppData = {
      ...base,
      materials: [
        material({
          id: "m1",
          type: "contract",
          status: "saved_externally",
          eventIds: ["e1"],
        }),
      ],
    };
    const markdown = reportToMarkdown(buildReport(data));
    expect(markdown).toContain("原文件未上传");
  });

  it("未确认摘要不作为事实输出", () => {
    const data: AppData = {
      ...base,
      materials: [
        material({
          id: "m1",
          type: "contract",
          status: "uploaded",
          extractionStatus: "draft",
          extractionDraft: "这是待确认草稿",
          eventIds: ["e1"],
        }),
      ],
    };
    const markdown = reportToMarkdown(buildReport(data));
    expect(markdown).not.toContain("这是待确认草稿");
    expect(markdown).toContain("摘要待确认");
  });
});

describe("材料自动预填与每月工资提醒", () => {
  const DATE = "2026-10-12";

  it("工资类材料自动预填当月名称与覆盖范围", () => {
    const auto = materialAutofill("salary", DATE);
    expect(auto.name).toBe("10 月工资记录");
    expect(auto.coverageStart).toBe("2026-10-01");
    expect(auto.coverageEnd).toBe("2026-10-31");
    expect(auto.isCurrent).toBe(true);
  });

  it("考勤类材料自动预填当天", () => {
    const auto = materialAutofill("attendance", DATE);
    expect(auto.name).toBe("2026.10.12 考勤记录");
    expect(auto.coverageStart).toBe(DATE);
    expect(auto.coverageEnd).toBe(DATE);
  });

  it("合同 / Offer / 岗位说明自动带上名称，不填覆盖日期", () => {
    expect(materialAutofill("contract", DATE).name).toBe("当前有效劳动合同");
    expect(materialAutofill("offer", DATE).name).toBe("入职 Offer");
    expect(materialAutofill("jd", DATE).coverageStart).toBeUndefined();
  });

  it("其他类型不做任何预填", () => {
    expect(materialAutofill("other", DATE)).toEqual({});
  });

  it("本月工资缺失时提醒，保存覆盖本月的工资记录后不再提醒", () => {
    const nothing = monthlySalaryMissing([], DATE);
    expect(nothing).toBe(true);

    const covered = monthlySalaryMissing(
      [
        material({
          id: "s1",
          type: "salary",
          status: "uploaded",
          coverageStart: "2026-10-01",
          coverageEnd: "2026-10-31",
        }),
      ],
      DATE,
    );
    expect(covered).toBe(false);

    // 只覆盖了 9 月，仍然要提醒
    const stale = monthlySalaryMissing(
      [
        material({
          id: "s2",
          type: "salary",
          status: "uploaded",
          coverageStart: "2026-09-01",
          coverageEnd: "2026-09-30",
        }),
      ],
      DATE,
    );
    expect(stale).toBe(true);
  });
});
