import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { Button, useToast } from "../components/ui";
import { EMPLOYMENT_STATUSES, uid } from "../constants";
import type { EmploymentStatus, MaterialType, WorkProfile } from "../types";
const BASE: {
  type: string;
  materialType: MaterialType;
  name: string;
  hint: string;
}[] = [
  {
    type: "contract",
    materialType: "contract",
    name: "劳动合同",
    hint: "用于确认劳动关系与岗位信息",
  },
  {
    type: "offer",
    materialType: "offer",
    name: "Offer",
    hint: "入职时约定的岗位与待遇",
  },
  {
    type: "jd",
    materialType: "jd",
    name: "岗位说明 / JD",
    hint: "职责范围变化时便于对照",
  },
  {
    type: "salary",
    materialType: "salary",
    name: "当前薪资记录",
    hint: "工资发放与调整的依据",
  },
  {
    type: "employee",
    materialType: "other",
    name: "员工手册",
    hint: "制度类文件，便于日后查阅",
  },
];
const TOTAL_STEPS = 4;

/**
 * 首次使用只要求填「当前工作状态」，其余都可以跳过。
 * 基础材料初始化保留，但允许跳过并直接开始记录，之后随时可以在「我的」里补充。
 */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const finish = useAppStore((s) => s.finishOnboarding);
  const saveMaterial = useAppStore((s) => s.saveMaterial);
  const loadDemo = useAppStore((s) => s.loadDemo);
  const onboarded = useAppStore((s) => s.onboarded);
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<EmploymentStatus>("在职");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [startDate, setStartDate] = useState("");
  const [city, setCity] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<Record<string, "saved" | "later">>({});
  const [moreOpen, setMoreOpen] = useState(false);

  const startDemo = async () => {
    setBusy(true);
    try {
      await loadDemo(Boolean(onboarded));
      navigate("/today", { replace: true });
      toast("已加载演示故事");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** 无论从哪一步结束，都只保存已经填写的内容，不做额外要求 */
  const finishSetup = () => {
    const profile: WorkProfile = {
      id: uid(),
      employmentStatus: status,
      company: company || undefined,
      role: role || undefined,
      startDate: startDate || undefined,
      city: city || undefined,
    };
    for (const [type, state] of Object.entries(saved)) {
      if (state !== "saved") continue;
      const item = BASE.find((b) => b.type === type)!;
      saveMaterial({
        name: item.name,
        type: item.materialType,
        status: "saved_externally",
        isCurrent: true,
        eventIds: [],
        externalLocationNote: note || "未填写保存位置",
        extractionStatus: "none",
        note: "在首次引导中标记已自行保存",
      });
    }
    finish(profile);
    navigate("/today", { replace: true });
  };

  return (
    <div className="page stack pb-10">
      <div className="card stack py-8 text-center">
        <p className="muted">
          第 {step + 1} / {TOTAL_STEPS} 步
        </p>
        <h1>今天你想离职了吗？</h1>
        <p className="muted mx-auto max-w-prose">
          一份安静的工作日记。记录每天的状态和工作里发生的事，需要的时候再整理成你自己的记录。
        </p>
        {step === 0 && (
          <div className="button-row justify-center">
            <Button variant="primary" onClick={() => setStep(1)}>
              开始记录
            </Button>
            <Button onClick={startDemo} disabled={busy}>
              {busy ? "正在准备…" : "体验演示"}
            </Button>
          </div>
        )}
      </div>
      {step === 0 && (
        <p className="notice">
          演示模式会加载一段虚构故事数据，用于展示完整流程。真实记录请点击“开始记录”。本演示不提供账号注册，数据仅保存在当前浏览器。
        </p>
      )}

      {step === 1 && (
        <div className="card stack">
          <h2>当前工作状态</h2>
          <p className="muted">
            只需要选这一项就可以开始记录，其余都可以之后在「我的」里补充。
          </p>
          <div className="field">
            <label className="label" htmlFor="status">
              当前工作状态
            </label>
            <select
              id="status"
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as EmploymentStatus)}
            >
              {EMPLOYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="panel-flat p-0">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className="kbd-focus flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
              style={{ borderRadius: "11px 9px 12px 9px / 9px 12px 9px 11px" }}
            >
              <span className="muted">补充工作信息（公司、岗位等，可选）</span>
              <span className="faint">{moreOpen ? "收起" : "展开"}</span>
            </button>
            {moreOpen && (
              <div className="form-grid border-t border-[var(--color-line-soft)] px-3 py-3">
                <div className="field">
                  <label className="label" htmlFor="company">
                    公司
                  </label>
                  <input
                    id="company"
                    className="input"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="可以不填"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="role">
                    岗位
                  </label>
                  <input
                    id="role"
                    className="input"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="可以不填"
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
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="city">
                    工作城市
                  </label>
                  <input
                    id="city"
                    className="input"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="可以不填"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="button-row justify-between">
            <Button onClick={() => setStep(0)}>上一步</Button>
            <div className="button-row">
              <Button variant="ghost" onClick={finishSetup}>
                跳过，直接开始记录
              </Button>
              <Button variant="primary" onClick={() => setStep(2)}>
                下一步
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <div className="card stack">
            <h2>基础材料（可选）</h2>
            <p className="muted">
              如果手边已经有，就标记一下。没有也没关系，可以直接跳过，之后随时补充。我们不会要求身份证、银行卡等信息。
            </p>
          </div>
          {BASE.map((item) => (
            <div key={item.type} className="card stack">
              <div>
                <h3>{item.name}</h3>
                <p className="small muted">{item.hint}</p>
              </div>
              {saved[item.type] ? (
                <p className="small muted">
                  {saved[item.type] === "saved"
                    ? "已记录：我已保存（原文件未上传）"
                    : "已选择：稍后再说"}
                </p>
              ) : (
                <div className="button-row">
                  <Button
                    to={`/materials/upload?type=${item.type === "employee" ? "other" : item.type}`}
                  >
                    上传
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setSaved({ ...saved, [item.type]: "saved" })}
                  >
                    我已经保存了
                  </Button>
                  <Button
                    onClick={() => setSaved({ ...saved, [item.type]: "later" })}
                  >
                    稍后再说
                  </Button>
                </div>
              )}
            </div>
          ))}
          <div className="card stack">
            <label className="label" htmlFor="note">
              保存位置备注（可选）
            </label>
            <input
              id="note"
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：个人邮箱 / 家中资料夹"
            />
            <p className="small muted">填写后会一起记录在材料信息里。</p>
            <div className="button-row justify-between">
              <Button onClick={() => setStep(1)}>上一步</Button>
              <div className="button-row">
                <Button variant="ghost" onClick={finishSetup}>
                  跳过这一步
                </Button>
                <Button variant="primary" onClick={() => setStep(3)}>
                  下一步
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card stack">
          <h2>隐私与使用边界</h2>
          <ul className="stack muted">
            <li>· AI 整理出来的结果只是草稿，需要你本人确认。</li>
            <li>
              · 这个产品帮你记录和整理，不提供法律结论，也不会告诉你“必须辞职”。
            </li>
            <li>
              · 本次演示的数据只保存在当前浏览器中，可以随时在“我的”里导出或清空。
            </li>
            <li>· 原始文件不会被修改或覆盖，模拟提取的摘要与原件分开保存。</li>
          </ul>
          <div className="button-row justify-between">
            <Button onClick={() => setStep(2)}>上一步</Button>
            <div className="button-row">
              <Button variant="ghost" onClick={finishSetup}>
                跳过
              </Button>
              <Button variant="primary" onClick={finishSetup}>
                完成，开始记录
              </Button>
            </div>
          </div>
          <p className="small muted">
            了解这些之后就可以开始。之后也可以在「我的」里随时查看。
          </p>
        </div>
      )}
    </div>
  );
}
