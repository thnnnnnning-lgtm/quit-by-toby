import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Companion,
  Loader2,
  MoodFace,
  Pencil,
  RefreshCw,
  Send,
  ShieldAlert,
  TodayHero,
} from "../components/doodles";
import { useAppStore } from "../store/useAppStore";
import {
  aiService,
  fillClarifyAnswer,
  parsePeople,
  resolveDate,
} from "../services/ai";
import {
  requirementsForChange,
  pendingSuggestions,
  hasPendingWork,
  monthlySalaryMissing,
} from "../services/materials";
import {
  AiStatusLight,
  Button,
  Collapsible,
  LoadingState,
  MockBadge,
  Modal,
  RequireProfile,
  SectionTitle,
  useToast,
} from "../components/ui";
import { EventEditModal, MoodPicker } from "../components/cards";
import {
  DraftRow,
  EmergencyCard,
  EventPromptCard,
  SuggestionCard,
  UpdateSuggestionCard,
} from "../components/conversation";
import {
  ATTENTION,
  QUICK_TOPIC_BATCHES,
  MOODS,
  addDays,
  dateWithWeekday,
  formatDate,
  hasStatus,
  isFuture,
  today,
} from "../constants";
import type { DailyEntry, MaterialSuggestion, Mood, WorkEvent } from "../types";

type SaveState = "idle" | "saving" | "saved" | "error";
const SAVE_TEXT: Record<SaveState, string> = {
  idle: "未保存",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const relativeLabel = (date: string) =>
  date === today()
    ? "今天"
    : date === addDays(today(), -1)
      ? "昨天"
      : date === addDays(today(), 1)
        ? "明天"
        : "";
/** 顶部的一句短问候：只按当前时间挑一句，不堆文案 */
const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "夜深了，慢慢写。";
  if (h < 11) return "早上好，今天也记一句吧。";
  if (h < 14) return "中午好，随手记一下。";
  if (h < 18) return "下午好，今天还顺利吗？";
  if (h < 23) return "晚上好，把今天放下来。";
  return "夜深了，慢慢写。";
};

/** 路由入口：/today 打开今天，/today/:date 打开指定日期 */
export default function TodayPage() {
  const { date: dateParam } = useParams();
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : today();
  // 用 key 让切换日期时表单与输入框状态自然重置
  return <TodayWorkspace key={date} date={date} />;
}

function TodayWorkspace({ date }: { date: string }) {
  const navigate = useNavigate();
  const toast = useToast();

  const entries = useAppStore((s) => s.entries);
  const messages = useAppStore((s) => s.messages);
  const events = useAppStore((s) => s.events);
  const suggestions = useAppStore((s) => s.suggestions);
  const materials = useAppStore((s) => s.materials);
  const ensureEntry = useAppStore((s) => s.ensureEntry);
  const setStatusAction = useAppStore((s) => s.setStatus);
  const setDraftText = useAppStore((s) => s.setDraftText);
  const updateEntryContent = useAppStore((s) => s.updateEntryContent);
  const setSummary = useAppStore((s) => s.setSummary);
  const appendMessage = useAppStore((s) => s.appendMessage);
  const setMessageStatus = useAppStore((s) => s.setMessageStatus);
  const removeMessage = useAppStore((s) => s.removeMessage);
  const addDraft = useAppStore((s) => s.addDraft);
  const suggest = useAppStore((s) => s.suggest);
  const consume = useAppStore((s) => s.consumeMockConfig);
  const ai = useAppStore((s) => s.ai);
  const setAI = useAppStore((s) => s.setAI);
  const salaryReminderEnabled = useAppStore((s) => s.salaryReminderEnabled);

  const entry = entries.find((e) => e.date === date);
  const conversationId = entry?.conversationId ?? `conv-${date}`;
  const dayMessages = useMemo(
    () => messages.filter((m) => m.dailyEntryId === entry?.id),
    [messages, entry?.id],
  );

  /* ---------- 今天的状态：心情是唯一的主入口 ---------- */
  const [mood, setMood] = useState<Mood | null>(entry?.mood ?? null);
  const [saveState, setSaveState] = useState<SaveState>(
    entry && (hasStatus(entry) || entry.content) ? "saved" : "idle",
  );
  const [summaryState, setSummaryState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  /** 保存成功的一次性反馈：让陪伴角色轻轻动一下，不持续动画 */
  const [justSaved, setJustSaved] = useState(false);
  /** 每月工资提醒：点「稍后」只影响本次打开，不写入数据 */
  const [salaryReminderHidden, setSalaryReminderHidden] = useState(false);
  /** 快捷话题当前是哪一批：点「换一批」循环切换，不打扰已写下的内容 */
  const [topicBatch, setTopicBatch] = useState(0);
  const quickTopics =
    QUICK_TOPIC_BATCHES[topicBatch % QUICK_TOPIC_BATCHES.length];

  const dirty = (entry?.mood ?? null) !== mood;

  // 快速打卡弹窗等其他入口保存了状态后，把心情与保存状态同步到本页
  useEffect(() => {
    if (!entry) return;
    if (entry.mood && entry.mood !== mood) setMood(entry.mood);
    if (entry.mood && saveState === "idle") setSaveState("saved");
    // 只在 entry.mood 被外部改变时同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.mood]);

  const generateSummary = async (
    entryId: string,
    userText: string,
    status: { mood?: Mood },
  ) => {
    setSummaryState("loading");
    try {
      const summary = await aiService.summarize(
        { date, ...status },
        userText,
        consume(),
        ai,
        setAI,
      );
      setSummary(entryId, summary);
      setSummaryState("idle");
    } catch {
      setSummaryState("error");
    }
  };

  /** 普通日子的最短路径：选一个心情 → 保存 → 完成 */
  const saveToday = async () => {
    if (!mood) return;
    setSaveState("saving");
    try {
      const id = setStatusAction({ date, mood });
      setSaveState("saved");
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2600);
      toast("今天已经记下来了");
      await generateSummary(id, entry?.content ?? "", { mood });
    } catch (e) {
      setSaveState("error");
      toast((e as Error).message);
    }
  };

  /* ---------- 工作记录与 AI 对话 ---------- */
  const [text, setText] = useState(entry?.draftText ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<WorkEvent | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [contentDraft, setContentDraft] = useState("");
  const composing = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  /**
   * 输入框草稿防抖 + 页面卸载/失焦强制落盘：
   * 连续打字时用 150ms 防抖避免每次按键都触发 localStorage 全量序列化；
   * 同时监听 beforeunload / pagehide 与组件卸载，保证哪怕输完立刻刷新也不丢一字。
   */
  const draftTimerRef = useRef<number | null>(null);
  const pendingDraftRef = useRef<string | null>(null);

  const flushDraft = useCallback(() => {
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (pendingDraftRef.current === null) return;
    const val = pendingDraftRef.current;
    pendingDraftRef.current = null;
    const currentEntry = useAppStore
      .getState()
      .entries.find((e) => e.date === date);
    if (currentEntry) {
      setDraftText(currentEntry.id, val);
    } else if (val) {
      setDraftText(ensureEntry(date), val);
    }
  }, [date, ensureEntry, setDraftText]);

  const scheduleDraftSave = useCallback(
    (nextValue: string) => {
      pendingDraftRef.current = nextValue;
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
      }
      draftTimerRef.current = window.setTimeout(() => {
        flushDraft();
      }, 150);
    },
    [flushDraft],
  );

  useEffect(() => {
    const onUnload = () => flushDraft();
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      flushDraft();
    };
  }, [flushDraft]);

  // 打开历史日期时直接定位到最新消息；之后只在自己发送后跟随
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, []);

  const lastMessage = dayMessages[dayMessages.length - 1];
  const awaiting =
    lastMessage?.role === "assistant" ? lastMessage.clarify : undefined;

  const dayEvents = entry
    ? entry.eventIds
        .map((id) => events.find((e) => e.id === id))
        .filter((e): e is WorkEvent => Boolean(e))
    : [];
  const drafts = dayEvents.filter((e) => e.status === "draft");
  const confirmed = dayEvents.filter((e) => e.status === "confirmed");
  const daySuggestions = entry
    ? entry.suggestionIds
        .map((id) => suggestions.find((s) => s.id === id))
        .filter((s): s is MaterialSuggestion => Boolean(s))
    : [];
  const openSuggestions = pendingSuggestions(daySuggestions);
  // 每月提醒：只看今天，本月工资记录保存后自动消失
  const salaryReminder =
    salaryReminderEnabled &&
    !salaryReminderHidden &&
    date === today() &&
    monthlySalaryMissing(materials, date);

  const send = async (raw: string) => {
    const value = raw.trim();
    if (!value || sending) return;
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    pendingDraftRef.current = null;
    setSending(true);
    setError("");
    setText("");
    const entryId = ensureEntry(date);
    setDraftText(entryId, "");
    const userMessageId = appendMessage({
      role: "user",
      content: value,
      conversationId,
      dailyEntryId: entryId,
      status: "sending",
    });
    const cfg = consume();
    try {
      // 上一条 AI 消息在补问时间 → 这条用户输入用于补全候选事件
      if (awaiting) {
        // 有 DeepSeek 时由它把补充回答换算成日期与人物（能理解“上周五”这类说法）；
        // 失败或未接入时回退本地解析
        const resolved = ai?.apiKey
          ? await fillClarifyAnswer(ai, awaiting, value, date).catch(
              () => null,
            )
          : null;
        const occurredAt = resolved?.occurredAt ?? resolveDate(value, date) ?? date;
        const people = resolved?.people?.length
          ? resolved.people
          : parsePeople(value);
        const draftId = addDraft({
          ...awaiting,
          occurredAt,
          people: Array.from(new Set([...awaiting.people, ...people])),
          // 用户的补充也要留在描述里，不能丢
          description: `${awaiting.description}\n补充：${value}`,
          sourceId: entryId,
        });
        setMessageStatus(userMessageId, "sent");
        const reqs = requirementsForChange(
          `${entry?.content ?? ""} ${value}`,
          entryId,
          date,
        );
        const suggestionIds = reqs.length ? suggest(reqs, entryId) : [];
        appendMessage({
          role: "assistant",
          content: "已经整理好了，放在「今日整理」里，需要的时候确认就好。",
          conversationId,
          dailyEntryId: entryId,
          suggestionIds,
          candidateEventIds: [draftId],
        });
      } else {
        const context = {
          date,
          entryId,
          userText: [entry?.content, value].filter(Boolean).join("\n"),
          confirmedEvents: confirmed,
          draftTitles: drafts.map((d) => d.title),
          materials,
        };
        const reply = await aiService.reply(value, context, cfg, ai, setAI);
        setMessageStatus(userMessageId, "sent");
        const suggestionIds = reply.requirements
          ? suggest(reply.requirements, entryId)
          : [];
        const candidateEventIds = reply.candidateEvent
          ? [addDraft({ ...reply.candidateEvent, sourceId: entryId })]
          : [];
        appendMessage({
          role: "assistant",
          content: reply.content,
          conversationId,
          dailyEntryId: entryId,
          suggestionIds,
          // 一般候选只进「今日整理」，不在这里打扰
          candidateEventIds: reply.noteworthy ? candidateEventIds : [],
          emergency: reply.emergency,
          updateSuggestionEventId: reply.updateSuggestionEventId,
          updateSuggestionContent: reply.updateSuggestionEventId
            ? value
            : undefined,
          // 必须带上：下一条用户消息要用来补全这个候选事件
          clarify: reply.clarify,
          // AI 调用失败或踩线时，明确标注这条是本地模板回复
          fallback: reply.fallback,
        });
      }
      // 已发送的内容立即算作已保存
      setSaveState("saved");
      // 继续聊天可以更新 AI 总结，但不会改写已确认事件
      await generateSummary(
        entryId,
        [entry?.content, value].filter(Boolean).join("\n"),
        { mood: entry?.mood },
      );
      requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }),
      );
    } catch (e) {
      // 失败时保留这条输入，标记为待重试
      setMessageStatus(userMessageId, "failed");
      setSaveState("error");
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const retry = async (messageId: string, content: string) => {
    removeMessage(messageId);
    await send(content);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    // 中文输入法组合期间的回车用于选词，不能当成发送
    if (composing.current || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void send(text);
  };

  const shiftDate = (days: number) => {
    const next = addDays(date, days);
    if (isFuture(next)) return;
    flushDraft();
    navigate(`/today/${next}`);
  };

  const openEditContent = () => {
    setContentDraft(entry?.content ?? "");
    setContentModalOpen(true);
  };

  return (
    <RequireProfile>
      <div className="page-wide">
        {/*
          顶部插画：占移动端首屏约 20%，不占满首屏，也不挡下面的主要操作。
          下面的日期与问候才是信息起点。
        */}
        <div className="hero-scene mb-1 h-[170px] w-full sm:h-[190px]">
          <TodayHero />
        </div>
        <p className="hand mb-4 text-center text-sm text-[var(--color-muted)]">
          {date === today() ? greeting() : `回到 ${dateWithWeekday(date)}`}
        </p>

        {/* 日期、切换、保存状态、当天已确认事件 */}
        <header className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="kbd-focus tap-square rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-fill)]"
              onClick={() => shiftDate(-1)}
              aria-label="前一天"
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <h1 className="leading-tight">{dateWithWeekday(date)}</h1>
              <p className="faint">
                {relativeLabel(date) || "历史记录"}
                {dirty ? " · 状态有未保存的修改" : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={isFuture(addDays(date, 1))}
              className="kbd-focus tap-square rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-fill)] disabled:opacity-40"
              onClick={() => shiftDate(1)}
              aria-label="后一天"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              role="status"
              className={`badge ${
                saveState === "saved"
                  ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                  : saveState === "error"
                    ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                    : "bg-[var(--color-fill-2)] text-[var(--color-body)]"
              }`}
            >
              {saveState === "saving" && (
                <Loader2 size={12} className="animate-spin" />
              )}
              {saveState === "saved" && <Check size={12} />}
              {saveState === "error" && <AlertCircle size={12} />}
              {SAVE_TEXT[saveState]}
            </span>
            <label className="sr-only" htmlFor="jump-date">
              跳到指定日期
            </label>
            <input
              id="jump-date"
              type="date"
              className="input w-auto"
              value={date}
              max={today()}
              onChange={(e) => {
                if (e.target.value) {
                  flushDraft();
                  navigate(`/today/${e.target.value}`);
                }
              }}
            />
            {/* 紧急入口放在顶部：时间紧的事情不用滚到页面底部才能找到 */}
            <Button
              size="sm"
              variant="danger"
              to={`/emergency?date=${date}`}
              className="tap"
            >
              <ShieldAlert size={15} />
              紧急整理
            </Button>
            <Button size="sm" onClick={() => setEventsOpen(true)}>
              <CalendarDays size={15} />
              已确认事件
              {confirmed.length > 0 ? `（${confirmed.length}）` : ""}
            </Button>
          </div>
        </header>

        {/* 移动端：今日摘要与今日整理都是折叠面板 */}
        <div className="mb-4 stack lg:hidden">
          <Collapsible title="今日摘要">
            <DaySummary
              entry={entry}
              drafts={drafts}
              confirmed={confirmed}
              suggestions={daySuggestions}
              summaryState={summaryState}
              onRetrySummary={() =>
                entry && generateSummary(entry.id, entry.content, entry)
              }
              onEditContent={openEditContent}
            />
          </Collapsible>
          <Collapsible
            title={`今日整理${drafts.length ? `（待确认 ${drafts.length}）` : ""}`}
            defaultOpen={false}
          >
            <DayOrganize
              drafts={drafts}
              confirmed={confirmed}
              onEdit={setEditing}
            />
          </Collapsible>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="stack">
            {/* 今天的状态：心情是主入口，选完就能保存 */}
            <section className="panel stack" aria-label="今天的状态">
              <SectionTitle
                title="今天的状态"
                subtitle="选一个心情就能保存，也可以直接写一句话。"
                action={
                  ai.apiKey ? (
                    <AiStatusLight status={ai.status} />
                  ) : (
                    <MockBadge label="演示模式" />
                  )
                }
              />
              <MoodPicker value={mood} onChange={setMood} />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  disabled={!mood || saveState === "saving"}
                  onClick={saveToday}
                >
                  {saveState === "saving" ? "保存中…" : "保存今天"}
                </Button>
                {justSaved ? (
                  <span className="flex items-center gap-1.5">
                    <Companion
                      size={30}
                      simple
                      className="animate-pop motion-reduce:animate-none"
                    />
                    <span className="hand text-sm text-[var(--color-ink)]">
                      今天已经记下来了。
                    </span>
                  </span>
                ) : !mood ? (
                  <p className="small muted">
                    先选一个心情，或者直接在下面写一句。
                  </p>
                ) : null}
              </div>
              {saveState === "error" && (
                <p className="error">
                  没有保存成功，你的选择还在页面上，可以直接重试。
                </p>
              )}
            </section>

            {/* 工作记录与 AI 对话 */}
            <section className="panel stack" aria-label="工作记录与 AI 对话">
              <SectionTitle
                title="工作记录与 AI 对话"
                subtitle="想到什么就说什么，可以分几次慢慢写。"
                action={
                  ai.apiKey ? <AiStatusLight status={ai.status} /> : <MockBadge />
                }
              />

              {dayMessages.length === 0 && (
                <div className="stack">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <p className="muted">
                      想到什么就写一句，写不下去也可以只选一个心情。
                    </p>
                    {/* 只在还没开始记录时出现，换一批新的说法，不用自己组织语言 */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() =>
                        setTopicBatch((i) => (i + 1) % QUICK_TOPIC_BATCHES.length)
                      }
                      aria-label="换一批快捷话题"
                    >
                      <RefreshCw size={14} />
                      换一批
                    </Button>
                  </div>
                  <div
                    className="flex flex-wrap gap-2"
                    data-testid="quick-topics"
                  >
                    {quickTopics.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        className="chip kbd-focus"
                        onClick={() => void send(topic)}
                        disabled={sending}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="stack" data-testid="conversation">
                {dayMessages.map((message, index) => {
                  const isLast = index === dayMessages.length - 1;
                  return (
                    <div
                      key={message.id}
                      ref={isLast ? bottomRef : undefined}
                      className="stack-sm"
                    >
                      {message.role === "user" ? (
                        <div className="bubble-user max-w-[85%] whitespace-pre-line">
                          {message.content}
                          {message.status === "failed" && (
                            <span className="mt-1 block text-xs text-[var(--color-danger)]">
                              发送失败，未收到回应
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          {/* 助手消息带一个小小的陪伴角色头像 */}
                          <Companion size={28} simple className="mt-0.5 shrink-0" />
                          <div className="bubble-assistant min-w-0 max-w-[92%] whitespace-pre-line">
                            {message.content}
                          </div>
                        </div>
                      )}
                      {message.status === "failed" && (
                        <div className="button-row">
                          <Button
                            size="sm"
                            onClick={() => void retry(message.id, message.content)}
                          >
                            <RefreshCw size={14} />
                            重试这条
                          </Button>
                        </div>
                      )}
                      {message.role === "assistant" && message.fallback && (
                        <p className="faint pl-9" data-testid="fallback-note">
                          本地模拟回复（未采用 AI 输出），可在「我的 →
                          AI 接入」检查配置
                        </p>
                      )}
                      {message.emergency && <EmergencyCard date={date} />}
                      {message.candidateEventIds?.map((id) => {
                        const event = events.find((e) => e.id === id);
                        return event ? (
                          <EventPromptCard key={id} event={event} />
                        ) : null;
                      })}
                      {message.suggestionIds?.map((id) => {
                        const suggestion = suggestions.find((s) => s.id === id);
                        return suggestion ? (
                          <SuggestionCard key={id} suggestion={suggestion} />
                        ) : null;
                      })}
                      {message.updateSuggestionEventId &&
                        (() => {
                          const event = events.find(
                            (e) => e.id === message.updateSuggestionEventId,
                          );
                          if (!event) return null;
                          // 取触发本条建议的用户补充原文，避免把 AI 自己的提示话术误存进事件进展
                          const userAddition =
                            message.updateSuggestionContent ||
                            dayMessages
                              .slice(0, index)
                              .reverse()
                              .find((m) => m.role === "user")?.content ||
                            message.content;
                          return (
                            <UpdateSuggestionCard
                              event={event}
                              content={userAddition}
                            />
                          );
                        })()}
                    </div>
                  );
                })}
                {sending && <LoadingState label="正在整理…" />}
              </div>

              {error && (
                <div className="error stack">
                  <p>{error}</p>
                  <p className="small">
                    这条输入已经保留在对话里，可以点「重试这条」再发一次。
                  </p>
                </div>
              )}

              {/* 输入框：像一页干净的日记纸，移动端吸附在底部导航之上 */}
              <div className="composer-dock">
                <form
                  className="paper-grid stack-sm border-[1.5px] border-[var(--color-stroke)] p-2"
                  style={{
                    borderRadius: "15px 13px 16px 12px / 13px 16px 12px 15px",
                  }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(text);
                  }}
                >
                  <label className="sr-only" htmlFor="message">
                    记录今天的工作
                  </label>
                  <textarea
                    id="message"
                    className="min-h-16 w-full resize-none bg-transparent px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)]"
                    value={text}
                    onChange={(e) => {
                      const val = e.target.value;
                      setText(val);
                      // 防抖保存未发送的草稿，并在卸载/刷新时自动同步落盘
                      scheduleDraftSave(val);
                    }}
                    onBlur={flushDraft}
                    onKeyDown={onKeyDown}
                    onCompositionStart={() => {
                      composing.current = true;
                    }}
                    onCompositionEnd={() => {
                      composing.current = false;
                    }}
                    placeholder="今天工作怎么样？随便记一句。"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="faint">Enter 发送 · Shift + Enter 换行</span>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={sending || !text.trim()}
                    >
                      <Send size={14} />
                      {sending ? "发送中" : "发送"}
                    </Button>
                  </div>
                </form>
              </div>
              <p className="faint">
                情绪和日常状态可以放心说。这里只做整理，不提供结论。
              </p>
            </section>

            {/* 工作留痕：材料收集不以确认事件为前提 */}
            <section
              className="panel stack"
              aria-label="工作留痕"
              data-testid="day-suggestions"
            >
              <SectionTitle
                title="工作留痕"
                subtitle="只列出确实缺失的部分。可以先保存材料，不必先确认事件。"
                action={
                  <Button to="/materials/upload" variant="ghost" size="sm">
                    直接上传
                  </Button>
                }
              />
              {/* 每月工资提醒：本月工资记录保存后自动消失 */}
              {salaryReminder && (
                <div className="note stack-sm" data-testid="salary-reminder">
                  <p className="font-medium text-[var(--color-ink)]">
                    {Number(date.slice(5, 7))} 月的工资记录还没保存
                  </p>
                  <p className="small text-[var(--color-muted)]">
                    每月提醒一次：把本月工资记录保存下来，之后核对更方便。保存后这条提醒会自动消失。
                  </p>
                  <div className="button-row">
                    <Button
                      size="sm"
                      variant="primary"
                      className="tap"
                      to="/materials/upload?type=salary"
                    >
                      上传本月工资
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="tap"
                      onClick={() => setSalaryReminderHidden(true)}
                    >
                      稍后
                    </Button>
                  </div>
                </div>
              )}
              {daySuggestions.length ? (
                <div className="stack-sm">
                  {daySuggestions.map((s) => (
                    <SuggestionCard key={s.id} suggestion={s} />
                  ))}
                </div>
              ) : (
                <p className="muted">今天暂无特别需要补充的材料。</p>
              )}
              {hasPendingWork(daySuggestions) ? (
                <p className="faint">
                  有 {openSuggestions.length} 项待处理，不处理也可以直接结束今天的记录。
                </p>
              ) : (
                <p className="faint">
                  今天没有需要补充的材料，正常记录就好。
                </p>
              )}
            </section>
          </div>

          {/* 桌面端：右侧可折叠摘要栏（今日摘要 + 今日整理） */}
          <aside className="no-print hidden lg:block">
            <div className="sticky top-6 stack">
              <Collapsible title="今日摘要" defaultOpen>
                <DaySummary
                  entry={entry}
                  drafts={drafts}
                  confirmed={confirmed}
                  suggestions={daySuggestions}
                  summaryState={summaryState}
                  onRetrySummary={() =>
                    entry && generateSummary(entry.id, entry.content, entry)
                  }
                  onEditContent={openEditContent}
                />
              </Collapsible>
              <Collapsible
                title={`今日整理${drafts.length ? `（待确认 ${drafts.length}）` : ""}`}
              >
                <DayOrganize
                  drafts={drafts}
                  confirmed={confirmed}
                  onEdit={setEditing}
                />
              </Collapsible>
            </div>
          </aside>
        </div>
      </div>

      {editing && (
        <EventEditModal event={editing} onClose={() => setEditing(null)} />
      )}
      {contentModalOpen && (
        <Modal
          title={`${formatDate(date)} 日记原文`}
          onClose={() => setContentModalOpen(false)}
        >
          <div className="stack">
            <p className="small muted">
              当天在对话里发送的每句话都会归档到这里。你可以直接修改错别字或补充记录，不会影响已确认的事件。
            </p>
            <textarea
              aria-label="日记原文内容"
              className="input min-h-36"
              value={contentDraft}
              onChange={(e) => setContentDraft(e.target.value)}
              placeholder="写下今天想保留的原文记录…"
            />
            <div className="button-row justify-end">
              <Button onClick={() => setContentModalOpen(false)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const id = ensureEntry(date);
                  updateEntryContent(id, contentDraft);
                  setSaveState("saved");
                  setContentModalOpen(false);
                  toast("日记原文已更新");
                }}
              >
                保存原文
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {eventsOpen && (
        <Modal
          title={`${formatDate(date)} 已确认事件`}
          onClose={() => setEventsOpen(false)}
        >
          <div className="stack">
            {confirmed.length ? (
              confirmed.map((event) => (
                <div key={event.id} className="list-row">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="small muted">
                      {ATTENTION[event.attention]} ·{" "}
                      {event.people.join("、") || "未填写人物"}
                    </p>
                  </div>
                  <Button size="sm" to={`/events/${event.id}`}>
                    查看
                  </Button>
                </div>
              ))
            ) : (
              <p className="muted">
                这一天还没有已确认的事件。确认对话里的卡片后会出现在这里。
              </p>
            )}
          </div>
        </Modal>
      )}
    </RequireProfile>
  );
}

/** 今日整理：一般候选安静地待在这里，不打断记录 */
function DayOrganize({
  drafts,
  confirmed,
  onEdit,
}: {
  drafts: WorkEvent[];
  confirmed: WorkEvent[];
  onEdit: (event: WorkEvent) => void;
}) {
  return (
    <div className="stack-sm" data-testid="day-organize">
      {drafts.length ? (
        <>
          <p className="small muted">
            这些是从今天的记录里整理出来的，确认后才会进入回顾和报告。
          </p>
          <div className="stack-sm">
            {drafts.map((d) => (
              <DraftRow key={d.id} event={d} onEdit={() => onEdit(d)} />
            ))}
          </div>
        </>
      ) : (
        <p className="muted">今天没有待确认的整理结果。</p>
      )}
      {confirmed.length > 0 && (
        <div className="divider pt-3">
          <p className="faint">今天已记入回顾</p>
          <ul className="stack-sm">
            {confirmed.map((c) => (
              <li key={c.id} className="small">
                <span className="mr-1 text-[var(--color-success)]">✓</span>
                {c.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DaySummary({
  entry,
  drafts,
  confirmed,
  suggestions,
  summaryState,
  onRetrySummary,
  onEditContent,
}: {
  entry?: DailyEntry;
  drafts: WorkEvent[];
  confirmed: WorkEvent[];
  suggestions: MaterialSuggestion[];
  summaryState: "idle" | "loading" | "error";
  onRetrySummary: () => void;
  onEditContent: () => void;
}) {
  const pending = pendingSuggestions(suggestions);
  return (
    <div className="stack" data-testid="today-summary">
      <div>
        <p className="faint">今天的状态</p>
        {entry && hasStatus(entry) ? (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--color-body)]">
            <MoodFace mood={entry.mood!} size={20} />
            {MOODS[entry.mood!].label}
          </p>
        ) : (
          <p className="muted">还没选心情。</p>
        )}
      </div>
      <div className="divider pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="faint">日记原文</p>
          <Button size="sm" variant="ghost" onClick={onEditContent}>
            <Pencil size={13} />
            编辑原文
          </Button>
        </div>
        {entry?.content ? (
          <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed">
            {entry.content}
          </p>
        ) : (
          <p className="muted">还没有文字记录。</p>
        )}
      </div>
      <div className="divider pt-3">
        <p className="faint">AI 今日总结</p>
        {summaryState === "loading" ? (
          <LoadingState label="正在生成总结…" />
        ) : summaryState === "error" ? (
          <div className="stack-sm">
            <p className="error">总结生成失败，已保存的记录不受影响。</p>
            <Button size="sm" onClick={onRetrySummary}>
              重新生成
            </Button>
          </div>
        ) : (
          <p className="text-sm leading-relaxed">
            {entry?.aiSummary || "还没有总结。保存今天或聊几句就会生成。"}
          </p>
        )}
        <p className="faint mt-1">总结与你的原文分开保存，可以随时在回顾里对照。</p>
      </div>
      <div className="divider pt-3">
        <p className="faint">待确认的整理结果</p>
        {drafts.length ? (
          <ul className="stack-sm">
            {drafts.map((d) => (
              <li key={d.id} className="text-sm">
                ○ {d.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">没有待确认的内容。</p>
        )}
      </div>
      <div className="divider pt-3">
        <p className="faint">已记入回顾</p>
        {confirmed.length ? (
          <ul className="stack-sm">
            {confirmed.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="mr-1 text-[var(--color-success)]">✓</span>
                {c.title}
                <span className="faint ml-1">{ATTENTION[c.attention]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">还没有已确认的事件。</p>
        )}
      </div>
      <div className="divider pt-3">
        <p className="faint">待补充材料</p>
        {pending.length ? (
          <ul className="stack-sm">
            {pending.map((s) => (
              <li key={s.id} className="text-sm">
                {s.priority ? (
                  <span className="mr-1 text-[var(--color-warning)]">!</span>
                ) : (
                  "○ "
                )}
                {s.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">今天暂无特别需要补充的材料。</p>
        )}
      </div>
      {entry && (
        <p className="faint">
          本条记录创建于 {formatDate(entry.createdAt.slice(0, 10))}
        </p>
      )}
    </div>
  );
}
