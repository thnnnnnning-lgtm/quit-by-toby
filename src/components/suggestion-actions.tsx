import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { Button, Modal, useToast } from "./ui";
import { MATERIAL_TYPES } from "../constants";
import type { MaterialSuggestion } from "../types";

/**
 * 处理一条材料建议。所有入口（对话卡片、今天、回顾、事件详情）共用这一处逻辑，
 * 保证「先查库存 → 只在缺失时建议」的规则不会被某个页面绕过。
 */
export const SuggestionActionModal = ({
  suggestion,
  onClose,
  onDone,
}: {
  suggestion: MaterialSuggestion;
  onClose: () => void;
  onDone?: () => void;
}) => {
  const materials = useAppStore((s) => s.materials);
  const saveMaterial = useAppStore((s) => s.saveMaterial);
  const setStatus = useAppStore((s) => s.setSuggestionStatus);
  const toast = useToast();
  const matches = materials.filter(
    (m) =>
      (m.status === "uploaded" || m.status === "saved_externally") &&
      m.type === suggestion.type &&
      (!suggestion.eventId || m.eventIds.includes(suggestion.eventId)),
  );
  const [pickId, setPickId] = useState(matches[0]?.id || "");
  const [note, setNote] = useState("");
  const chosen = matches.find((m) => m.id === pickId) || matches[0];
  const uploadTo = `/materials/upload?type=${suggestion.type}${
    suggestion.eventId ? `&eventId=${suggestion.eventId}` : ""
  }&suggestionId=${suggestion.id}`;

  const linkExisting = () => {
    if (!chosen) return;
    saveMaterial(
      {
        ...chosen,
        eventIds: suggestion.eventId
          ? Array.from(new Set([...chosen.eventIds, suggestion.eventId]))
          : chosen.eventIds,
      },
      suggestion.id,
    );
    setStatus(suggestion.id, "completed");
    toast("已关联已有材料");
    onClose();
    onDone?.();
  };

  const markSaved = () => {
    saveMaterial(
      {
        name: suggestion.title,
        type: suggestion.type,
        status: "saved_externally",
        isCurrent: true,
        eventIds: suggestion.eventId ? [suggestion.eventId] : [],
        externalLocationNote: note || "未填写保存位置",
        extractionStatus: "none",
        coverageStart: suggestion.coverageStart,
        coverageEnd: suggestion.coverageEnd,
      },
      suggestion.id,
    );
    setStatus(suggestion.id, "completed");
    toast("已记为自行保存，原文件未上传");
    onClose();
    onDone?.();
  };

  return (
    <Modal title={`处理「${suggestion.title}」`} onClose={onClose}>
      <div className="stack">
        <p className="muted">
          {MATERIAL_TYPES[suggestion.type]} · {suggestion.reason}
        </p>
        {matches.length > 0 ? (
          <>
            <p className="notice">
              已找到同类材料：{chosen.name}。
              {chosen.status === "saved_externally"
                ? "（已自行保存，原文件未上传）"
                : ""}
              可以直接关联，不重复收集。
            </p>
            {matches.length > 1 && (
              <div className="field">
                <label className="label" htmlFor="pick">
                  选择关联材料
                </label>
                <select
                  id="pick"
                  className="input"
                  value={pickId}
                  onChange={(e) => setPickId(e.target.value)}
                >
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="button-row">
              <Button variant="primary" onClick={linkExisting}>
                关联已有材料
              </Button>
              <Button to={uploadTo}>仍要上传新文件</Button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              库存中没有同类材料。你可以标记已自行保存，或直接上传文件。
            </p>
            <div className="field">
              <label className="label" htmlFor="loc">
                保存位置备注
              </label>
              <input
                id="loc"
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：个人邮箱 / 家中资料夹"
              />
            </div>
            <div className="button-row">
              <Button variant="primary" onClick={markSaved}>
                我已自行保存
              </Button>
              <Button to={uploadTo}>上传文件</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
