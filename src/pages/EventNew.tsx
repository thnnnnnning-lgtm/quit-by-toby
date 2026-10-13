import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { Button, PageHeader, RequireProfile, useToast } from "../components/ui";
import { ATTENTION, today } from "../constants";
import type { WorkEvent } from "../types";
export default function EventNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const createManualEvent = useAppStore((s) => s.createManualEvent);
  const [form, setForm] = useState({
    title: "",
    occurredAt: today(),
    people: "",
    description: "",
    attention: "watch" as WorkEvent["attention"],
  });
  const submit = () => {
    if (!form.title.trim()) return;
    const id = createManualEvent({
      title: form.title.trim(),
      occurredAt: form.occurredAt,
      people: form.people
        .split("、")
        .map((s) => s.trim())
        .filter(Boolean),
      description: form.description.trim(),
      attention: form.attention,
      sourceType: "manual",
    });
    toast("已由你确认保存，事件进入回顾");
    navigate(`/events/${id}`, { replace: true });
  };
  return (
    <RequireProfile>
      <div className="page stack">
        <PageHeader
          title="手动新建事件"
          subtitle="自己写下的事件会直接标记为已确认，不会经过 AI 草稿。"
          back="/review?tab=events"
        />
        <div className="card stack">
          <div className="field">
            <label className="label" htmlFor="title">
              事件标题
            </label>
            <input
              id="title"
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="例如：收到岗位调整通知"
            />
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="date">
                发生时间
              </label>
              <input
                id="date"
                type="date"
                className="input"
                value={form.occurredAt}
                onChange={(e) =>
                  setForm({ ...form, occurredAt: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="attention">
                关注程度
              </label>
              <select
                id="attention"
                className="input"
                value={form.attention}
                onChange={(e) =>
                  setForm({
                    ...form,
                    attention: e.target.value as WorkEvent["attention"],
                  })
                }
              >
                {Object.entries(ATTENTION).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="people">
              涉及人物
            </label>
            <input
              id="people"
              className="input"
              value={form.people}
              onChange={(e) => setForm({ ...form, people: e.target.value })}
              placeholder="用顿号分隔，例如：主管、HR"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="description">
              事件描述
            </label>
            <textarea
              id="description"
              className="input min-h-32"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="按你知道的事实写，不确定的地方可以留空。"
            />
          </div>
          <p className="notice">
            这里只记录事实，不做判断。关注程度是你自己的标注，不是风险结论。
          </p>
          {!form.title.trim() && <p className="error">请先填写事件标题。</p>}
          <div className="button-row">
            <Button
              variant="primary"
              disabled={!form.title.trim()}
              onClick={submit}
            >
              确认保存
            </Button>
            <Button onClick={() => navigate(-1)}>取消</Button>
          </div>
        </div>
      </div>
    </RequireProfile>
  );
}
