import type {
  Mood,
  Attention,
  MaterialType,
  MaterialStatus,
  EmploymentStatus,
  EmergencyCategory,
} from "./types";
/**
 * 情绪统一用手绘表情 + 文字表达。
 * color 是手绘表情的淡彩底色，配合表情与形状共同区分情绪，颜色只是辅助。
 */
export const MOODS: Record<Mood, { label: string; color: string }> = {
  happy: { label: "开心", color: "#FFF0D0" },
  okay: { label: "还行", color: "#FFE7CE" },
  neutral: { label: "一般", color: "#E7F0CE" },
  tired: { label: "疲惫", color: "#DCE3EA" },
  angry: { label: "生气", color: "#F9C9BE" },
  anxious: { label: "焦虑", color: "#E7DDF4" },
  sad: { label: "委屈", color: "#F9DED5" },
};
/** 情绪在界面上出现的顺序，心情选择与日历保持一致 */
export const MOOD_ORDER: Mood[] = [
  "happy",
  "okay",
  "neutral",
  "tired",
  "angry",
  "anxious",
  "sad",
];
export const ATTENTION: Record<Attention, string> = {
  normal: "普通",
  watch: "值得关注",
  priority: "优先处理",
};
export const MATERIAL_TYPES: Record<MaterialType, string> = {
  contract: "劳动合同",
  offer: "Offer",
  jd: "岗位说明",
  salary: "工资",
  attendance: "考勤",
  performance: "绩效",
  hr: "HR 沟通",
  meeting: "会议记录",
  project: "项目记录",
  notice: "通知文件",
  other: "其他",
};
export const MATERIAL_STATUS: Record<MaterialStatus, string> = {
  pending: "待保存",
  saved_externally: "已自行保存",
  uploaded: "已上传",
};
export const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  "在职",
  "准备离职",
  "正在协商离职",
  "已经离职",
];
export const TAGS = [
  "加班",
  "绩效",
  "项目变化",
  "HR 沟通",
  "调岗",
  "被批评",
  "会议变化",
  "工资",
  "今天挺正常",
];
export const EMERGENCY_CATEGORIES: Record<EmergencyCategory, string> = {
  termination: "被通知解除",
  resignation: "被要求主动辞职",
  sign: "被要求签文件",
  transfer: "调岗 / 停职",
  access: "账号权限被关闭",
  salary: "工资异常",
  other: "其他",
};
/**
 * 对话快捷话题池：点一下就能开始，不用先想怎么说。
 * 分成几批，让「换一批」既换出新的说法，又始终是「情绪 / 具体变化 / 沟通与薪勤」
 * 的组合——每一条都落在本工具的核心价值上：把工作里值得留下的事安静地记下来。
 * 每一条也都能被 services/ai.ts 里的规则识别，点了就会给出对应的整理与留痕建议。
 */
export const QUICK_TOPIC_BATCHES: string[][] = [
  // 日常：最轻的一批，和旧版本的初始话题保持一致
  ["今天挺正常", "工作有点累", "项目发生变化", "和 HR 有沟通", "工资或考勤问题"],
  // 状态与情绪：只想先记一句感受时（不带结论、不评判）
  ["今天有点焦虑", "压力有点大", "工作有点累", "今天被表扬了", "完成了一个项目"],
  // 工作上有变化：偏「发生了什么」，会给出一条轻量候选
  [
    "会议临时取消了",
    "我被移出项目群了",
    "说要给我调岗",
    "HR 找我聊了聊",
    "这个月工资还没发",
  ],
  // 需要及时留痕：时间敏感，会走「整理当前情况」入口
  [
    "公司要求我今天签文件",
    "被通知解除合同",
    "我被移出项目群了",
    "这个月工资还没发",
    "和 HR 有沟通",
  ],
];
/** 默认展示第一批 */
export const QUICK_TOPICS = QUICK_TOPIC_BATCHES[0];
export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const today = () => dateKey();
export const addDays = (date: string, days: number) => {
  const d = new Date(`${date.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
};
export const formatDate = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
export const fullDate = (value: string) =>
  value.slice(0, 10).replaceAll("-", ".");
export const weekday = (value: string) =>
  WEEKDAYS[new Date(`${value.slice(0, 10)}T12:00:00`).getDay()];
/** 「10月12日 周一」，用于记录页顶部 */
export const dateWithWeekday = (value: string) =>
  `${formatDate(value)} 周${weekday(value)}`;
export const isFuture = (value: string) => value.slice(0, 10) > today();
/** 当天是否填过状态：只有心情是主入口 */
export const hasStatus = (entry: { mood?: Mood }): boolean =>
  entry.mood !== undefined;
/** 这一天是否有内容可看（填了状态或写了点什么） */
export const hasRecord = (entry: { mood?: Mood; content?: string }): boolean =>
  entry.mood !== undefined || Boolean(entry.content?.trim());
export const monthRange = (value: string) => {
  const d = new Date(`${value.slice(0, 7)}-01T12:00:00`);
  return {
    start: dateKey(d),
    end: dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
};
