import { describe, expect, it } from "vitest";
import {
  buildReply,
  buildSummary,
  classifyIntent,
  isValidDateString,
  normalizeStructuredTurn,
  parsePeople,
  resolveDate,
  violatesReplyBoundaries,
  violatesTurnBoundaries,
  type AssistantContext,
  type StructuredTurn,
} from "../src/services/ai";
import { requirementsForChange } from "../src/services/materials";
import { isDiaryWorthy } from "../src/constants";
import { migrateData } from "../src/services/migrate";
import type { AppData, Material, WorkEvent } from "../src/types";

const DATE = "2026-10-12";

const material = (over: Partial<Material> = {}): Material => ({
  id: "m1",
  name: "当前有效劳动合同",
  type: "contract",
  status: "saved_externally",
  isCurrent: true,
  eventIds: [],
  extractionStatus: "none",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

const event = (over: Partial<WorkEvent> = {}): WorkEvent => ({
  id: "e1",
  title: "项目群成员变化",
  occurredAt: DATE,
  people: [],
  description: "被移出项目群",
  status: "confirmed",
  attention: "watch",
  sourceType: "chat",
  sourceId: "entry1",
  materialIds: [],
  updates: [],
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
  ...over,
});

const ctx = (over: Partial<AssistantContext> = {}): AssistantContext => ({
  date: DATE,
  entryId: "entry1",
  userText: "",
  confirmedEvents: [],
  draftTitles: [],
  materials: [],
  ...over,
});

describe("AI 是记录整理助手，不是聊天机器人", () => {
  it("用户只说累：回应情绪，不强行创建事件", () => {
    const reply = buildReply("今天累死了", ctx());
    expect(reply.candidateEvent).toBeUndefined();
    expect(reply.clarify).toBeUndefined();
    expect(reply.emergency).toBeUndefined();
    expect(reply.content).toContain("消耗");
  });

  it("描述具体变化：默认用已有信息直接整理，不再每次都追问", () => {
    const reply = buildReply("老板把我移出项目群了", ctx());
    // 关键变化：减少打扰——能整理就直接整理
    expect(reply.clarify).toBeUndefined();
    expect(reply.candidateEvent).toBeDefined();
    expect(reply.candidateEvent?.title).toBe("项目群成员变化");
    // 没提时间就默认用这一天
    expect(reply.candidateEvent?.occurredAt).toBe(DATE);
  });

  it("值得及时关注的变化会在对话里给轻量卡片，普通进展只进今日整理", () => {
    const watch = buildReply("老板把我移出项目群了", ctx());
    expect(watch.noteworthy).toBe(true);
    const normal = buildReply("今天完成项目了，还被表扬了一下", ctx());
    expect(normal.candidateEvent?.attention).toBe("normal");
    expect(normal.noteworthy).toBe(false);
  });

  it("只有时间确实说不清时才补问一句", () => {
    const vague = buildReply("前几天老板取消了两个项目会议", ctx());
    expect(vague.clarify).toBeDefined();
    expect(vague.candidateEvent).toBeUndefined();
    expect(vague.content).toMatch(/哪一天/);
  });

  it("能推断时间时直接用推断结果，不追问", () => {
    const reply = buildReply("昨天老板取消了项目会议", ctx());
    expect(reply.clarify).toBeUndefined();
    expect(reply.candidateEvent?.occurredAt).toBe("2026-10-11");
  });

  it("遇到当天签文件这类时间敏感事项：展示整理当前情况的入口", () => {
    const reply = buildReply("HR 让我今天签离职协议", ctx());
    expect(reply.emergency).toBe(true);
    expect(reply.candidateEvent).toBeUndefined();
    expect(reply.content).toContain("整理");
  });

  it("用户问该保存什么：先查库存，已有材料不重复建议", () => {
    const reply = buildReply(
      "HR 找我谈话，我要留什么？",
      ctx({ materials: [material()] }),
    );
    const types = (reply.requirements ?? []).map((r) => r.type);
    expect(types).toContain("hr");
    // 劳动合同已保存，仍然会带上要求，但由 createSuggestions 按库存过滤掉
    expect(types).toContain("contract");
    expect(reply.content).toContain("材料库");
    expect(reply.content).toContain("当前有效劳动合同");
  });

  it("描述变化时同时给出留痕建议，且建议不依赖事件", () => {
    const reply = buildReply("老板把我移出项目群了", ctx());
    const reqs = reply.requirements ?? [];
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs.every((r) => r.entryId === "entry1")).toBe(true);
    // 材料收集不以确认事件为前提：草稿还没确认，建议里也不带 eventId
    expect(reqs.every((r) => r.eventId === undefined)).toBe(true);
  });

  it("已确认事件被新消息补充：建议追加进展，而不是新建重复事件", () => {
    const reply = buildReply(
      "今天又被移出项目群了",
      ctx({ confirmedEvents: [event()] }),
    );
    expect(reply.updateSuggestionEventId).toBe("e1");
    expect(reply.candidateEvent).toBeUndefined();
    expect(reply.content).toContain("已确认");
  });

  it("同一天已存在同名草稿时不重复生成", () => {
    const reply = buildReply(
      "被移出项目群了",
      ctx({ draftTitles: ["项目群成员变化"] }),
    );
    expect(reply.candidateEvent).toBeUndefined();
    expect(reply.clarify).toBeUndefined();
    expect(reply.content).toContain("今日整理");
  });

  it("意图分类覆盖情绪 / 材料 / 紧急 / 事件 / 闲聊", () => {
    expect(classifyIntent("今天好累")).toBe("emotion");
    expect(classifyIntent("我要留什么材料？")).toBe("materials");
    expect(classifyIntent("HR 让我今天签协议")).toBe("urgent");
    expect(classifyIntent("项目群把我移出了")).toBe("event");
    expect(classifyIntent("中午吃了面")).toBe("smalltalk");
  });

  it("从原话里抽人物，并尽量推断日期", () => {
    expect(parsePeople("就按今天，涉及主管和 HR")).toEqual(["主管", "HR"]);
    expect(parsePeople("今天挺正常")).toEqual([]);
    expect(resolveDate("就按今天", DATE)).toBe(DATE);
    expect(resolveDate("昨天的事", DATE)).toBe("2026-10-11");
    expect(resolveDate("前几天的事", DATE)).toBeNull();
  });

  it("没有状态也能生成总结，且总结不包含结论性判断", () => {
    const summary = buildSummary({}, "今天正常");
    expect(summary).toContain("模拟 AI");
    expect(summary).not.toMatch(/公司违法|一定能赢|你必须辞职/);
  });

  it("只填心情也能生成总结，总结里不再出现压力与工作时长", () => {
    const summary = buildSummary({ mood: "tired" }, "");
    expect(summary).toContain("疲惫");
    expect(summary).not.toContain("压力");
    expect(summary).not.toContain("小时");
  });
});

describe("DeepSeek 输出护栏", () => {
  it("踩到产品边界的表述会被识别（含变体表达）", () => {
    expect(violatesReplyBoundaries("这家公司违法了")).toBe(true);
    expect(violatesReplyBoundaries("这明显违反劳动法")).toBe(true);
    expect(violatesReplyBoundaries("属于违法解除")).toBe(true);
    expect(violatesReplyBoundaries("你一定能赢")).toBe(true);
    expect(violatesReplyBoundaries("去申请仲裁稳赢")).toBe(true);
    expect(violatesReplyBoundaries("这种胜诉率是百分之百")).toBe(true);
    expect(violatesReplyBoundaries("这种情况你必须辞职")).toBe(true);
    expect(violatesReplyBoundaries("建议你辞职")).toBe(true);
    expect(violatesReplyBoundaries("赶紧辞职吧")).toBe(true);
  });

  it("正常平实的回复不会误判", () => {
    expect(
      violatesReplyBoundaries("听起来今天挺消耗的，我会把你说的记在这里。"),
    ).toBe(false);
    expect(
      violatesReplyBoundaries(
        "我记下了。如果愿意，可以再说得具体一点，比如发生了什么。",
      ),
    ).toBe(false);
    expect(violatesReplyBoundaries("好的，今天先到这里，明天见。")).toBe(false);
  });
});

describe("DeepSeek 结构化指令的校验", () => {
  it("合法的 JSON 会被整理成可执行的结构", () => {
    const turn = normalizeStructuredTurn(
      {
        reply: "听起来是个变化，我先替你填好了一条。",
        urgent: false,
        needTime: false,
        addToExistingTitle: null,
        event: {
          title: "被移出项目群",
          occurredAt: "2026-10-10",
          people: ["主管"],
          attention: "watch",
          description: "开会时被移出项目群",
        },
      },
      DATE,
    );
    expect(turn?.reply).toContain("填好了一条");
    expect(turn?.event?.title).toBe("被移出项目群");
    expect(turn?.event?.occurredAt).toBe("2026-10-10");
    expect(turn?.event?.people).toEqual(["主管"]);
    expect(turn?.event?.attention).toBe("watch");
  });

  it("非法字段会被清洗：未来日期置空、伪造日历日期置空、关注程度回落、人物去重去杂", () => {
    const turn = normalizeStructuredTurn(
      {
        reply: "好的",
        event: {
          title: "测试标题",
          occurredAt: "2099-01-01",
          people: ["张三", 123, " 李四 ", "张三"],
          attention: "hack",
          description: "很长的描述".repeat(300),
        },
      },
      DATE,
    );
    expect(turn?.event?.occurredAt).toBeNull();
    expect(turn?.event?.attention).toBe("watch");
    expect(turn?.event?.people).toEqual(["张三", "李四"]);
    expect((turn?.event?.description ?? "").length).toBeLessThanOrEqual(500);

    // 红队检测：形如 YYYY-MM-DD 但实际不存在的日期（如 2 月 31 日）必须被拦截
    expect(isValidDateString("2026-02-31")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-00-10")).toBe(false);
    expect(isValidDateString("2026-10-10")).toBe(true);
    const fakeDateTurn = normalizeStructuredTurn(
      {
        reply: "好的",
        event: {
          title: "伪造日期测试",
          occurredAt: "2026-02-31",
          people: [],
          attention: "watch",
          description: "测试",
        },
      },
      DATE,
    );
    expect(fakeDateTurn?.event?.occurredAt).toBeNull();
  });

  it("缺少必要字段或传入数组时返回 null，交由本地规则兜底", () => {
    expect(normalizeStructuredTurn(null, DATE)).toBeNull();
    expect(normalizeStructuredTurn("不是我", DATE)).toBeNull();
    expect(normalizeStructuredTurn([1, 2, 3], DATE)).toBeNull();
    expect(normalizeStructuredTurn({}, DATE)).toBeNull();
    expect(normalizeStructuredTurn({ event: { title: "" } }, DATE)).toBeNull();
  });
});

describe("留痕建议可以脱离事件存在", () => {
  it("从当天记录直接推导建议，并带上 entryId", () => {
    const reqs = requirementsForChange(
      "今天老板取消了我两个项目会议",
      "entry1",
      DATE,
    );
    expect(reqs.some((r) => r.type === "meeting")).toBe(true);
    expect(reqs.every((r) => r.entryId === "entry1")).toBe(true);
    expect(reqs.every((r) => r.eventId === undefined)).toBe(true);
  });

  it("时间敏感的事项标记为建议优先保存", () => {
    const reqs = requirementsForChange("HR 要求我今天签协议", "entry1", DATE);
    expect(reqs.some((r) => r.priority)).toBe(true);
  });

  it("工资类材料只建议当月缺失的时间段", () => {
    const reqs = requirementsForChange("这个月工资好像没发", "entry1", DATE);
    const salary = reqs.find((r) => r.type === "salary");
    expect(salary?.coverageStart).toBe("2026-10-01");
    expect(salary?.coverageEnd).toBe("2026-10-31");
  });

  it("普通工作日不产生任何收集任务", () => {
    expect(requirementsForChange("今天挺正常的", "entry1", DATE)).toEqual([]);
  });
});

describe("数据迁移", () => {
  it("v1 数据补齐每日记录的 conversationId / eventIds / suggestionIds", () => {
    const legacy = {
      onboarded: true,
      entries: [{ id: "entry1", date: DATE, content: "旧日记", tags: [] }],
      events: [
        { id: "e1", sourceId: "entry1", title: "旧事件" },
        { id: "e2", sourceId: "other", title: "别的事件" },
      ],
      suggestions: [{ id: "s1", eventId: "e1", title: "旧建议" }],
      messages: [
        {
          id: "msg1",
          role: "user",
          content: "旧消息",
          conversationId: "default",
        },
      ],
    } as unknown as Partial<AppData>;

    const data = migrateData(legacy);
    expect(data.entries[0].conversationId).toBe(`conv-${DATE}`);
    expect(data.entries[0].eventIds).toEqual(["e1"]);
    expect(data.entries[0].suggestionIds).toEqual(["s1"]);
    // 旧消息挂到对应日期的记录上，并补上状态
    expect(data.messages[0].dailyEntryId).toBe("entry1");
    expect(data.messages[0].status).toBe("sent");
    // 未提供的新字段回落到默认值
    expect(data.materials).toEqual([]);
    expect(data.mockConfig.delayMs).toBeGreaterThan(0);
  });

  it("v2 数据补齐留痕建议的 entryId，让建议能挂在某一天上", () => {
    const legacy = {
      onboarded: true,
      entries: [
        {
          id: "entry1",
          date: DATE,
          content: "旧日记",
          tags: [],
          conversationId: `conv-${DATE}`,
          eventIds: [],
          suggestionIds: ["s1"],
        },
      ],
      // 没有 eventId、也没有 entryId 的老建议
      suggestions: [{ id: "s1", type: "notice", title: "待签文件" }],
      messages: [],
    } as unknown as Partial<AppData>;

    const data = migrateData(legacy);
    expect(data.suggestions[0].entryId).toBe("entry1");
  });

  it("空数据不会抛错", () => {
    expect(migrateData(undefined).entries).toEqual([]);
    expect(migrateData({}).messages).toEqual([]);
    expect(migrateData({}).suggestions).toEqual([]);
  });

  it("误用的旧默认模型名会被纠正为接口支持的模型", () => {
    const data = migrateData({
      ai: {
        apiKey: "sk-test",
        model: "deepseek-v4.1-flash",
        baseUrl: "https://api.deepseek.com",
        status: "error",
        lastError: "HTTP 400",
      },
    });
    expect(data.ai.model).toBe("deepseek-flash");
    // 旧错误来自模型名本身，纠正后重置为未检测，避免误显示红灯
    expect(data.ai.status).toBe("unset");
    expect(data.ai.lastError).toBeUndefined();
    // 用户自己填的其他模型不会被改动
    const custom = migrateData({
      ai: {
        apiKey: "sk-test",
        model: "deepseek-v4-pro",
        baseUrl: "https://api.deepseek.com",
        status: "ok",
      },
    });
    expect(custom.ai.model).toBe("deepseek-v4-pro");
    expect(custom.ai.status).toBe("ok");
  });
});

describe("输出护栏覆盖事件标题与描述", () => {
  const turn = (over: Partial<StructuredTurn> = {}): StructuredTurn => ({
    reply: "我先用现有信息整理了一条，你可以先放着。",
    urgent: false,
    needTime: false,
    addToExistingTitle: null,
    event: {
      title: "会议安排变化",
      occurredAt: "2026-10-12",
      people: [],
      attention: "watch",
      description: "两个项目会议取消了",
    },
    ...over,
  });

  it("回复里出现越界表述会被拦下", () => {
    expect(violatesTurnBoundaries(turn({ reply: "公司违法，你一定能赢" }))).toBe(
      true,
    );
  });

  it("越界表述藏在事件标题里同样会被拦下", () => {
    expect(
      violatesTurnBoundaries(
        turn({
          event: { ...turn().event!, title: "公司违法" },
        }),
      ),
    ).toBe(true);
  });

  it("越界表述藏在事件描述里同样会被拦下", () => {
    expect(
      violatesTurnBoundaries(
        turn({
          event: { ...turn().event!, description: "建议你辞职" },
        }),
      ),
    ).toBe(true);
  });

  it("正常输出不会被误判，事件为空也不会报错", () => {
    expect(violatesTurnBoundaries(turn())).toBe(false);
    expect(violatesTurnBoundaries(turn({ event: null }))).toBe(false);
  });
});

describe("寒暄不进日记原文", () => {
  it("纯寒暄、测试、只对助手的提问都判为不值得记录", () => {
    for (const text of [
      "你好",
      "您好！",
      "你好…",
      "哈喽",
      "在吗",
      "你是谁",
      "你是谁啊？",
      "你能做什么",
      "测试",
      "test",
      "Hello!",
      "谢谢",
      "好的",
      "嗯",
      "  ok  ",
    ]) {
      expect(isDiaryWorthy(text), text).toBe(false);
    }
  });

  it("用户自己的状态与事情照常记录", () => {
    for (const text of [
      "今天挺正常",
      "工作有点累",
      "今天被主管批评了",
      "这个月工资还没发",
      "今天被移出项目群了",
    ]) {
      expect(isDiaryWorthy(text), text).toBe(true);
    }
  });

  it("寒暄里夹带具体内容时，仍然照常记录（不误伤）", () => {
    for (const text of [
      "你好，今天被移出项目群了",
      "在吗？我想记一下今天的会议取消了",
      "你是谁？今天主管找我谈话了",
    ]) {
      expect(isDiaryWorthy(text), text).toBe(true);
    }
  });

  it("空内容不记录", () => {
    expect(isDiaryWorthy("")).toBe(false);
    expect(isDiaryWorthy("   ")).toBe(false);
  });
});
