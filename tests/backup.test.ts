import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  buildBackup,
  parseBackup,
} from "../src/services/backup";
import { emptyData } from "../src/services/demo";
import type { AppData } from "../src/types";

const SECRET = "sk-secret-should-never-be-exported";

const state = (): AppData => ({
  ...emptyData(),
  onboarded: true,
  ai: {
    apiKey: SECRET,
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    status: "ok",
  },
});

describe("导出备份不泄露 API Key", () => {
  it("导出内容里既没有密钥也没有 ai 字段", () => {
    const backup = buildBackup(state());
    const text = JSON.stringify(backup);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("apiKey");
    expect((backup as unknown as Record<string, unknown>).ai).toBeUndefined();
    // 连用户的模型名、接口地址也不该顺带带出去
    expect(text).not.toContain("api.deepseek.com");
  });

  it("仍然完整带上用户自己的记录数据", () => {
    const backup = buildBackup(state());
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.data.onboarded).toBe(true);
    expect(Array.isArray(backup.data.entries)).toBe(true);
    expect(Array.isArray(backup.data.events)).toBe(true);
    expect(Array.isArray(backup.data.materials)).toBe(true);
    expect(typeof backup.data.checkInHour).toBe("number");
  });
});

describe("导入备份", () => {
  it("能读回新格式备份并补齐默认值", () => {
    const parsed = parseBackup(JSON.stringify(buildBackup(state())));
    expect(parsed.onboarded).toBe(true);
    expect(parsed.profile).toBeNull();
    expect(parsed.entries).toEqual([]);
  });

  it("兼容旧版本直接导出的平铺对象", () => {
    // 旧实现把整个 store 展开导出，就是这种没有 format/data 包裹的形状
    const legacy = { ...state() };
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.onboarded).toBe(true);
  });

  it("非法 JSON 会被拒绝，并给出可读提示", () => {
    expect(() => parseBackup("这不是 json")).toThrow(/JSON/);
  });

  it("结构对不上的 JSON 会被拒绝，不会写坏数据", () => {
    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow();
    expect(() => parseBackup(JSON.stringify([1, 2, 3]))).toThrow();
  });

  it("红队检测：导入含脏元素、缺失子数组或越界打卡时间的备份时自动清洗，不引发渲染崩溃", () => {
    const dirtyBackup = {
      format: BACKUP_FORMAT,
      version: 1,
      data: {
        onboarded: true,
        checkInHour: 999,
        entries: [
          null,
          "bad-entry",
          { id: "e1", date: "2026-10-12", content: 123, tags: "not-array" },
        ],
        events: [
          null,
          {
            id: "ev1",
            title: "测试事件",
            occurredAt: "2026-10-12",
            people: "不是数组",
            updates: [null, { id: "u1", content: "进展" }],
            materialIds: null,
            status: "confirmed",
            attention: "invalid",
          },
        ],
        materials: [
          {
            id: "m1",
            name: "测试材料",
            type: "contract",
            eventIds: "bad",
          },
        ],
      },
    };
    const parsed = parseBackup(JSON.stringify(dirtyBackup));
    expect(parsed.checkInHour).toBe(23);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].tags).toEqual([]);
    expect(parsed.entries[0].content).toBe("");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].people).toEqual([]);
    expect(parsed.events[0].materialIds).toEqual([]);
    expect(parsed.events[0].updates).toHaveLength(1);
    expect(parsed.events[0].attention).toBe("watch");
    expect(parsed.materials[0].eventIds).toEqual([]);
  });
});
