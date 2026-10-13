import type { EmergencyCategory, EmergencySession } from "../types";
import { EMERGENCY_CATEGORIES, now, uid } from "../constants";
export interface Question {
  id: string;
  text: string;
  options: string[];
}
const yesNo = ["是", "否", "暂不清楚"];
const q = (id: string, text: string, options = yesNo): Question => ({
  id,
  text,
  options,
});
const common = [
  q("written", "是否有书面通知？"),
  q("access", "是否仍能访问公司系统？"),
];
export const QUESTIONS: Record<EmergencyCategory, Question[]> = {
  sign: [
    q("today", "是否要求今天签？"),
    q("document", "是否已拿到文件？"),
    q("signed", "是否已经签署？"),
    ...common,
  ],
  termination: [
    q("today", "是否要求今天完成离职手续？"),
    q("reason", "是否说明了具体原因？"),
    q("document", "是否已拿到解除通知？"),
    ...common,
  ],
  resignation: [
    q("today", "是否要求今天提交申请？"),
    q("voluntary", "这是否是你本人的意愿？"),
    q("submitted", "是否已提交辞职申请？"),
    ...common,
  ],
  transfer: [
    q("today", "是否要求今天执行？"),
    q("role", "是否改变岗位或工作地点？"),
    q("salaryChange", "是否涉及薪资变化？"),
    ...common,
  ],
  access: [
    q("today", "是否影响今天的工作或材料获取？"),
    q("scope", "哪些权限受到影响？", [
      "工作账号",
      "邮件或群聊",
      "全部系统",
      "暂不清楚",
    ]),
    q("notified", "是否收到提前通知？"),
    q("written", "是否保留权限变化截图？"),
  ],
  salary: [
    q("today", "是否存在今天必须处理的截止时间？"),
    q("paid", "是否收到本期工资？"),
    q("slip", "是否拿到工资明细？"),
    q("contact", "是否与公司核对过？"),
  ],
  other: [
    q("today", "是否存在当天截止时间？"),
    q("document", "是否已拿到相关文件？"),
    ...common,
  ],
};
export function buildEmergency(
  category: EmergencyCategory,
  answers: Record<string, string>,
): EmergencySession {
  const urgent = answers.today === "是";
  const priority = category === "termination" || answers.access === "否";
  return {
    id: uid(),
    category,
    answers,
    factsDraft: `事项：${EMERGENCY_CATEGORIES[category]}\n${QUESTIONS[category].map((question) => `${question.text} ${answers[question.id] || "暂不清楚"}`).join("\n")}`,
    priority: urgent ? "urgent" : priority ? "priority" : "routine",
    priorityReasons: urgent
      ? ["用户填写了当天截止时间，建议先核实时间要求并保留相关材料。"]
      : priority
        ? ["涉及解除沟通或系统访问变化，建议优先整理已知事实。"]
        : ["目前未填写明确的当天截止时间，可继续补充信息。"],
    createdAt: now(),
  };
}
