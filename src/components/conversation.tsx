import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Paperclip,
  ShieldAlert,
  Upload,
} from "./doodles";
import type { MaterialSuggestion, WorkEvent } from "../types";
import { ATTENTION, MATERIAL_TYPES, formatDate } from "../constants";
import { useAppStore } from "../store/useAppStore";
import { Badge, Button, useToast } from "./ui";
import { SuggestionActionModal } from "./suggestion-actions";
import { matchingMaterials } from "../services/materials";

/**
 * 对话中插入的结构化卡片。
 *
 * 设计目标是**减少确认的打扰**：
 * - 一般候选只安静地进「今日整理」，不弹表单；
 * - 值得及时关注的变化才在对话里出现一张轻量卡片（记下来 / 先放着 / 不记录）；
 * - 确认后只说「已记入回顾」，不强制跳转事件详情，也不要求上传材料。
 */

/** 轻量事件卡：默认用已有信息，需要时展开编辑 */
export const EventPromptCard = ({ event }: { event: WorkEvent }) => {
  const confirmEvent = useAppStore((s) => s.confirmEvent);
  const dismissEvent = useAppStore((s) => s.dismissEvent);
  const updateEvent = useAppStore((s) => s.updateEvent);
  const toast = useToast();
  const [deferred, setDeferred] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    occurredAt: event.occurredAt.slice(0, 10),
    people: event.people.join("、"),
    description: event.description,
  });

  if (event.status === "confirmed")
    return (
      <div className="inline-card stack-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">已记入回顾</Badge>
          <span className="font-medium">{event.title}</span>
        </div>
        <p className="small muted">
          {formatDate(event.occurredAt)} · {ATTENTION[event.attention]}
          {event.people.length ? ` · ${event.people.join("、")}` : ""}
        </p>
      </div>
    );

  if (event.status === "dismissed")
    return (
      <div className="inline-card">
        <p className="small muted">已选择不记录：{event.title}</p>
      </div>
    );

  if (deferred)
    return (
      <div className="inline-card">
        <p className="small muted">
          已放在「今日整理」里：{event.title}
        </p>
      </div>
    );

  return (
    <div className="inline-card inline-card-accent stack-sm">
      <p className="font-medium">这次{event.title}要单独记下来吗？</p>
      <p className="small muted">
        我会用现在已有的信息：{formatDate(event.occurredAt)}
        {event.people.length ? ` · ${event.people.join("、")}` : " · 暂未填写人物"}
      </p>

      {editing ? (
        <div className="stack-sm">
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor={`d-${event.id}`}>
                日期
              </label>
              <input
                id={`d-${event.id}`}
                type="date"
                className="input"
                value={form.occurredAt}
                onChange={(e) =>
                  setForm({ ...form, occurredAt: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label className="label" htmlFor={`p-${event.id}`}>
                涉及人物
              </label>
              <input
                id={`p-${event.id}`}
                className="input"
                value={form.people}
                onChange={(e) => setForm({ ...form, people: e.target.value })}
                placeholder="用顿号分隔，可不填"
              />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor={`s-${event.id}`}>
              描述
            </label>
            <textarea
              id={`s-${event.id}`}
              className="input min-h-20"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div className="button-row">
            <Button
              size="sm"
              onClick={() => {
                updateEvent(event.id, {
                  occurredAt: form.occurredAt,
                  people: form.people
                    .split("、")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  description: form.description,
                });
                setEditing(false);
                toast("已更新，确认后才会记入回顾");
              }}
            >
              保存修改
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              收起
            </Button>
          </div>
        </div>
      ) : (
        <div className="button-row">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              confirmEvent(event.id);
              toast("已记入回顾");
            }}
          >
            记下来
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDeferred(true);
              toast("已放在今日整理，不会反复提醒");
            }}
          >
            先放着
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              dismissEvent(event.id);
              toast("已选择不记录");
            }}
          >
            不记录
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            aria-expanded={false}
          >
            展开编辑
          </Button>
        </div>
      )}
    </div>
  );
};

/** 「今日整理」里的一行草稿：不打扰，但随时可以处理 */
export const DraftRow = ({
  event,
  onEdit,
}: {
  event: WorkEvent;
  onEdit: () => void;
}) => {
  const confirmEvent = useAppStore((s) => s.confirmEvent);
  const dismissEvent = useAppStore((s) => s.dismissEvent);
  const toast = useToast();
  const [open, setOpen] = useState(false);

  if (event.status === "confirmed")
    return (
      <div className="list-row">
        <div>
          <p className="font-medium">
            <span className="mr-1 text-[var(--color-success)]">✓</span>
            {event.title}
          </p>
          <p className="small muted">
            已记入回顾 · {formatDate(event.occurredAt)} ·{" "}
            {ATTENTION[event.attention]}
          </p>
        </div>
        <Button size="sm" to={`/events/${event.id}`}>
          查看
        </Button>
      </div>
    );

  if (event.status === "dismissed")
    return (
      <div className="list-row">
        <p className="small muted">已选择不记录：{event.title}</p>
      </div>
    );

  return (
    <div className="stack-sm">
      <div className="list-row">
        <div>
          <p className="font-medium">{event.title}</p>
          <p className="small muted">
            {formatDate(event.occurredAt)} · {ATTENTION[event.attention]}
            {event.people.length ? ` · ${event.people.join("、")}` : ""}
          </p>
        </div>
        <div className="button-row">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              confirmEvent(event.id);
              toast("已记入回顾");
            }}
          >
            记下来
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            详情
            <ChevronDown
              size={14}
              className={open ? "rotate-180 transition" : "transition"}
            />
          </Button>
        </div>
      </div>
      {open && (
        <div className="stack-sm rounded-md bg-[var(--color-fill)] p-3">
          <p className="small">{event.description}</p>
          <div className="button-row">
            <Button size="sm" onClick={onEdit}>
              编辑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                dismissEvent(event.id);
                toast("已选择不记录");
              }}
            >
              不记录
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export const SuggestionCard = ({
  suggestion,
}: {
  suggestion: MaterialSuggestion;
}) => {
  const materials = useAppStore((s) => s.materials);
  const setStatus = useAppStore((s) => s.setSuggestionStatus);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const existing = matchingMaterials(
    {
      type: suggestion.type,
      title: suggestion.title,
      reason: suggestion.reason,
      eventId: suggestion.eventId,
    },
    materials,
  );
  const uploadTo = `/materials/upload?type=${suggestion.type}${
    suggestion.eventId ? `&eventId=${suggestion.eventId}` : ""
  }&suggestionId=${suggestion.id}`;

  if (suggestion.status === "completed")
    return (
      <div className="inline-card">
        <p className="small muted">
          ✓ 已处理：{suggestion.title}
          {suggestion.resolvedMaterialId
            ? `（${materials.find((m) => m.id === suggestion.resolvedMaterialId)?.name || "已关联"}）`
            : ""}
        </p>
      </div>
    );
  if (suggestion.status === "not_needed")
    return (
      <div className="inline-card">
        <p className="small muted">已选择不需要：{suggestion.title}</p>
      </div>
    );

  return (
    <div className="note stack-sm">
      <div className="flex items-start gap-2">
        <Paperclip
          size={15}
          className="mt-0.5 shrink-0 text-[var(--color-ink)]"
        />
        <div className="min-w-0">
          <p className="font-medium text-[var(--color-ink)]">
            {suggestion.title}
          </p>
          <p className="small text-[var(--color-muted)]">
            {MATERIAL_TYPES[suggestion.type]}
            {suggestion.priority ? " · 建议优先保存" : ""}
            {suggestion.status === "deferred" ? " · 已选择稍后" : ""}
          </p>
        </div>
      </div>
      <p className="small text-[var(--color-muted)]">
        建议原因：{suggestion.reason}
      </p>
      <p className="small text-[var(--color-muted)]">
        已有材料：
        {existing.length ? existing.map((m) => m.name).join("、") : "暂无同类材料"}
      </p>
      <p className="small text-[var(--color-muted)]">
        待补充：
        {suggestion.title}
        {suggestion.coverageStart
          ? `（${suggestion.coverageStart} 至 ${suggestion.coverageEnd}）`
          : ""}
      </p>
      <p className="faint">
        可以先保存材料，不需要先确认事件；保存材料也不会自动确认事件。
      </p>
      <div className="button-row">
        <Button size="sm" variant="primary" className="tap" to={uploadTo}>
          <Upload size={14} />
          上传
        </Button>
        <Button size="sm" className="tap" onClick={() => setOpen(true)}>
          我已自行保存
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="tap"
          onClick={() => {
            setStatus(suggestion.id, "deferred");
            toast("已放到稍后处理");
          }}
        >
          稍后
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="tap"
          onClick={() => {
            setStatus(suggestion.id, "not_needed");
            toast("已标记为不需要");
          }}
        >
          不需要
        </Button>
      </div>
      {open && (
        <SuggestionActionModal
          suggestion={suggestion}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

/** 时间敏感事项：保持醒目，由用户主动进入，不自动跳转 */
export const EmergencyCard = ({ date }: { date: string }) => (
  <div className="inline-card inline-card-alert stack-sm">
    <div className="flex items-center gap-2">
      <ShieldAlert size={16} className="text-[var(--color-danger)]" />
      <span className="font-medium text-[var(--color-ink)]">
        整理当前情况
      </span>
    </div>
    <p className="small text-[var(--color-body)]">
      这件事在时间上比较紧。问卷会按类型一步步问，答完可以回到今天的记录。要不要现在整理一下？
    </p>
    <div className="button-row">
      <Button size="sm" variant="primary" to={`/emergency?date=${date}`}>
        开始整理
      </Button>
    </div>
  </div>
);

export const UpdateSuggestionCard = ({
  event,
  content,
}: {
  event: WorkEvent;
  content: string;
}) => {
  const addUpdate = useAppStore((s) => s.addUpdate);
  const toast = useToast();
  const [done, setDone] = useState(false);
  if (done)
    return (
      <div className="inline-card">
        <p className="small muted">✓ 已追加进展到「{event.title}」</p>
      </div>
    );
  return (
    <div className="inline-card stack-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} className="text-[var(--color-warning)]" />
        <span className="font-medium">追加进展到「{event.title}」？</span>
      </div>
      <p className="small muted">新内容：{content}</p>
      <p className="faint">
        追加进展不会改写已确认的事实，只会在事件下新增一条记录。
      </p>
      <div className="button-row">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            addUpdate(event.id, content);
            setDone(true);
            toast("已追加进展");
          }}
        >
          追加进展
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDone(true)}>
          不用
        </Button>
      </div>
    </div>
  );
};
