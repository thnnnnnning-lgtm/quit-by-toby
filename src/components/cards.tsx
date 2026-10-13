import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Paperclip, Trash2 } from "./doodles";
import type { WorkEvent, Material, MaterialSuggestion, Mood } from "../types";
import {
  ATTENTION,
  MATERIAL_STATUS,
  MATERIAL_TYPES,
  MOODS,
  MOOD_ORDER,
  formatDate,
} from "../constants";
import { useAppStore } from "../store/useAppStore";
import {
  Badge,
  Button,
  Modal,
  SectionTitle,
  useToast,
  type Tone,
} from "./ui";
import { downloadBlob, fileService } from "../services/files";
import { FilePreview } from "./FilePreview";
import { SuggestionActionModal } from "./suggestion-actions";
import { MoodFace } from "./doodles";

/**
 * 心情选择：一排手绘表情，每个配一个短标签。
 * 选中态用该情绪自己的淡色底 + 深墨描边，不选时不加底色。
 * animate=true 时用于「快速打卡」弹窗：依次浮起 + 选中弹跳（一次性动效）。
 */
export const MoodPicker = ({
  value,
  onChange,
  animate = false,
}: {
  value: Mood | null;
  onChange: (mood: Mood) => void;
  animate?: boolean;
}) => (
  <div
    role="radiogroup"
    aria-label="今天的心情"
    className="grid grid-cols-4 gap-2 sm:grid-cols-7"
  >
    {MOOD_ORDER.map((key, index) => {
      const m = MOODS[key];
      const active = value === key;
      return (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(key)}
          className={`kbd-focus flex min-h-[4.75rem] flex-col items-center justify-center gap-1 border-[1.5px] p-1.5 text-xs transition ${
            animate ? "animate-mood-rise hover:-translate-y-0.5" : ""
          } ${
            active
              ? "border-[var(--color-stroke)] font-medium text-[var(--color-ink)]"
              : "border-transparent text-[var(--color-body)] hover:border-[var(--color-line)]"
          }`}
          style={{
            borderRadius: "13px 11px 14px 11px / 11px 14px 11px 13px",
            background: active ? m.color : undefined,
            animationDelay: animate ? `${index * 45}ms` : undefined,
          }}
        >
          <MoodFace
            mood={key}
            size={34}
            className={active && animate ? "animate-mood-bounce" : undefined}
          />
          <span>{m.label}</span>
        </button>
      );
    })}
  </div>
);
/** 关注程度同时用文字表达（ATTENTION），颜色只是辅助 */
const attentionTone = (attention: WorkEvent["attention"]): Tone =>
  attention === "priority"
    ? "warning"
    : attention === "watch"
      ? "neutral"
      : "success";
export const EventCard = ({
  event,
  onClick,
}: {
  event: WorkEvent;
  onClick?: () => void;
}) => {
  const suggestions = useAppStore((s) => s.suggestions);
  const done = suggestions.filter(
    (x) => x.eventId === event.id && x.status === "completed",
  ).length;
  const total = suggestions.filter(
    (x) => x.eventId === event.id && x.status !== "not_needed",
  ).length;
  const content = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h3>{event.title}</h3>
        <Badge tone={attentionTone(event.attention)}>
          {ATTENTION[event.attention]}
        </Badge>
        {event.status === "draft" && <Badge tone="warning">待你确认</Badge>}
      </div>
      <p className="muted mt-1">{formatDate(event.occurredAt)}</p>
      <p className="mt-2 line-clamp-2 text-sm">{event.description}</p>
      {total > 0 && (
        <p className="small muted mt-2">
          材料进度 {done}/{total}
        </p>
      )}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="card kbd-focus stack w-full items-start text-left hover:bg-[var(--color-fill)]"
    >
      {content}
    </button>
  ) : (
    <Link
      to={`/events/${event.id}`}
      className="card kbd-focus stack hover:bg-[var(--color-fill)]"
    >
      {content}
    </Link>
  );
};
/**
 * 材料卡片：提交后保持紧凑的一行，不再长期占用大块空间。
 * 名称 + 状态一目了然，次要信息收进小字，需要时再进详情页。
 */
export const MaterialCard = ({ material }: { material: Material }) => {
  const [preview, setPreview] = useState(false);
  return (
    <>
      <div className="list-row" data-testid="material-row">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium text-[var(--color-ink)]">
              {material.name}
            </span>
            <Badge tone={material.status === "uploaded" ? "success" : "neutral"}>
              {material.status === "uploaded" ? "已提交" : MATERIAL_STATUS[material.status]}
            </Badge>
            {material.extractionStatus === "draft" && (
              <Badge tone="warning">摘要待确认</Badge>
            )}
            {!material.isCurrent && <Badge tone="neutral">非当前有效</Badge>}
          </div>
          <p className="small muted truncate">
            {MATERIAL_TYPES[material.type]}
            {material.coverageStart
              ? ` · ${material.coverageStart} 至 ${material.coverageEnd || "至今"}`
              : ""}
            {material.externalLocationNote
              ? ` · 保存于${material.externalLocationNote}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {material.fileId && (
            <Button size="sm" variant="ghost" onClick={() => setPreview(true)}>
              原文件
            </Button>
          )}
          <Button size="sm" to={`/materials/${material.id}`}>
            详情
          </Button>
        </div>
      </div>
      {preview && material.fileId && (
        <MaterialPreviewModal
          materialId={material.id}
          onClose={() => setPreview(false)}
        />
      )}
    </>
  );
};
export const MaterialPreviewModal = ({
  materialId,
  onClose,
}: {
  materialId: string;
  onClose: () => void;
}) => {
  const material = useAppStore((s) => s.materials).find(
    (m) => m.id === materialId,
  );
  const [stored, setStored] = useState<
    { blob: Blob; name: string; type: string } | undefined
  >();
  const toast = useToast();
  useEffect(() => {
    if (!material?.fileId) return;
    fileService
      .get(material.fileId)
      .then((f) => setStored(f))
      .catch((e) => toast(e.message));
  }, [material?.fileId, toast]);
  if (!material) return null;
  return (
    <Modal title={material.name} onClose={onClose}>
      <div className="stack">
        {stored ? (
          <>
            <FilePreview blob={stored.blob} type={stored.type} />
            <Button onClick={() => downloadBlob(stored.blob, stored.name)}>
              <Download size={16} />
              下载原始文件
            </Button>
          </>
        ) : (
          <p className="muted">这份材料没有上传原文件，仅记录了保存状态。</p>
        )}
        <p className="notice">原始文件不会被修改，你可以随时下载核对。</p>
      </div>
    </Modal>
  );
};
export const SuggestionList = ({
  suggestions,
  eventId,
  title = "待补充材料",
}: {
  suggestions?: MaterialSuggestion[];
  eventId?: string;
  title?: string;
  onDone?: () => void;
}) => {
  const all = useAppStore((s) => s.suggestions);
  const entries = useAppStore((s) => s.entries);
  const materials = useAppStore((s) => s.materials);
  const setStatus = useAppStore((s) => s.setSuggestionStatus);
  const toast = useToast();
  const [picking, setPicking] = useState<MaterialSuggestion | null>(null);
  // 材料收集不以确认事件为前提，所以默认展示全部待处理建议（含只挂在某一天上的）
  const list = (suggestions ?? all)
    .filter((s) => (eventId ? s.eventId === eventId : true))
    .filter((s) => s.status !== "not_needed");
  const active = list
    .filter((s) => s.status !== "completed")
    .sort((a, b) => Number(Boolean(b.priority)) - Number(Boolean(a.priority)));
  const done = list.filter((s) => s.status === "completed");
  if (!list.length)
    return (
      <div className="panel">
        <SectionTitle title={title} />
        <p className="muted">今天暂无特别需要补充的材料。</p>
      </div>
    );
  return (
    <div className="panel stack">
      <SectionTitle
        title={title}
        action={<span className="faint">待处理 {active.length}</span>}
      />
      <ul className="stack">
        {active.map((s) => (
          <li key={s.id} className="note stack-sm">
            <div className="flex items-start gap-2">
              <Paperclip
                size={15}
                className="mt-0.5 shrink-0 text-[var(--color-ink)]"
              />
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-ink)]">
                  {s.title}
                  {s.priority && (
                    <span className="ml-2 align-middle">
                      <Badge tone="warning">建议优先保存</Badge>
                    </span>
                  )}
                </p>
                <p className="small text-[var(--color-muted)]">
                  {s.reason}
                  {s.coverageStart
                    ? `（${s.coverageStart} 至 ${s.coverageEnd}）`
                    : ""}
                </p>
                {(() => {
                  const owner = entries.find((e) => e.id === s.entryId);
                  return owner ? (
                    <p className="faint">来自 {owner.date} 的记录</p>
                  ) : null;
                })()}
                {s.status === "deferred" && (
                  <p className="faint">已选择稍后处理</p>
                )}
              </div>
            </div>
            <div className="button-row">
              <Button
                size="sm"
                variant="primary"
                className="tap"
                onClick={() => setPicking(s)}
              >
                处理
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="tap"
                onClick={() => setStatus(s.id, "deferred")}
              >
                稍后
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="tap"
                onClick={() => {
                  setStatus(s.id, "not_needed");
                  toast("已标记为不需要");
                }}
              >
                不需要
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <details className="panel-flat">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-ink)]">
            已有材料（{done.length}）
          </summary>
          <ul className="mt-2 stack">
            {done.map((s) => (
              <li key={s.id} className="small muted">
                ✓ {s.title}
                {s.resolvedMaterialId
                  ? `（${materials.find((m) => m.id === s.resolvedMaterialId)?.name || "已关联"}）`
                  : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {picking && (
        <SuggestionActionModal
          suggestion={picking}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
};
export const DeleteEventButton = ({
  eventId,
  onDeleted,
}: {
  eventId: string;
  onDeleted: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const deleteEvent = useAppStore((s) => s.deleteEvent);
  const toast = useToast();
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <Trash2 size={16} />
        删除事件
      </Button>
      {open && (
        <Modal title="删除这个事件？" onClose={() => setOpen(false)}>
          <div className="stack">
            <p className="muted">
              删除后，这个事件不会再出现在回顾、时间线和报告中。原始日记和材料文件会保留，关联会自动解除。
            </p>
            <div className="button-row justify-end">
              <Button onClick={() => setOpen(false)}>取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteEvent(eventId);
                  toast("事件已删除，日记与材料已保留");
                  setOpen(false);
                  onDeleted();
                }}
              >
                确认删除
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
export const EventEditModal = ({
  event,
  onClose,
}: {
  event: WorkEvent;
  onClose: () => void;
}) => {
  const updateEvent = useAppStore((s) => s.updateEvent);
  const toast = useToast();
  const [form, setForm] = useState({
    title: event.title,
    occurredAt: event.occurredAt.slice(0, 10),
    people: event.people.join("、"),
    description: event.description,
    attention: event.attention,
  });
  return (
    <Modal title="编辑事件" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label className="label" htmlFor="t">
            标题
          </label>
          <input
            id="t"
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor="d">
              发生时间
            </label>
            <input
              id="d"
              type="date"
              className="input"
              value={form.occurredAt}
              onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="a">
              关注程度
            </label>
            <select
              id="a"
              className="input"
              value={form.attention}
              onChange={(e) =>
                setForm({
                  ...form,
                  attention: e.target.value as WorkEvent["attention"],
                })
              }
            >
              {Object.entries(ATTENTION).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="p">
            涉及人物
          </label>
          <input
            id="p"
            className="input"
            value={form.people}
            onChange={(e) => setForm({ ...form, people: e.target.value })}
            placeholder="用顿号分隔"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="s">
            描述
          </label>
          <textarea
            id="s"
            className="input min-h-28"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        {!form.title && <p className="error">标题不能为空。</p>}
        <div className="button-row justify-end">
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={!form.title}
            onClick={() => {
              updateEvent(event.id, {
                title: form.title,
                occurredAt: form.occurredAt,
                people: form.people
                  .split("、")
                  .map((s) => s.trim())
                  .filter(Boolean),
                description: form.description,
                attention: form.attention,
              });
              toast("事件已更新");
              onClose();
            }}
          >
            保存
          </Button>
        </div>
      </div>
    </Modal>
  );
};
