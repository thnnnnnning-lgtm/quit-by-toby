import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { Companion } from "./doodles";
import { Button, Modal } from "./ui";
import { MoodPicker } from "./cards";
import { useAppStore } from "../store/useAppStore";
import { today } from "../constants";
import { DEFAULT_CHECKIN_HOUR, type Mood } from "../types";

/**
 * 快速打卡（下班打卡）：让用户用最简单的方式（点一个心情）先记录。
 *
 * 出现规则：
 * - 只有当天还没有记录过心情时才会出现；
 * - 只在下班时间之后提醒（默认 18 点，可在「我的」里调整），白天打开不打扰；
 * - 填写过之后，这一天不会再出现，直到第二天到了下班时间；
 * - 打开网站落在「今天」入口才提醒，一次打开只弹一次，关掉后本次打开不再弹。
 * 保存成功后角色弹一下 + 星星散开，然后自动收起；只写入今天的心情。
 */

/** 保存成功时散开的小星星（纯 SVG，不用 emoji） */
const SPARKS = [
  { dx: "-64px", dy: "-34px", color: "#9c6a1f", size: 12 },
  { dx: "62px", dy: "-42px", color: "#4c7a34", size: 10 },
  { dx: "-80px", dy: "10px", color: "#b8533d", size: 9 },
  { dx: "78px", dy: "14px", color: "#9c6a1f", size: 11 },
  { dx: "-42px", dy: "-58px", color: "#4c7a34", size: 8 },
  { dx: "46px", dy: "-60px", color: "#b8533d", size: 10 },
];
const Spark = ({
  dx,
  dy,
  color,
  size,
  delay,
}: (typeof SPARKS)[number] & { delay: number }) => (
  <svg
    aria-hidden="true"
    className="animate-sparkle pointer-events-none absolute top-1/2 left-1/2"
    style={
      {
        "--dx": dx,
        "--dy": dy,
        animationDelay: `${delay}ms`,
        marginLeft: -size / 2,
        marginTop: -size / 2,
      } as CSSProperties
    }
    width={size}
    height={size}
    viewBox="0 0 10 10"
  >
    <path
      d="M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z"
      fill={color}
    />
  </svg>
);

export const QuickCheckIn = () => {
  const { pathname } = useLocation();
  const onboarded = useAppStore((s) => s.onboarded);
  const entries = useAppStore((s) => s.entries);
  const setStatus = useAppStore((s) => s.setStatus);
  const checkInHour = useAppStore((s) => s.checkInHour);

  const todayStr = today();
  const onTodayRoute =
    pathname === "/" ||
    pathname === "/today" ||
    pathname === `/today/${todayStr}`;
  // 打开网站时落在「今天」入口（含 / 与旧链接）才提醒；直接深链到其他页面不打扰
  const [landedOnToday] = useState(onTodayRoute);
  // 本次打开内用户关掉之后就不再重复弹
  const dismissed = useRef(false);

  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<Mood | null>(null);
  const [saved, setSaved] = useState(false);

  const filledToday = Boolean(
    entries.find((e) => e.date === todayStr)?.mood,
  );

  // 填写过当天心情 → 这一天不再出现；下班时间（默认 18 点）后才提醒
  useEffect(() => {
    if (!onboarded || !landedOnToday) return;
    const check = () => {
      if (dismissed.current || open) return;
      if (!onTodayRoute || filledToday) return;
      if (new Date().getHours() < (checkInHour ?? DEFAULT_CHECKIN_HOUR))
        return;
      setOpen(true);
    };
    check();
    // 应用一直开着时，跨过下班时间也能弹出来
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, [onboarded, landedOnToday, onTodayRoute, filledToday, checkInHour, open]);

  // 打开时以当天已有心情作为默认选中
  useEffect(() => {
    if (open)
      setMood(entries.find((e) => e.date === todayStr)?.mood ?? null);
    // 只在弹窗打开的那一刻同步一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    dismissed.current = true;
    setOpen(false);
  };
  const save = () => {
    if (!mood) return;
    setStatus({ date: todayStr, mood });
    setSaved(true);
    window.setTimeout(close, 1200);
  };

  if (!open) return null;

  return (
    <Modal title="先记一笔" testId="checkin-modal" onClose={close}>
      {saved ? (
        <div
          data-testid="checkin-done"
          className="relative flex flex-col items-center gap-3 py-8"
        >
          <div className="relative">
            <Companion size={84} simple className="animate-pop" />
            {SPARKS.map((s, i) => (
              <Spark key={i} {...s} delay={i * 45} />
            ))}
          </div>
          <p className="hand text-sm text-[var(--color-ink)]">
            今天已经记下来了。
          </p>
        </div>
      ) : (
        <div className="stack">
          <div className="flex items-center gap-2">
            <Companion size={42} simple className="shrink-0" />
            <div className="min-w-0">
              <p className="hand text-base text-[var(--color-ink)]">
                今天的状态
              </p>
              <p className="small muted">
                选一个心情就能保存，也可以直接进入应用再写。
              </p>
            </div>
          </div>
          <MoodPicker value={mood} onChange={setMood} animate />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              data-testid="checkin-skip"
              onClick={close}
            >
              直接进入，先不记录
            </Button>
            <Button variant="primary" disabled={!mood} onClick={save}>
              保存今天
            </Button>
          </div>
          <p className="faint">之后随时可以在「今天」页补充心情和文字。</p>
        </div>
      )}
    </Modal>
  );
};
