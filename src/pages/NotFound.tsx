import { useNavigate, useRouteError } from "react-router-dom";
import { Button, PageHeader } from "../components/ui";

export default function NotFoundPage() {
  return (
    <div className="page stack">
      <div className="card stack py-10">
        <h1>没有找到这个页面</h1>
        <p className="muted">可能链接已经变化，回到首页继续记录吧。</p>
        <div className="button-row">
          <Button to="/today" variant="primary">
            回到首页
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 路由级错误兜底：任何页面渲染出错时给出可读的中文提示，
 * 而不是 React Router 默认的英文堆栈页面。
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const message =
    error instanceof Error ? error.message : "页面渲染时出现了未知错误。";
  return (
    <div className="page stack">
      <PageHeader
        title="这个页面出了点问题"
        subtitle="你的记录仍然保存在本地浏览器里，刷新或回到首页通常可以继续使用。"
        back="/today"
      />
      <div className="card stack">
        <p className="muted small">
          错误信息（用于排查，不包含你的文件内容）：
        </p>
        <pre className="small overflow-x-auto whitespace-pre-wrap break-words bg-[var(--color-fill)] p-3" style={{ borderRadius: "12px 10px 13px 10px / 10px 13px 10px 12px" }}>
          {message}
        </pre>
        <div className="button-row">
          <Button variant="primary" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
          <Button onClick={() => navigate("/today")}>回到首页</Button>
          <Button to="/profile">数据管理</Button>
        </div>
      </div>
    </div>
  );
}
