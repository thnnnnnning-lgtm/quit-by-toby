import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  RequireProfile,
  SectionTitle,
  useToast,
  type Tone,
} from "../components/ui";
import {
  DeleteEventButton,
  EventEditModal,
  MaterialCard,
  SuggestionList,
} from "../components/cards";
import { ATTENTION, formatDate, fullDate } from "../constants";

const SOURCE = {
  daily: "来自每日记录",
  chat: "来自每日记录 · 对话",
  manual: "手动新建",
  emergency: "来自紧急事项整理",
};

export default function EventDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const event = useAppStore((s) => s.events).find((e) => e.id === id);
  const entries = useAppStore((s) => s.entries);
  const materials = useAppStore((s) => s.materials);
  const addUpdate = useAppStore((s) => s.addUpdate);
  const confirmEvent = useAppStore((s) => s.confirmEvent);
  const [editing, setEditing] = useState(false);
  const [update, setUpdate] = useState("");

  if (!event)
    return (
      <div className="page">
        <EmptyState
          title="没有找到这个事件"
          description="它可能已经被删除。"
          action={
            <Button variant="primary" to="/review">
              回到回顾
            </Button>
          }
        />
      </div>
    );

  const linked = materials.filter((m) => m.eventIds.includes(event.id));
  // 来源记录：优先按 entry id 匹配（每日记录对话 / 紧急问卷），手动事件按日期兜底
  const sourceEntry =
    entries.find((e) => e.id === event.sourceId) ??
    entries.find((e) => e.date === event.occurredAt.slice(0, 10));
  const tone: Tone =
    event.attention === "priority"
      ? "warning"
      : event.attention === "watch"
        ? "neutral"
        : "success";

  return (
    <RequireProfile>
      <div className="page stack">
        <PageHeader
          title={event.title}
          subtitle={SOURCE[event.sourceType]}
          back="/review?tab=events"
        />

        <div className="card stack">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{ATTENTION[event.attention]}</Badge>
            {event.status === "draft" ? (
              <Badge tone="warning">待你确认</Badge>
            ) : event.status === "confirmed" ? (
              <Badge tone="success">已确认</Badge>
            ) : (
              <Badge tone="neutral">已标记为不记录</Badge>
            )}
          </div>

          <dl className="grid-2 text-sm">
            <div>
              <dt className="muted">发生时间</dt>
              <dd>{fullDate(event.occurredAt)}</dd>
            </div>
            <div>
              <dt className="muted">涉及人物</dt>
              <dd>{event.people.join("、") || "未填写"}</dd>
            </div>
          </dl>

          <p className="whitespace-pre-line text-sm leading-relaxed">
            {event.description}
          </p>

          {event.status === "draft" && (
            <div className="notice stack">
              <p>
                这是模拟 AI 提取的草稿，需要你确认后才会进入正式时间线和报告。
              </p>
              <div className="button-row">
                <Button
                  variant="primary"
                  onClick={() => {
                    confirmEvent(event.id);
                    toast("已确认，事件进入回顾");
                  }}
                >
                  确认记录
                </Button>
                <Button onClick={() => setEditing(true)}>编辑</Button>
              </div>
            </div>
          )}

          <div className="button-row">
            <Button onClick={() => setEditing(true)}>编辑事实</Button>
            <Button to={`/materials/upload?eventId=${event.id}`}>
              上传关联材料
            </Button>
            {sourceEntry && (
              <Button to={`/today/${sourceEntry.date}`}>查看来源记录</Button>
            )}
            {event.sourceId && event.sourceType === "emergency" && (
              <Button to={`/emergency/result/${event.sourceId}`}>
                查看来源
              </Button>
            )}
            <DeleteEventButton
              eventId={event.id}
              onDeleted={() => navigate("/review?tab=events")}
            />
          </div>
        </div>

        <div className="card stack">
          <SectionTitle title="后续进展" />
          {event.updates.length ? (
            <ul className="stack">
              {event.updates.map((u) => (
                <li key={u.id} className="list-row">
                  <div>
                    <p className="text-sm">{u.content}</p>
                    <p className="small muted">{formatDate(u.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">还没有追加进展。有新情况时可以补一句。</p>
          )}
          <div className="field">
            <label className="label" htmlFor="update">
              追加进展
            </label>
            <textarea
              id="update"
              className="input min-h-20"
              value={update}
              onChange={(e) => setUpdate(e.target.value)}
              placeholder="例如：今天又收到一封邮件…"
            />
          </div>
          <div className="button-row">
            <Button
              variant="primary"
              disabled={!update.trim()}
              onClick={() => {
                addUpdate(event.id, update.trim());
                setUpdate("");
                toast("已追加进展");
              }}
            >
              保存进展
            </Button>
          </div>
        </div>

        <SuggestionList title="这个事件的留痕建议" eventId={event.id} />

        <div className="stack">
          <SectionTitle
            title="关联材料"
            action={
              <Button
                to={`/materials/upload?eventId=${event.id}`}
                variant="ghost"
              >
                上传材料
              </Button>
            }
          />
          {linked.length ? (
            linked.map((material) => (
              <MaterialCard key={material.id} material={material} />
            ))
          ) : (
            <div className="card">
              <p className="muted">
                还没有关联材料。解除关联后，材料仍会保留在材料库中。
              </p>
            </div>
          )}
        </div>
      </div>
      {editing && (
        <EventEditModal event={event} onClose={() => setEditing(false)} />
      )}
    </RequireProfile>
  );
}
