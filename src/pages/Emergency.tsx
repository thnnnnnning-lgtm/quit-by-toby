import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { QUESTIONS, buildEmergency } from "../services/emergency";
import {
  createSuggestions,
  matchingMaterials,
  requirementsForEvent,
} from "../services/materials";
import {
  Badge,
  Button,
  ErrorState,
  MockBadge,
  PageHeader,
  RequireProfile,
  SectionTitle,
  useToast,
} from "../components/ui";
import { SuggestionList } from "../components/cards";
import { ShieldAlert } from "../components/doodles";
import { EMERGENCY_CATEGORIES, today } from "../constants";
import type { EmergencyCategory, MaterialType } from "../types";
/**
 * 只接受已知的紧急分类。
 * 之前直接把 URL 参数当成分类用，`/emergency?category=xxx` 会让
 * QUESTIONS[category] 变成 undefined，紧接着读 questions.length / 下标就整页崩掉。
 */
const isEmergencyCategory = (
  value: string | null | undefined,
): value is EmergencyCategory =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(EMERGENCY_CATEGORIES, value);

const PRIORITY = {
  routine: { label: "常规关注", tone: "success" as const },
  priority: { label: "优先处理", tone: "warning" as const },
  urgent: { label: "紧急处理", tone: "danger" as const },
};
export function EmergencyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const saveEmergency = useAppStore((s) => s.saveEmergency);
  const toast = useToast();
  // 从每日记录进入时带上日期，问卷完成后可以回到那天的记录
  const date = params.get("date") || today();
  const [category, setCategory] = useState<EmergencyCategory | null>(() => {
    const fromUrl = params.get("category");
    return isEmergencyCategory(fromUrl) ? fromUrl : null;
  });
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // ?? [] 是第二道保险：即使将来分类多了一个还没配问题的键，也不会直接读 undefined
  const questions = category ? (QUESTIONS[category] ?? []) : [];
  const current = questions[index];
  const submit = () => {
    if (!category) return;
    const session = { ...buildEmergency(category, answers), date };
    saveEmergency(session);
    toast("已生成紧急事项整理结果");
    navigate(`/emergency/result/${session.id}`, { replace: true });
  };
  return (
    <RequireProfile>
      <div className="page stack">
        <PageHeader
          title="紧急事项整理"
          subtitle="先选一种情况，再回答几个问题。不想回答的可以选“暂不清楚”。"
          back="/today"
        />
        {/* 时间敏感的信息保持醒目：不用插画削弱，直接说清楚边界 */}
        <div className="inline-card-alert stack-sm">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-[var(--color-danger)]" />
            <span className="font-medium text-[var(--color-ink)]">
              时间比较紧的话，先把事实整理下来
            </span>
          </div>
          <p className="small text-[var(--color-body)]">
            问卷只记录你填写的事实，不会给出结论。答完可以回到当天的记录，确认后才会进入回顾。
          </p>
        </div>
        {!category && (
          <div className="stack">
            {Object.entries(EMERGENCY_CATEGORIES).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="card kbd-focus flex items-center gap-2 text-left hover:border-[var(--color-stroke)]"
                onClick={() => {
                  setCategory(key as EmergencyCategory);
                  setIndex(0);
                  setAnswers({});
                }}
              >
                <ShieldAlert
                  size={16}
                  className="shrink-0 text-[var(--color-muted)]"
                />
                <span className="font-medium text-[var(--color-ink)]">
                  {label}
                </span>
              </button>
            ))}
          </div>
        )}
        {category && current && (
          <div className="panel stack">
            <div className="flex items-center justify-between">
              <span className="muted small">
                {EMERGENCY_CATEGORIES[category]} · 第 {index + 1} /{" "}
                {questions.length} 题
              </span>
              <span className="muted small">
                {Math.round((index / questions.length) * 100)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-fill)]">
              <div
                className="h-1.5 rounded-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${(index / questions.length) * 100}%` }}
              />
            </div>
            <h2>{current.text}</h2>
            <div className="stack">
              {current.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={answers[current.id] === option}
                  onClick={() =>
                    setAnswers({ ...answers, [current.id]: option })
                  }
                  className={`chip kbd-focus justify-center py-3 ${answers[current.id] === option ? "chip-active" : ""}`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="button-row justify-between">
              <Button
                onClick={() =>
                  index === 0 ? setCategory(null) : setIndex(index - 1)
                }
              >
                上一题
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  index === questions.length - 1
                    ? submit()
                    : setIndex(index + 1)
                }
              >
                {index === questions.length - 1 ? "生成整理结果" : "下一题"}
              </Button>
            </div>
            <p className="small muted">
              答案只是你填写的事实，不会自动变成结论。
            </p>
          </div>
        )}
      </div>
    </RequireProfile>
  );
}
export function EmergencyResultPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const session = useAppStore((s) => s.emergencies).find((e) => e.id === id);
  const materials = useAppStore((s) => s.materials);
  const suggestions = useAppStore((s) => s.suggestions);
  const updateEmergency = useAppStore((s) => s.updateEmergency);
  const confirmEmergency = useAppStore((s) => s.confirmEmergency);
  const [facts, setFacts] = useState("");
  const [error, setError] = useState("");
  if (!session)
    return (
      <div className="page">
        <ErrorState message="没有找到这次紧急事项记录，请重新进入问卷。" />
      </div>
    );
  const value = facts || session.factsDraft;
  const pseudoEvent = {
    id: "",
    title:
      session.factsDraft.split("\n")[0].replace("事项：", "") || "紧急事项",
    occurredAt: session.createdAt.slice(0, 10),
    people: [],
    description: session.factsDraft,
    status: "confirmed" as const,
    attention: "priority" as const,
    sourceType: "emergency" as const,
    sourceId: session.id,
    materialIds: [],
    updates: [],
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
  };
  const prospective = createSuggestions(
    requirementsForEvent(pseudoEvent),
    materials,
    suggestions,
  );
  const priority = PRIORITY[session.priority];
  return (
    <RequireProfile>
      <div className="page stack">
        <PageHeader
          title="紧急事项整理结果"
          subtitle="这是演示规则给出的处理优先级，不是法律结论。"
          back="/emergency"
        />
        {error && <ErrorState message={error} onRetry={() => setError("")} />}
        <div className="card stack">
          <SectionTitle title="事实摘要" subtitle="可以先改成你自己的话。" />
          <textarea
            className="input min-h-40"
            value={value}
            onChange={(e) => setFacts(e.target.value)}
            aria-label="事实摘要"
          />
          <Button
            onClick={() => {
              updateEmergency(session.id, { factsDraft: facts });
              toast("已保存你的修改");
            }}
          >
            保存修改
          </Button>
        </div>
        <div className="card stack">
          <SectionTitle
            title="处理优先级"
            action={<Badge tone={priority.tone}>{priority.label}</Badge>}
          />
          <ul className="stack">
            {session.priorityReasons.map((reason) => (
              <li key={reason} className="small muted">
                · {reason}
              </li>
            ))}
          </ul>
          <p className="small muted">
            这里不会给出百分比，也不会判断对错。紧急只表示时间上可能比较紧。
          </p>
        </div>
        <div className="card stack">
          <SectionTitle title="已有材料" />
          {matchingMaterials(
            { type: "contract", title: "劳动合同", reason: "" },
            materials,
          ).length > 0 && (
            <p className="notice">劳动合同已保存，无需重复处理。</p>
          )}
          {(["contract", "salary", "hr"] as MaterialType[]).flatMap((type) =>
            matchingMaterials({ type, title: "", reason: "" }, materials),
          ).length ? (
            <ul className="stack">
              {(["contract", "salary", "hr"] as MaterialType[])
                .flatMap((type) =>
                  matchingMaterials({ type, title: "", reason: "" }, materials),
                )
                .map((material) => (
                  <li key={material.id} className="small">
                    ✓ {material.name}
                    {material.status === "saved_externally"
                      ? "（已自行保存，原文件未上传）"
                      : ""}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted">材料库里还没有相关材料。</p>
          )}
        </div>
        <div className="card stack">
          <SectionTitle
            title="本次新增材料建议"
            subtitle="确认建立事件后，这些建议会进入统一待办。"
          />
          {prospective.length ? (
            <ul className="stack">
              {prospective.map((item) => (
                <li
                  key={`${item.type}-${item.title}-${item.coverageStart || ""}`}
                  className="small"
                >
                  ○ {item.title}：待保存
                  {item.coverageStart
                    ? `（${item.coverageStart} 至 ${item.coverageEnd}）`
                    : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">这次没有新增建议，已有材料覆盖了主要范围。</p>
          )}
        </div>
        <div className="card stack">
          <SectionTitle
            title="专业帮助"
            action={<MockBadge label="未接入" />}
          />
          <p className="small muted">
            当前是本地演示版本，没有连接任何律师、法务或人工咨询服务。下面的按钮只做入口示意，点击不会跳转、也不会提交任何信息。
          </p>
          <div className="button-row">
            <Button disabled>咨询专业人士（未接入）</Button>
            <Button disabled>导出给专业人士看的材料包（未接入）</Button>
          </div>
          <p className="small muted">
            如果你需要真实帮助，请自行联系你信任的律师、法律援助机构或工会。这个应用不会替你做判断，也不会替你联系任何人。
          </p>
        </div>
        {session.eventId ? (
          <>
            <div className="success">
              已建立事件，相关建议已进入待办，并同步到当天记录。
            </div>
            <SuggestionList title="本次待处理留痕" eventId={session.eventId} />
          </>
        ) : (
          <div className="card stack">
            <p className="muted">
              确认后才会生成正式事件，并进入时间线和报告。
            </p>
            <div className="button-row">
              <Button
                variant="primary"
                onClick={() => {
                  try {
                    const eventId = confirmEmergency(session.id);
                    toast("已确认并建立事件");
                    navigate(`/events/${eventId}`);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                确认并建立事件
              </Button>
              <Button to={`/materials/upload?type=notice`}>上传材料</Button>
              <Button to="/report">查看报告</Button>
            </div>
          </div>
        )}
        {/* 问卷完成后可以回到对应日期的记录 */}
        <div className="button-row">
          <Button to={`/today/${session.date ?? today()}`} variant="ghost">
            回到当天记录
          </Button>
        </div>
      </div>
    </RequireProfile>
  );
}
