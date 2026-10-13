import { useEffect, useState } from "react";
import { AlertCircle } from "./doodles";
import { Badge, Button } from "./ui";
import { downloadBlob } from "../services/files";
export function FilePreview({
  blob,
  type,
  name = "material",
}: {
  blob: Blob;
  type: string;
  name?: string;
}) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (type.startsWith("image/")) {
      const u = URL.createObjectURL(blob);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    if (type === "application/pdf") {
      const u = URL.createObjectURL(blob);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    if (type.startsWith("text/")) {
      blob
        .text()
        .then((t) => setText(t.slice(0, 4000)))
        .catch(() => setFailed(true));
    }
  }, [blob, type]);
  if (failed || (!url && !text && type !== ""))
    return (
      <div className="stack">
        <p className="error">
          <AlertCircle size={16} /> 预览失败，原文件仍然保留，可下载后查看。
        </p>
        <Button onClick={() => downloadBlob(blob, name)}>下载原文件</Button>
      </div>
    );
  if (type.startsWith("image/"))
    return (
      <img
        src={url}
        alt={`材料预览 ${name}`}
        className="max-h-72 w-full rounded-lg object-contain"
      />
    );
  if (type === "application/pdf")
    return (
      <div className="stack">
        <object
          data={url}
          type="application/pdf"
          className="h-72 w-full rounded-lg border border-[var(--color-line)]"
        >
          <div className="stack p-3">
            <p className="muted">
              当前浏览器无法直接内嵌预览 PDF，原文件仍然保留。
            </p>
            <Button onClick={() => downloadBlob(blob, name)}>下载原文件</Button>
          </div>
        </object>
        <Button variant="ghost" onClick={() => window.open(url, "_blank")}>
          在新窗口打开
        </Button>
      </div>
    );
  return (
    <div className="stack">
      <Badge tone="neutral">TXT 文本</Badge>
      <pre
        className="max-h-72 overflow-auto whitespace-pre-wrap bg-[var(--color-fill)] p-3 text-xs leading-relaxed"
        style={{ borderRadius: "12px 10px 13px 10px / 10px 13px 10px 12px" }}
      >
        {text}
      </pre>
    </div>
  );
}
