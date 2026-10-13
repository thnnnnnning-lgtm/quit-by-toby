import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore, STORAGE_KEY } from "../store/useAppStore";
import {
  AiStatusLight,
  Button,
  ConfirmDialog,
  Modal,
  PageHeader,
  RequireProfile,
  SectionTitle,
  useToast,
} from "../components/ui";
import { MaterialCard, SuggestionList } from "../components/cards";
import { EMPLOYMENT_STATUSES, now } from "../constants";
import { downloadBlob } from "../services/files";
import { testDeepSeek } from "../services/deepseek";
import { buildBackup, parseBackup } from "../services/backup";
import {
  DEEPSEEK_MODELS,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_CHECKIN_HOUR,
  type AppData,
  type EmploymentStatus,
} from "../types";
export default function ProfilePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useAppStore((s) => s.profile);
  const materials = useAppStore((s) => s.materials);
  const notificationEnabled = useAppStore((s) => s.notificationEnabled);
  const salaryReminderEnabled = useAppStore((s) => s.salaryReminderEnabled);
  const checkInHour = useAppStore((s) => s.checkInHour);
  const ai = useAppStore((s) => s.ai);
  const mockConfig = useAppStore((s) => s.mockConfig);
  const saveProfile = useAppStore((s) => s.saveProfile);
  const setNotification = useAppStore((s) => s.setNotification);
  const setSalaryReminder = useAppStore((s) => s.setSalaryReminder);
  const setCheckInHour = useAppStore((s) => s.setCheckInHour);
  const setAI = useAppStore((s) => s.setAI);
  const setMockConfig = useAppStore((s) => s.setMockConfig);
  const loadDemo = useAppStore((s) => s.loadDemo);
  const clearData = useAppStore((s) => s.clearData);
  const importData = useAppStore((s) => s.importData);
  const [aiForm, setAiForm] = useState({
    apiKey: ai.apiKey,
    model: ai.model || DEFAULT_AI_MODEL,
    baseUrl: ai.baseUrl || DEFAULT_AI_BASE_URL,
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    employmentStatus: (profile?.employmentStatus || "在职") as EmploymentStatus,
    company: profile?.company || "",
    role: profile?.role || "",
    startDate: profile?.startDate || "",
    city: profile?.city || "",
  });
  const [clearOpen, setClearOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<AppData | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = materials.filter((m) =>
    ["contract", "offer", "jd", "salary"].includes(m.type),
  );
  const exportData = () => {
    // 只导出白名单里的数据字段。旧实现是展开整个 store，
    // 会把 ai.apiKey 一起写进下载的 JSON——等于让用户的密钥明文落盘。
    const backup = buildBackup(useAppStore.getState());
    downloadBlob(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      `职场日记-备份-${now().slice(0, 10)}.json`,
    );
    toast("已导出备份（不含原始文件与 API Key）");
  };

  /** 选文件 → 解析 → 弹确认；解析失败（不是 JSON / 结构不对）直接提示，不写入任何数据 */
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空 value，允许连续选择同一个文件
    e.target.value = "";
    if (!file) return;
    try {
      const data = parseBackup(await file.text());
      setPendingImport(data);
    } catch (err) {
      toast((err as Error).message);
    }
  };
  /** 保存 AI 配置并发起一次连接检测：成功绿灯、失败红灯 */
  const saveAndTestAI = async () => {
    const next = {
      apiKey: aiForm.apiKey.trim(),
      model: aiForm.model.trim() || DEFAULT_AI_MODEL,
      baseUrl: aiForm.baseUrl.trim() || DEFAULT_AI_BASE_URL,
    };
    setAiForm(next);
    if (!next.apiKey) {
      setAI({ ...next, status: "unset", lastError: undefined });
      toast("未填写 API Key，继续使用本地模拟模式");
      return;
    }
    setAI({ ...next, status: "testing", lastError: undefined });
    try {
      await testDeepSeek({ ...ai, ...next });
      setAI({ status: "ok", lastCheckedAt: now(), lastError: undefined });
      toast("连接成功，对话与总结将使用 DeepSeek");
    } catch (e) {
      setAI({
        status: "error",
        lastError: (e as Error).message,
        lastCheckedAt: now(),
      });
    }
  };
  const clearAI = () => {
    setAI({ apiKey: "", status: "unset", lastError: undefined });
    setAiForm((f) => ({ ...f, apiKey: "" }));
    toast("已清除 API Key，回到本地模拟模式");
  };
  return (
    <RequireProfile>
      <div className="page stack">
        <PageHeader title="我的" subtitle="这里管理你的工作档案和本地数据。" />
        <div className="card stack">
          <SectionTitle
            title="工作档案"
            action={
              <Button
                variant="ghost"
                onClick={() => {
                  setForm({
                    employmentStatus: (profile?.employmentStatus ||
                      "在职") as EmploymentStatus,
                    company: profile?.company || "",
                    role: profile?.role || "",
                    startDate: profile?.startDate || "",
                    city: profile?.city || "",
                  });
                  setEditing(true);
                }}
              >
                编辑
              </Button>
            }
          />
          {profile ? (
            <dl className="grid-2 text-sm">
              <div>
                <dt className="muted">工作状态</dt>
                <dd>{profile.employmentStatus}</dd>
              </div>
              <div>
                <dt className="muted">公司</dt>
                <dd>{profile.company || "未填写"}</dd>
              </div>
              <div>
                <dt className="muted">岗位</dt>
                <dd>{profile.role || "未填写"}</dd>
              </div>
              <div>
                <dt className="muted">入职日期</dt>
                <dd>{profile.startDate || "未填写"}</dd>
              </div>
              <div>
                <dt className="muted">工作城市</dt>
                <dd>{profile.city || "未填写"}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">还没有工作档案。</p>
          )}
        </div>
        <div className="card stack">
          <SectionTitle
            title="基础材料"
            action={
              <Button to="/materials/upload" variant="ghost">
                上传材料
              </Button>
            }
          />
          {base.length ? (
            base.map((material) => (
              <MaterialCard key={material.id} material={material} />
            ))
          ) : (
            <p className="muted">还没有基础材料，之后可以随时补充。</p>
          )}
        </div>
        <SuggestionList title="待处理留痕" />
        <div className="card stack">
          <SectionTitle title="隐私与数据说明" />
          <ul className="stack muted small">
            <li>· AI 整理结果需要你本人确认，不会自动变成事实。</li>
            <li>· 产品只做记录与整理，不提供法律结论。</li>
            <li>· 本演示的数据仅保存在当前浏览器中，不会上传服务器。</li>
            <li>· 原始文件不会被修改，模拟提取摘要与原件分开保存。</li>
          </ul>
          <Button variant="ghost" onClick={() => setPrivacy(true)}>
            查看完整说明
          </Button>
        </div>
        <div className="card stack">
          <SectionTitle title="通知偏好" />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notificationEnabled}
              onChange={(e) => {
                setNotification(e.target.checked);
                toast("已保存应用内偏好");
              }}
            />
            在应用内提醒我记录今天
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={salaryReminderEnabled}
              onChange={(e) => {
                setSalaryReminder(e.target.checked);
                toast(e.target.checked ? "已开启每月工资提醒" : "已关闭每月工资提醒");
              }}
            />
            每月提醒我保存工资记录
          </label>
          <div className="field max-w-xs">
            <label className="label" htmlFor="checkin-hour">
              下班打卡提醒时间
            </label>
            <select
              id="checkin-hour"
              className="input"
              value={checkInHour ?? DEFAULT_CHECKIN_HOUR}
              onChange={(e) => {
                setCheckInHour(Number(e.target.value));
                toast("已更新提醒时间");
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00 之后
                </option>
              ))}
            </select>
            <p className="small muted">
              当天还没有记录时，这个时间之后打开网站会先弹出「快速打卡」；记过当天就不会再出现，第二天到点才会再提醒。
            </p>
          </div>
          <p className="small muted">
            目前未接入系统通知，这里只保存应用内偏好，不会产生真实推送。
          </p>
        </div>
        <div className="card stack" data-testid="ai-settings">
          <SectionTitle
            title="AI 接入（DeepSeek）"
            subtitle="填入 API Key 后，对话与今日总结会调用真实模型；不填则继续使用本地模拟。"
            action={<AiStatusLight status={ai.status} />}
          />
          <div className="field">
            <label className="label" htmlFor="ai-key">
              API Key
            </label>
            <input
              id="ai-key"
              type="password"
              className="input"
              value={aiForm.apiKey}
              onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
              placeholder="sk-…（只保存在本机浏览器）"
              autoComplete="off"
            />
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="ai-model">
                模型
              </label>
              <input
                id="ai-model"
                className="input"
                list="deepseek-models"
                value={aiForm.model}
                onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                placeholder={DEFAULT_AI_MODEL}
              />
              {/* 接口支持的模型名，点开可选，也可以自己填 */}
              <datalist id="deepseek-models">
                {DEEPSEEK_MODELS.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label className="label" htmlFor="ai-base">
                接口地址
              </label>
              <input
                id="ai-base"
                className="input"
                value={aiForm.baseUrl}
                onChange={(e) =>
                  setAiForm({ ...aiForm, baseUrl: e.target.value })
                }
                placeholder={DEFAULT_AI_BASE_URL}
              />
            </div>
          </div>
          <div className="button-row">
            <Button
              variant="primary"
              onClick={saveAndTestAI}
              disabled={ai.status === "testing"}
            >
              {ai.status === "testing" ? "正在检测…" : "保存并测试连接"}
            </Button>
            {ai.apiKey && (
              <Button variant="ghost" onClick={clearAI}>
                清除 Key
              </Button>
            )}
          </div>
          {ai.status === "error" && ai.lastError && (
            <p className="error">{ai.lastError}</p>
          )}
          {ai.lastCheckedAt && ai.status !== "testing" && (
            <p className="faint">
              上次检测：
              {new Date(ai.lastCheckedAt).toLocaleString("zh-CN")}
            </p>
          )}
          <p className="small muted">
            Key 只保存在本机浏览器的 localStorage 中，不会上传到任何服务器；正式产品需要改为经由服务端代理调用。不填写时，AI
            能力使用本地模拟。
          </p>
        </div>
        <div className="card stack">
          <SectionTitle title="演示设置" subtitle="用于查看加载与失败状态。" />
          <div className="field">
            <label className="label" htmlFor="delay">
              模拟服务延迟（毫秒）
            </label>
            <input
              id="delay"
              type="number"
              min={0}
              max={5000}
              className="input"
              value={mockConfig.delayMs}
              onChange={(e) =>
                setMockConfig({ delayMs: Number(e.target.value) || 0 })
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mockConfig.failNext}
              onChange={(e) => setMockConfig({ failNext: e.target.checked })}
            />
            下一次模拟服务请求失败（可查看重试提示）
          </label>
        </div>
        <div className="card stack">
          <SectionTitle title="数据管理" />
          <div className="button-row">
            <Button onClick={exportData}>导出备份</Button>
            <Button onClick={() => importInputRef.current?.click()}>
              导入备份
            </Button>
            <Button onClick={() => setResetOpen(true)}>重置演示故事</Button>
            <Button variant="danger" onClick={() => setClearOpen(true)}>
              清空本地数据
            </Button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="选择要导入的备份文件"
            onChange={onImportFile}
          />
          <p className="small muted">
            备份只包含记录数据，不含原始文件与 API Key；导入会覆盖当前浏览器里的全部记录。
            清空会删除 localStorage 中的记录与 IndexedDB 中的文件，无法恢复。
          </p>
        </div>
        <p className="small muted">
          好友、社区、律师市场、支付等功能暂未开发，因此不在这里展示入口。
        </p>
      </div>
      {editing && (
        <Modal title="编辑工作档案" onClose={() => setEditing(false)}>
          <div className="stack">
            <div className="field">
              <label className="label" htmlFor="status">
                工作状态
              </label>
              <select
                id="status"
                className="input"
                value={form.employmentStatus}
                onChange={(e) =>
                  setForm({
                    ...form,
                    employmentStatus: e.target.value as EmploymentStatus,
                  })
                }
              >
                {EMPLOYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="company">
                  公司
                </label>
                <input
                  id="company"
                  className="input"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="role">
                  岗位
                </label>
                <input
                  id="role"
                  className="input"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="start">
                  入职日期
                </label>
                <input
                  id="start"
                  type="date"
                  className="input"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="city">
                  城市
                </label>
                <input
                  id="city"
                  className="input"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
            </div>
            <div className="button-row justify-end">
              <Button onClick={() => setEditing(false)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const current = useAppStore.getState().profile;
                  saveProfile({
                    id: current?.id || crypto.randomUUID(),
                    employmentStatus: form.employmentStatus,
                    company: form.company || undefined,
                    role: form.role || undefined,
                    startDate: form.startDate || undefined,
                    city: form.city || undefined,
                  });
                  toast("工作档案已更新");
                  setEditing(false);
                }}
              >
                保存
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {privacy && (
        <Modal title="隐私与数据说明" onClose={() => setPrivacy(false)}>
          <div className="stack">
            <p className="muted">
              这是一个本地演示版本。工作档案、日记、事件、材料元数据和聊天记录保存在
              localStorage（键名 {STORAGE_KEY}），上传的原始文件保存在
              IndexedDB。清空浏览器数据或使用无痕窗口都会导致数据不可访问。
            </p>
            <p className="muted">
              模拟 AI
              不会读取你的文件内容来生成事实；材料摘要与原始文件分开保存，确认前的摘要标记为“待确认”。
            </p>
            <p className="muted">
              产品不会给出“公司违法”“一定能赢”“你必须辞职”这类结论。需要专业判断时，建议咨询专业人士，该服务尚未接入。
            </p>
            <Button onClick={() => setPrivacy(false)}>我知道了</Button>
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={pendingImport !== null}
        title="导入这份备份？"
        danger
        confirmText="覆盖并导入"
        description={"导入会覆盖当前浏览器里的全部记录：工作档案、日记、对话、事件与材料元数据。这会替换掉你现在的内容，且无法撤销。\n\n备份不含 AI 接入配置，导入后仍沿用你当前的 Key；备份也不含原始文件，之前上传的文件需要重新上传。"}
        onCancel={() => setPendingImport(null)}
        onConfirm={() => {
          if (pendingImport) importData(pendingImport);
          setPendingImport(null);
          toast("已导入备份");
        }}
      />
      <ConfirmDialog
        open={clearOpen}
        title="确认清空本地数据？"
        danger
        confirmText="我确认清空"
        description="这会删除当前浏览器中的工作档案、日记、事件、材料元数据和所有上传文件，且无法恢复。建议先在「数据管理」里导出备份。"
        onCancel={() => setClearOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await clearData();
            toast("本地数据已清空");
            navigate("/onboarding", { replace: true });
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
            setClearOpen(false);
          }
        }}
      />
      <ConfirmDialog
        open={resetOpen}
        title="重置为演示故事？"
        danger
        confirmText="重置演示数据"
        description="这会清空当前数据并重新加载虚构演示故事，包括示例材料。你自己的记录将被覆盖。"
        onCancel={() => setResetOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await loadDemo(true);
            toast("已重置为演示故事");
            navigate("/today", { replace: true });
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
            setResetOpen(false);
          }
        }}
      />
      {busy && <p className="muted">正在处理…</p>}
    </RequireProfile>
  );
}
