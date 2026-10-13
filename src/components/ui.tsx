import {
  createContext,
  useCallback,
  useContext,
  forwardRef,
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Companion, Loader2, X } from "./doodles";
import { useAppStore } from "../store/useAppStore";

type ToastItem = { id: number; message: string };
type ToastFn = (message: string) => void;
const ToastContext = createContext<ToastFn>(() => {});
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback<ToastFn>(
    (message) =>
      setItems((list) => [
        ...list,
        { id: Date.now() + Math.random(), message },
      ]),
    [],
  );
  useEffect(() => {
    if (!items.length) return;
    const timer = setTimeout(() => setItems((list) => list.slice(1)), 3200);
    return () => clearTimeout(timer);
  }, [items]);
  return (
    <ToastContext.Provider value={push}>
      <>
        {children}
        {/* 顶部居中：不会和底部导航、对话输入框抢位置 */}
        <div className="no-print pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
          {items.map((item) => (
            <div
              key={item.id}
              role="status"
              aria-live="polite"
              className="max-w-full border-[1.5px] border-[var(--color-stroke)] bg-[var(--color-surface)] px-3.5 py-2 text-sm text-[var(--color-ink)] shadow-[0_2px_8px_rgba(41,40,36,0.10)]"
              style={{ borderRadius: "12px 10px 13px 10px / 10px 13px 10px 12px" }}
            >
              {item.message}
            </div>
          ))}
        </div>
      </>
    </ToastContext.Provider>
  );
};
export const useToast = () => useContext(ToastContext);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  to?: string;
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      to,
      className = "",
      children,
      ...rest
    },
    ref,
  ) => {
    const cls = [
      "btn",
      `btn-${variant}`,
      size === "sm" ? "btn-sm" : "",
      "kbd-focus",
      className,
    ]
      .filter(Boolean)
      .join(" ");
    if (to)
      return (
        <Link to={to} className={cls}>
          {children}
        </Link>
      );
    return (
      <button ref={ref} className={cls} {...rest}>
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export type Tone = "primary" | "success" | "warning" | "danger" | "neutral";
export const Badge = ({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: boolean;
}) => {
  const map: Record<Tone, string> = {
    primary: "bg-[var(--color-primary-soft)] text-[var(--color-ink)]",
    success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
    warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
    danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
    neutral: "bg-[var(--color-fill-2)] text-[var(--color-body)]",
  };
  return (
    <span className={`badge ${map[tone]}`}>
      {/* 状态同时用文字表达，颜色只是辅助 */}
      {icon && <span aria-hidden="true">·</span>}
      {children}
    </span>
  );
};

export const PageHeader = ({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  action?: ReactNode;
}) => {
  const navigate = useNavigate();
  return (
    <header className="no-print mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {back ? (
          <button
            type="button"
            className="kbd-focus -ml-1 mt-0.5 rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-fill-2)] hover:text-[var(--color-ink)]"
            onClick={() => navigate(back)}
            aria-label="返回上一页"
          >
            <ArrowLeft size={18} />
          </button>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate leading-tight">{title}</h1>
          {subtitle ? (
            <p className="muted mt-0.5 max-w-prose">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action}
    </header>
  );
};

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="panel-flat stack items-center py-8 text-center">
    <Companion size={64} simple />
    <h3 className="hand">{title}</h3>
    {description && <p className="muted max-w-prose">{description}</p>}
    {action}
  </div>
);

export const Modal = ({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  // 用 ref 保存最新的关闭回调：调用方大多传内联函数，若直接进依赖数组，
  // 弹窗会在父组件每次渲染时重建监听、焦点被反复重置
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // 打开前焦点在哪里，关闭后就还回哪里
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.focus();

    const focusable = () =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : [];

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      // 焦点循环：Tab 只在弹窗内部走，不会跑到遮罩后面的页面上
      const items = focusable();
      if (!items.length) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === node) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, []);
  return (
    <div
      className="animate-overlay fixed inset-0 z-50 flex items-end justify-center bg-[rgba(41,40,36,0.38)] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        data-testid={testId}
        className="animate-modal max-h-[88vh] w-full max-w-lg overflow-y-auto border-[1.6px] border-[var(--color-stroke)] bg-[var(--color-surface)] p-4 shadow-[0_6px_24px_rgba(41,40,36,0.14)]"
        style={{ borderRadius: "18px 16px 19px 15px / 16px 19px 15px 18px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--color-line-soft)] pb-3">
          <h2>{title}</h2>
          <button
            type="button"
            className="kbd-focus rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-fill-2)] hover:text-[var(--color-ink)]"
            onClick={onClose}
            aria-label="关闭弹窗"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const SectionTitle = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) => (
  <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
    <div>
      <h2>{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
    {action}
  </div>
);

/** 移动端折叠面板；桌面端用右侧摘要栏代替 */
export const Collapsible = ({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-flat p-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="kbd-focus flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        style={{ borderRadius: "13px 11px 14px 11px / 11px 14px 11px 13px" }}
      >
        <span className="font-medium">{title}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-[var(--color-faint)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-[var(--color-line-soft)] px-4 py-3">
          {children}
        </div>
      )}
    </div>
  );
};

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmText = "确认",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) =>
  open ? (
    <Modal title={title} onClose={onCancel}>
      <div className="stack">
        <p className="muted whitespace-pre-line">{description}</p>
        <div className="button-row justify-end">
          <Button onClick={onCancel}>取消</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  ) : null;

export const LoadingState = ({ label = "正在整理…" }: { label?: string }) => (
  <div className="flex items-center gap-3 py-1" role="status">
    <Loader2
      size={16}
      className="animate-spin text-[var(--color-muted)] motion-reduce:animate-none"
    />
    <p className="muted">{label}</p>
  </div>
);

export const ErrorState = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) => (
  <div className="error stack">
    <p>{message}</p>
    {onRetry && (
      <div className="button-row">
        <Button size="sm" onClick={onRetry}>
          重试
        </Button>
      </div>
    )}
  </div>
);

export const MockBadge = ({ label = "模拟 AI" }: { label?: string }) => (
  <Badge tone="neutral">{label}</Badge>
);

/** AI 接入状态灯：绿=已接入，红=连接失败，灰=未配置，黄=检测中 */
const AI_LIGHT: Record<
  "unset" | "testing" | "ok" | "error",
  { color: string; text: string }
> = {
  unset: { color: "#b9b3a6", text: "未接入 AI" },
  testing: { color: "#9c6a1f", text: "正在检测…" },
  ok: { color: "#4c7a34", text: "AI 已接入" },
  error: { color: "#b8533d", text: "AI 连接失败" },
};
export const AiStatusLight = ({
  status,
  label,
}: {
  status: "unset" | "testing" | "ok" | "error";
  label?: string;
}) => {
  const item = AI_LIGHT[status];
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-body)]"
    >
      <span
        aria-hidden="true"
        data-testid="ai-light"
        className={`h-2 w-2 shrink-0 rounded-full ${status === "testing" ? "animate-pulse" : ""}`}
        style={{ background: item.color }}
      />
      {label ?? item.text}
    </span>
  );
};

export const RequireProfile = ({ children }: { children: ReactNode }) => {
  const onboarded = useAppStore((s) => s.onboarded);
  const navigate = useNavigate();
  useEffect(() => {
    if (!onboarded) navigate("/onboarding", { replace: true });
  }, [onboarded, navigate]);
  return onboarded ? <>{children}</> : null;
};
