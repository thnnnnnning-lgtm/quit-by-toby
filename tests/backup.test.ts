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
});
