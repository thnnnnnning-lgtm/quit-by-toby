import type { ReactNode } from "react";
import type { Mood } from "../types";
import { MOODS } from "../constants";

/**
 * 手绘素材库：全站唯一的图标与插画来源。
 *
 * 规则（对应视觉要求）：
 * - 统一线条：深色描边、圆头圆角、同一线宽（靠 CSS 的 non-scaling-stroke 保证任何尺寸下都一致）；
 * - 不混用标准线性图标集，全部为原创 SVG；
 * - 意象统一在日记 / 日历 / 文件夹 / 纸张 / 信封一类；
 * - 陪伴角色「小本」是产品的视觉锚点：顶部插画、完成反馈、空状态都用它。
 */

export type DoodleProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

const Svg = ({
  size = 18,
  className,
  strokeWidth = 1.5,
  children,
}: DoodleProps & { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className ? `doodle ${className}` : "doodle"}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

/* ------------------------------------------------------------------ *
 * 图标：27 个，覆盖全站（原先来自标准线性图标集）
 * ------------------------------------------------------------------ */

/** 今天：一支笔加一条写字的线 */
export const PenLine = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M4.5 19.5c.1-1.3.4-2.5.8-3.7.1-.3.2-.5.4-.7L15.8 5c.6-.6 1.6-.6 2.2 0l.8.8c.6.6.6 1.6 0 2.2L8.7 18.2c-.2.2-.4.3-.6.4-1.1.4-2.3.7-3.5.9-.1 0-.1 0-.1 0Z" />
    <path d="M14.1 6.7l3 3" />
    <path d="M3.4 21.4h17.2" />
  </Svg>
);

/** 回顾：日历 */
export const CalendarDays = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M4.4 7c0-.9.7-1.6 1.6-1.6h12.1c.9 0 1.6.7 1.6 1.6v11.1c0 .9-.7 1.6-1.6 1.6H6c-.9 0-1.6-.7-1.6-1.6Z" />
    <path d="M4.4 10.4h15.3" />
    <path d="M8.4 3.6v3.4M15.7 3.6v3.4" />
    <path d="M8.4 14h.02M12 14h.02M15.6 14h.02" />
  </Svg>
);

/** 我的：一个人 */
export const User = (p: DoodleProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.4" r="3.6" />
    <path d="M5.2 20.3c.4-3.7 3.3-6.2 6.8-6.2s6.4 2.5 6.8 6.2" />
  </Svg>
);

/** 品牌标识：一本带笔的日记本 */
export const NotebookPen = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M6.6 4.2h9.8c1 0 1.8.8 1.8 1.8v12c0 1-.8 1.8-1.8 1.8H6.6c-1 0-1.8-.8-1.8-1.8V6c0-1 .8-1.8 1.8-1.8Z" />
    <path d="M8.8 4.2v15.6" />
    <path d="M11.8 9.4h4.2M11.8 12.6h4.2M11.8 15.8h2.6" />
  </Svg>
);

export const ArrowLeft = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M19.3 12H5" />
    <path d="M11.1 5.6 4.7 11.9l6.4 6.5" />
  </Svg>
);

export const ChevronLeft = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M14.7 5.5 8.3 12l6.4 6.5" />
  </Svg>
);

export const ChevronRight = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M9.3 5.5 15.7 12l-6.4 6.5" />
  </Svg>
);

export const ChevronDown = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M5.8 9.5 12 15.6l6.2-6.1" />
  </Svg>
);

export const Check = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M4.8 12.7 9.6 17.5 19.3 6.6" />
  </Svg>
);

export const X = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M6.2 6.1 17.9 18M17.9 6.1 6.2 18" />
  </Svg>
);

export const Plus = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M12 5.3v13.4M5.3 12h13.4" />
  </Svg>
);

/** 发送：纸飞机 */
export const Send = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M20.4 4.2 4 10.9c-.4.2-.4.8 0 1l6.1 2.2c.1 0 .2.1.3.3l2.2 6.1c.1.4.7.4.9 0L20.4 4.2Z" />
    <path d="M20.4 4.2 10.1 14.1" />
  </Svg>
);

export const Upload = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M12 16.3V4.9" />
    <path d="M7.5 9.3 12 4.7l4.5 4.6" />
    <path d="M4.7 15.7v2.1c0 1 .8 1.8 1.8 1.8h11c1 0 1.8-.8 1.8-1.8v-2.1" />
  </Svg>
);

export const Download = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M12 4.7v11.4" />
    <path d="M7.5 11.5 12 16.1l4.5-4.6" />
    <path d="M4.7 15.7v2.1c0 1 .8 1.8 1.8 1.8h11c1 0 1.8-.8 1.8-1.8v-2.1" />
  </Svg>
);

/** 报告下载：一张纸加向下箭头 */
export const FileDown = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M13.4 3.6H7.2c-1 0-1.8.8-1.8 1.8v13.2c0 1 .8 1.8 1.8 1.8h9.6c1 0 1.8-.8 1.8-1.8V8.8Z" />
    <path d="M13.4 3.6v5.2h5.2" />
    <path d="M12 12.2v4.2M10 14.4l2 2.2 2-2.2" />
  </Svg>
);

export const FileText = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M13.4 3.6H7.2c-1 0-1.8.8-1.8 1.8v13.2c0 1 .8 1.8 1.8 1.8h9.6c1 0 1.8-.8 1.8-1.8V8.8Z" />
    <path d="M13.4 3.6v5.2h5.2" />
    <path d="M8.7 12.4h6.6M8.7 15.2h6.6M8.7 18h3.6" />
  </Svg>
);

/** 加载中：一段手绘圆弧 */
export const Loader2 = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M12 3.9a8.1 8.1 0 1 1-8.1 8.1" />
  </Svg>
);

/** 留痕材料：回形针 */
export const Paperclip = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M17.6 9.4v6.2a4.6 4.6 0 0 1-9.2 0V7.6a3 3 0 0 1 6 0v7.4a1.5 1.5 0 0 1-3 0V9.4" />
  </Svg>
);

export const Pencil = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M4.6 19.4c.2-1.3.5-2.5.9-3.6.1-.2.2-.4.4-.6L15.7 5.4c.6-.6 1.6-.6 2.2 0l.7.7c.6.6.6 1.6 0 2.2L8.8 18.1c-.2.2-.4.3-.6.4-1.1.4-2.3.7-3.5.9-.1 0-.1 0-.1 0Z" />
    <path d="M14.2 6.9l2.9 2.9" />
  </Svg>
);

export const Trash2 = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M4.9 7.4h14.2" />
    <path d="M9.4 7.4V5.3c0-.6.5-1.1 1.1-1.1h3c.6 0 1.1.5 1.1 1.1v2.1" />
    <path d="M6.7 7.4l.8 12c0 .6.5 1.1 1.1 1.1h6.8c.6 0 1.1-.5 1.1-1.1l.8-12" />
    <path d="M10.4 11.2v6M13.6 11.2v6" />
  </Svg>
);

export const Printer = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M7.4 8.8V4.9c0-.5.4-.9.9-.9h7.4c.5 0 .9.4.9.9v3.9" />
    <rect x="3.7" y="8.8" width="16.6" height="7.6" rx="2" />
    <path d="M7.4 14.3h9.2v5.7c0 .5-.4.9-.9.9H8.3c-.5 0-.9-.4-.9-.9Z" />
    <path d="M15.6 11.9h.02" />
  </Svg>
);

/** 时间敏感：盾牌加感叹 */
export const ShieldAlert = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M12 3.3c-2.3.9-4.6 1.6-7.1 1.9v6.4c0 4.1 2.9 7.7 7.1 9.1 4.2-1.4 7.1-5 7.1-9.1V5.2c-2.5-.3-4.8-1-7.1-1.9Z" />
    <path d="M12 8.6v4.4" />
    <path d="M12 16.1h.02" />
  </Svg>
);

export const ShieldCheck = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M12 3.3c-2.3.9-4.6 1.6-7.1 1.9v6.4c0 4.1 2.9 7.7 7.1 9.1 4.2-1.4 7.1-5 7.1-9.1V5.2c-2.5-.3-4.8-1-7.1-1.9Z" />
    <path d="M8.8 11.9l2.4 2.4 4.2-4.6" />
  </Svg>
);

export const AlertCircle = (p: DoodleProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.7v5.1M12 16.1h.02" />
  </Svg>
);

export const AlertTriangle = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M12 4.3c.4 0 .7.2.9.6l7.2 12.7c.4.7-.1 1.5-.9 1.5H4.8c-.8 0-1.3-.8-.9-1.5L11.1 4.9c.2-.4.5-.6.9-.6Z" />
    <path d="M12 9.6v4.2M12 16.6h.02" />
  </Svg>
);

/** 待办清单 */
export const ClipboardList = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M9.4 4.7H7.7c-1 0-1.8.8-1.8 1.8v11.8c0 1 .8 1.8 1.8 1.8h8.6c1 0 1.8-.8 1.8-1.8V6.5c0-1-.8-1.8-1.8-1.8h-1.7" />
    <path d="M9.4 3.4h5.2c.5 0 .9.4.9.9v1.7c0 .5-.4.9-.9.9H9.4c-.5 0-.9-.4-.9-.9V4.3c0-.5.4-.9.9-.9Z" />
    <path d="M9.1 11.7h.02M11.6 11.7h3.4M9.1 15.3h.02M11.6 15.3h3.4" />
  </Svg>
);

export const RefreshCw = (p: DoodleProps) => (
  <Svg {...p}>
    <path d="M19.4 12a7.4 7.4 0 1 1-2.3-5.3" />
    <path d="M19.9 3.7v3.6h-3.6" />
  </Svg>
);

/* ------------------------------------------------------------------ *
 * 心情角色：七个原创手绘表情
 * 形状与表情共同区分情绪，不只靠颜色
 * ------------------------------------------------------------------ */

const INK = "var(--color-stroke)";

const FACE: Record<Mood, (fill: string) => ReactNode> = {
  // 开心：淡黄，圆脸，笑眼加笑脸
  happy: (fill) => (
    <>
      <circle cx="24" cy="25" r="15" fill={fill} />
      <path d="M17.4 22.6c1-1.5 2.4-1.5 3.4 0M27.2 22.6c1-1.5 2.4-1.5 3.4 0" />
      <path d="M18.6 29.4c1.6 2.8 4 4.2 5.4 4.2s3.8-1.4 5.4-4.2" />
      <path d="M14.6 28.4h2.6M30.8 28.4h2.6" />
    </>
  ),
  // 还行：淡橙，圆脸，放松的小笑
  okay: (fill) => (
    <>
      <circle cx="24" cy="25" r="15" fill={fill} />
      <circle cx="18.6" cy="23" r="1.5" fill={INK} stroke="none" />
      <circle cx="29.4" cy="23" r="1.5" fill={INK} stroke="none" />
      <path d="M20.4 29.6c1.4 1.7 5.8 1.7 7.2 0" />
    </>
  ),
  // 一般：淡绿，圆脸，平嘴
  neutral: (fill) => (
    <>
      <circle cx="24" cy="25" r="15" fill={fill} />
      <path d="M18.8 21.8v2.6M29.2 21.8v2.6" />
      <path d="M20.4 29.9h7.2" />
    </>
  ),
  // 疲惫：灰蓝，压扁的脸，垂眼加一个「z」
  tired: (fill) => (
    <>
      <ellipse cx="24" cy="25.4" rx="15.2" ry="14.2" fill={fill} />
      <path d="M16.4 24c1.4-1.4 3-1.4 4.4.2M27.2 24.2c1.4-1.6 3-1.6 4.4-.2" />
      <path d="M20.4 30.6c1.4-1 5.8-1 7.2 0" />
      <path d="M33.2 8.4h4.4l-4.4 4.8h4.4" />
    </>
  ),
  // 生气：珊瑚红，方脸，竖眉加冒气
  angry: (fill) => (
    <>
      <rect x="9.2" y="10.6" width="29.6" height="28.4" rx="10" fill={fill} />
      <path d="M16.2 19.4l5 2.6M31.8 19.4l-5 2.6" />
      <path d="M17.6 25.4h.02M30.4 25.4h.02" />
      <path d="M19.6 31.8c1.8-2.2 6.6-2.2 8.4 0" />
      <path d="M13.4 7.7c1.6-1.3 1.6-3 0-4.3M34.6 7.7c1.6-1.3 1.6-3 0-4.3" />
    </>
  ),
  // 焦虑：淡紫，圆脸，睁大的眼加波浪嘴与汗滴
  anxious: (fill) => (
    <>
      <path
        d="M24 10.4c8.7 0 15.5 6.3 15.5 14.5 0 8.4-7 13.3-15.5 13.3s-15.5-4.9-15.5-13.3c0-8.2 6.8-14.5 15.5-14.5Z"
        fill={fill}
      />
      <circle cx="18.8" cy="23.4" r="2.6" />
      <circle cx="29.2" cy="23.4" r="2.6" />
      <circle cx="18.8" cy="23.8" r="1" fill={INK} stroke="none" />
      <circle cx="29.2" cy="23.8" r="1" fill={INK} stroke="none" />
      <path d="M19.4 30.8c1.4-1.5 2.8 1.5 4.4 0s3-1.5 4.4 0" />
      <path
        d="M37.2 16.8c1.6 2 2.4 3.5 2.4 4.7 0 1.4-1.1 2.5-2.4 2.5s-2.4-1.1-2.4-2.5c0-1.2.8-2.7 2.4-4.7Z"
        fill="var(--color-accent-blue)"
      />
    </>
  ),
  // 委屈：淡粉，圆脸，垂眉加一滴眼泪
  sad: (fill) => (
    <>
      <circle cx="24" cy="25" r="15" fill={fill} />
      <path d="M16.2 20.4c1.6-.9 3.4-.6 4.8.7M31.8 20.4c-1.6-.9-3.4-.6-4.8.7" />
      <path d="M18.4 24.4h.02M29.6 24.4h.02" />
      <path d="M20.6 31.6c1.4-1.9 5.4-1.9 6.8 0" />
      <path
        d="M16.4 27.2c1 1.4 1.5 2.3 1.5 3.1 0 .9-.7 1.7-1.5 1.7s-1.5-.8-1.5-1.7c0-.8.5-1.7 1.5-3.1Z"
        fill="var(--color-accent-blue)"
      />
    </>
  ),
};

/** 心情角色：心情选择、情绪日历、近期记录共用同一套素材 */
export const MoodFace = ({
  mood,
  size = 44,
  className,
}: {
  mood: Mood;
  size?: number;
  className?: string;
}) => (
  <svg
    viewBox="0 0 48 48"
    width={size}
    height={size}
    className={className ? `doodle ${className}` : "doodle"}
    fill="none"
    stroke={INK}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {FACE[mood](MOODS[mood].color)}
  </svg>
);

/** 记了内容但没选心情：不猜情绪，只放一个中性的日记本 */
export const DiaryMark = ({ size = 22, className }: DoodleProps) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className ? `doodle ${className}` : "doodle"}
    fill="none"
    stroke={INK}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M6.6 5.6h9.8c1 0 1.8.8 1.8 1.8v9.2c0 1-.8 1.8-1.8 1.8H6.6c-1 0-1.8-.8-1.8-1.8V7.4c0-1 .8-1.8 1.8-1.8Z" />
    <path d="M8.8 5.6v12.8" />
    <path d="M11.8 10.4h4.2M11.8 13.4h2.8" />
  </svg>
);

/* ------------------------------------------------------------------ *
 * 陪伴角色「小本」：身体就是一本日记
 * ------------------------------------------------------------------ */

export const Companion = ({
  size = 72,
  className,
  simple = false,
  strokeWidth = 2.2,
}: DoodleProps & { simple?: boolean }) => (
  <svg
    viewBox="0 0 96 96"
    width={size}
    height={size}
    className={className ? `doodle ${className}` : "doodle"}
    fill="none"
    stroke={INK}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="48" cy="31" r="19" fill="var(--color-surface)" />
    <circle cx="41.4" cy="30" r="2.4" fill={INK} stroke="none" />
    <circle cx="54.6" cy="30" r="2.4" fill={INK} stroke="none" />
    <path d="M42.6 37.6c1.7 2.4 3.6 3.6 5.4 3.6s3.7-1.2 5.4-3.6" />
    {!simple && <path d="M35.4 36.6h3.2M57.4 36.6h3.2" />}
    <rect
      x="25"
      y="52"
      width="46"
      height="34"
      rx="9"
      fill="var(--color-accent-green)"
    />
    <path d="M32 52v34" />
    {!simple && (
      <>
        <path d="M25 61h7M25 70h7M25 79h7" />
        <path d="M41 62h22M41 71h22M41 80h14" />
      </>
    )}
    <path d="M25 60c-5 .8-8 3.6-8 7.6" />
    <path d="M71 60c5 .8 8 3.6 8 7.6" />
  </svg>
);

/* ------------------------------------------------------------------ *
 * 「今天」页顶部插画：窗、书桌、小本与摊开的日记
 * ------------------------------------------------------------------ */

export const TodayHero = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 480 210"
    className={className ? `doodle ${className}` : "doodle"}
    fill="none"
    stroke={INK}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    role="img"
    aria-label="小本坐在书桌前写日记，旁边是窗户和一杯热饮"
  >
    {/* 窗与窗外的太阳 */}
    <rect
      x="34"
      y="18"
      width="134"
      height="106"
      rx="10"
      fill="var(--color-accent-blue)"
    />
    <path d="M101 18v106M34 71h134" />
    <circle cx="66" cy="45" r="12" fill="var(--color-accent-yellow)" />
    <path d="M137 47c2.4-3 5.4-3 7.8 0M153 39c2.4-3 5.4-3 7.8 0" />

    {/* 桌面 */}
    <path d="M14 174c70-4 130-4 200-2s140 3 252-2" />

    {/* 热饮 */}
    <path
      d="M96 146h32v19c0 4.4-3.6 8-8 8h-16c-4.4 0-8-3.6-8-8Z"
      fill="var(--color-accent-pink)"
    />
    <path d="M128 152c6.4 0 9.4 3 9.4 7s-3 7-9.4 7" />
    <path d="M106 138c2-3 2-5 0-8M117 138c2-3 2-5 0-8" />

    {/* 小本 */}
    <circle cx="222" cy="84" r="31" fill="var(--color-surface)" />
    <circle cx="211" cy="82" r="3.4" fill={INK} stroke="none" />
    <circle cx="233" cy="82" r="3.4" fill={INK} stroke="none" />
    <path d="M212 93c3 4.2 6.6 6.2 10 6.2s7-2 10-6.2" />
    <path d="M198.4 92h4.4M241.6 92h4.4" />
    <rect
      x="184"
      y="118"
      width="76"
      height="52"
      rx="12"
      fill="var(--color-accent-green)"
    />
    <path d="M198 118v52" />
    <path d="M184 132h9M184 145h9M184 158h9" />
    <path d="M214 133h32M214 146h32M214 159h19" />

    {/* 左臂 */}
    <path d="M184 128c-9 1.6-14 7-14 15" />

    {/* 右臂与铅笔 */}
    <path d="M260 128c8 0 13-3 16-8" />
    <path d="M273.2 117.2 292.2 98.2 297.8 103.8 278.8 122.8Z" fill="var(--color-accent-yellow)" />
    <path d="M270 126 273.2 117.2 278.8 122.8Z" fill={INK} stroke="none" />

    {/* 摊开的日记 */}
    <path
      d="M366 146c-14-7-32-7-46-1v26c14-6 32-6 46 1Z"
      fill="var(--color-surface)"
    />
    <path
      d="M366 146c14-7 32-7 46-1v26c-14-6-32-6-46 1Z"
      fill="var(--color-surface)"
    />
    <path d="M366 146v26" />
    <path d="M330 152h22M330 160h22M380 152h22M380 160h22" />
  </svg>
);
