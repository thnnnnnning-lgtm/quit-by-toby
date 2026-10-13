import type { AppData } from "../types";
import { migrateData } from "./migrate";

/**
 * 本地备份：导出 / 导入。
 *
 * 两条硬性约束：
 * 1. **导出只带用户数据，绝不带 AI 接入配置与 API Key。**
 *    旧实现是 `{ ...useAppStore.getState() }`，把 `ai.apiKey` 一起写进了
 *    下载下来的 JSON——用户点一次「导出」，密钥就明文落盘了。
 * 2. **导入复用 migrateData。** 备份可能来自旧版本，字段不一定齐全；
 *    走同一套迁移管线，旧备份也能补齐 conversationId / entryId 等字段。
 */

/** 备份包含的数据字段（白名单）。ai 与 mockConfig 明确不在其中。 */
export type BackupData = Pick<
  AppData,
  | "profile"
  | "onboarded"
  | "isDemo"
  | "entries"
  | "events"
  | "materials"
  | "suggestions"
  | "emergencies"
  | "messages"
  | "notificationEnabled"
  | "salaryReminderEnabled"
  | "checkInHour"
>;

export const BACKUP_FORMAT = "workday-companion-backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  privacy: string;
  data: BackupData;
}

/** 显式挑字段，避免以后新增敏感字段时又被顺手带出去 */
export function buildBackup(state: AppData): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    privacy:
      "不含 AI 接入配置与 API Key；上传的原始文件保存在浏览器本地，不在本备份内。",
    data: {
      profile: state.profile,
      onboarded: state.onboarded,
      isDemo: state.isDemo,
      entries: state.entries,
      events: state.events,
      materials: state.materials,
      suggestions: state.suggestions,
      emergencies: state.emergencies,
      messages: state.messages,
      notificationEnabled: state.notificationEnabled,
      salaryReminderEnabled: state.salaryReminderEnabled,
      checkInHour: state.checkInHour,
    },
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 解析备份文件。
 * 同时兼容两种来源：
 * - 新格式：{ format, version, data: {...} }
 * - 旧格式：直接把整个 store 导出成的平铺对象
 * 任意字段不合法都交给 migrateData 补默认值，不会把坏数据写进 store。
 */
export function parseBackup(text: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("导入失败：这个文件不是有效的 JSON。");
  }
  if (!isObject(parsed)) throw new Error("导入失败：备份内容无法识别。");

  const raw = isObject(parsed.data) ? parsed.data : parsed;
  const looksLikeRecords =
    Array.isArray(raw.entries) ||
    Array.isArray(raw.events) ||
    Array.isArray(raw.materials) ||
    isObject(raw.profile);
  if (!looksLikeRecords)
    throw new Error("导入失败：这个文件里没有可识别的记录数据。");

  // migrateData 会补齐旧字段、回退非法值，并带上 emptyData 的默认值
  return migrateData(raw);
}
