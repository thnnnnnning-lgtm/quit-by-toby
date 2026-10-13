import { expect, test, type Page } from "@playwright/test";

/**
 * 快速打卡只在下班时间后弹出；把浏览器时间固定到 18:30，
 * 保证用例在任何真实时间运行的行为一致。
 */
test.beforeEach(async ({ page }) => {
  const d = new Date();
  d.setHours(18, 30, 0, 0);
  await page.clock.setFixedTime(d);
});

const dayKey = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

/** 移动端「今日摘要」「今日整理」默认收起，断言内容前先展开 */
const openPanel = async (page: Page, title: RegExp) => {
  const toggle = page.getByRole("button", { name: title }).first();
  if ((await toggle.count()) === 0) return;
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
};

/** 打开网站会先弹「快速打卡」，测试里点「直接进入」关掉 */
const dismissCheckIn = async (page: Page) => {
  const skip = page.getByTestId("checkin-skip");
  await expect(skip).toBeVisible({ timeout: 10000 });
  await skip.click();
  await expect(page.getByTestId("checkin-modal")).toHaveCount(0);
};

test("完整流程：引导 → 今天（心情 + 对话）→ 记入回顾 → 报告", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天你想离职了吗？" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "体验演示" }).click();
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible({ timeout: 15000 });
  await dismissCheckIn(page);

  // 一级导航只有三项，没有独立的 AI 助手入口
  const nav = page.getByRole("navigation", { name: "主导航" });
  await expect(nav.getByRole("link", { name: "今天" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "回顾" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "我的" })).toBeVisible();
  await expect(nav.getByRole("link", { name: /AI 助手/ })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /档案/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /和 AI 聊聊/ })).toHaveCount(0);

  // 只选心情就能完成今天的记录，不需要聊天
  await page.getByRole("radio", { name: /疲惫/ }).click();
  await page.getByRole("button", { name: "保存今天" }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible({
    timeout: 15000,
  });

  // 工作记录与 AI 对话就在同一个页面里继续
  await page.locator("#message").fill("老板把我移出项目群了");
  await page.getByRole("button", { name: "发送" }).click();

  // 减少打扰：默认用已有信息直接整理，只在对话里给一张轻量卡片
  await expect(page.getByText("要单独记下来吗")).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText("涉及哪些人？")).toHaveCount(0);

  // 确认后显示「已记入回顾」，不强制跳转到事件详情
  await page.getByRole("button", { name: "记下来" }).first().click();
  await expect(page).toHaveURL(/\/today/);
  await expect(
    page.getByTestId("conversation").getByText("已记入回顾"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "记下来" })).toHaveCount(0);

  // 刷新后状态、对话与已确认结果都还在
  await page.reload();
  await expect(page.locator("#message")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("老板把我移出项目群了")).toBeVisible();
  await expect(
    page.getByTestId("conversation").getByText("项目群成员变化"),
  ).toBeVisible();
  // 已经填写过当天心情：刷新后快速打卡不会再出现
  await expect(page.getByTestId("checkin-modal")).toHaveCount(0);
  await openPanel(page, /今日摘要/);
  // 摘要同时存在于移动端折叠面板与桌面端侧栏，取第一个（移动端）
  await expect(
    page.getByTestId("today-summary").getByText("项目群成员变化").first(),
  ).toBeVisible();

  // 已确认事件进入回顾
  await page.goto("/review");
  await expect(
    page.getByTestId("important-events").getByText("项目群成员变化"),
  ).toBeVisible();

  await page.goto("/report");
  await page.getByRole("button", { name: "预览报告" }).click();
  await expect(page.getByText("已确认事件时间线")).toBeVisible({
    timeout: 15000,
  });
});

test("普通的一天：只选心情就能保存，不需要写任何字", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示" }).click();
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible({ timeout: 15000 });
  await dismissCheckIn(page);

  // 状态只有心情一项：没有压力刻度，也没有工作时长输入
  await expect(page.getByText("补充状态")).toHaveCount(0);
  await expect(page.getByLabel("工作时长（小时）")).toHaveCount(0);
  await expect(page.getByLabel("今天的心情").getByRole("radio")).toHaveCount(7);

  // 只选心情，不填任何补充信息，也能保存
  await page.getByRole("radio", { name: /还行/ }).click();
  await page.getByRole("button", { name: "保存今天" }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible({
    timeout: 15000,
  });

  // 没有产生任何事件候选
  await openPanel(page, /今日整理/);
  await expect(
    page.getByTestId("day-organize").getByText("今天没有待确认的整理结果。"),
  ).toBeVisible();
});

test("可以从历史日期进入那一天的记录与对话", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示" }).click();
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible({ timeout: 15000 });
  await dismissCheckIn(page);

  // 演示故事里两天前的记录带着当时的对话
  await page.goto(`/today/${dayKey(-2)}`);
  await expect(
    page.getByText("今天被移出项目群了，想找主管了解一下情况。"),
  ).toBeVisible();

  // 已确认事件可以从顶部入口查看
  await page.getByRole("button", { name: /已确认事件/ }).click();
  await expect(
    page.getByRole("dialog").getByText("被移出项目群", { exact: true }),
  ).toBeVisible();

  // 不同日期的对话不会混在一起
  await expect(page.getByText("老板取消了两个项目会议")).toHaveCount(0);
});

test("未确认事件也能先保存材料，且不会重复提醒", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示" }).click();
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible({ timeout: 15000 });
  await dismissCheckIn(page);

  // 四天前的记录：事件还是草稿，但留痕建议已经出现
  await page.goto(`/today/${dayKey(-4)}`);
  const suggestions = page.getByTestId("day-suggestions");
  await expect(suggestions).toBeVisible();
  await expect(
    suggestions.getByText("会议变更通知", { exact: true }),
  ).toBeVisible();

  // 未确认事件不影响保存材料
  await openPanel(page, /今日整理/);
  await expect(
    page.getByTestId("day-organize").getByText("会议安排变化"),
  ).toBeVisible();

  // 处理建议：标记为已自行保存
  await suggestions.getByRole("button", { name: "我已自行保存" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "我已自行保存" })
    .click();
  await expect(suggestions.getByText(/已处理/)).toBeVisible({
    timeout: 15000,
  });

  // 处理结果同步到回顾的材料库
  await page.goto("/review?tab=materials");
  await expect(page.locator(".page")).toContainText("会议变更通知");

  // 刷新后处理状态仍然保留，不会重复提醒
  await page.reload();
  await expect(page.locator(".page")).toContainText("会议变更通知");
});

test("回顾默认只展示日历、近期记录和重要事件，不堆满统计和待办", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示" }).click();
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible({ timeout: 15000 });
  await dismissCheckIn(page);

  await page.goto("/review");
  const review = page.locator(".page");
  await expect(page.getByRole("heading", { name: "回顾" })).toBeVisible();
  // 情绪日历用月份作为主标题，年份是次要文字
  await expect(page.getByTestId("mood-calendar")).toBeVisible();
  await expect(
    page.getByTestId("mood-calendar").getByRole("heading", { name: /月$/ }),
  ).toBeVisible();
  // 「近期记录」列表不再显示，历史记录从日历进入
  await expect(page.getByRole("heading", { name: "近期记录" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "重要事件" })).toBeVisible();

  // 默认视图不再出现统计卡片
  await expect(review).not.toContainText("本月记录天数");
  await expect(review).not.toContainText("已保存材料");

  // 未确认的草稿不会进入回顾
  await expect(page.getByTestId("important-events")).toContainText(
    "被移出项目群",
  );
  await expect(page.getByTestId("important-events")).not.toContainText(
    "会议安排变化",
  );

  // 点日历里的某一天，可以直接回到那天的记录
  await page.goto(`/today/${dayKey(-2)}`);
  await expect(
    page.getByText("今天被移出项目群了，想找主管了解一下情况。"),
  ).toBeVisible();
});

test("时间敏感的内容给出整理入口，整理完可以回到当天记录", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示" }).click();
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible({ timeout: 15000 });
  await dismissCheckIn(page);

  await page.goto("/today");
  await dismissCheckIn(page);
  await page.locator("#message").fill("HR 要求我今天签离职协议");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("整理当前情况")).toBeVisible({ timeout: 15000 });

  // 由用户主动进入，不自动跳转
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole("link", { name: "开始整理" }).click();
  await expect(page).toHaveURL(/\/emergency/);
  await page.getByRole("button", { name: "被要求签文件" }).click();
  await expect(page.getByText("是否要求今天签？")).toBeVisible();
  for (let i = 0; i < 4; i += 1) {
    await page
      .getByRole("button", { name: "暂不清楚", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "下一题" }).click();
  }
  await page
    .getByRole("button", { name: "暂不清楚", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "生成整理结果" }).click();
  await expect(page.getByText("紧急事项整理结果")).toBeVisible();

  // 完成后可以回到对应日期的记录
  await page.getByRole("link", { name: "回到当天记录" }).click();
  await expect(page).toHaveURL(/\/today\//);
  await expect(page.getByRole("heading", { name: "今天的状态" })).toBeVisible();
});

test("首次使用可以只填工作状态就跳过其余步骤", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始记录" }).click();

  // 只需要选工作状态
  await expect(
    page.getByRole("heading", { name: "当前工作状态" }),
  ).toBeVisible();
  // 其余工作信息默认收起，可以完全不填
  await expect(page.getByLabel("公司")).toHaveCount(0);
  await page.getByRole("button", { name: "跳过，直接开始记录" }).click();

  // 直接进入今天，没有被基础材料或隐私说明拦住
  await expect(page).toHaveURL(/\/today/);
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible();
});

test("配置了 DeepSeek 但接口不可用时，回复会明确标注为本地模拟", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示" }).click();
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible({ timeout: 15000 });

  // 写入一个假的 Key（便于验证「调用失败 → 显式回退」而不是静默伪装）
  await page.evaluate(() => {
    const key = "workday-companion-v1";
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    raw.state = raw.state || {};
    raw.state.ai = {
      apiKey: "sk-fake",
      model: "deepseek-flash",
      baseUrl: "https://api.deepseek.com",
      status: "ok",
    };
    localStorage.setItem(key, JSON.stringify(raw));
  });
  // 拦截真实请求，模拟接口不可用
  await page.route("**/chat/completions", (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible({ timeout: 15000 });
  await dismissCheckIn(page);

  await page.locator("#message").fill("你好");
  await page.getByRole("button", { name: "发送" }).click();

  // 回复仍然可用（回退本地模板），但会明确标注
  await expect(page.getByTestId("fallback-note")).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByTestId("conversation").getByText("我记下了"),
  ).toBeVisible();
});

test("DeepSeek 能把自然语言直接整理成事件草稿（自动填好标题、日期、人物）", async ({
  page,
}) => {
  // 模拟一个“上周五”的日期（相对今天 3 天前），并算出界面上会显示的中文日期
  const occurred = new Date();
  occurred.setDate(occurred.getDate() - 3);
  const occurredAt = `${occurred.getFullYear()}-${String(occurred.getMonth() + 1).padStart(2, "0")}-${String(occurred.getDate()).padStart(2, "0")}`;
  const occurredLabel = `${occurred.getMonth() + 1}月${occurred.getDate()}日`;

  await page.goto("/");
  await page.getByRole("button", { name: "体验演示" }).click();
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible({ timeout: 15000 });

  // 写入假的 Key；用 route 模拟 DeepSeek 返回结构化 JSON 指令
  await page.evaluate(() => {
    const key = "workday-companion-v1";
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    raw.state = raw.state || {};
    raw.state.ai = {
      apiKey: "sk-fake",
      model: "deepseek-flash",
      baseUrl: "https://api.deepseek.com",
      status: "ok",
    };
    localStorage.setItem(key, JSON.stringify(raw));
  });
  await page.route("**/chat/completions", async (route) => {
    const body = route.request().postDataJSON() as {
      response_format?: { type?: string };
    };
    const content =
      body?.response_format?.type === "json_object"
        ? JSON.stringify({
            reply: "听起来是个值得留意的变化，我已经按你说的填好了一条。",
            urgent: false,
            needTime: false,
            addToExistingTitle: null,
            event: {
              title: "被要求转岗",
              occurredAt,
              people: ["主管"],
              attention: "watch",
              description: "上周五主管提出要调整岗位",
            },
          })
        : "今天辛苦了，先记下来。";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content } }] }),
    });
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "今天的状态" }),
  ).toBeVisible({ timeout: 15000 });
  await dismissCheckIn(page);

  await page.locator("#message").fill("上周五主管说要给我转岗");
  await page.getByRole("button", { name: "发送" }).click();

  // 模型直接完成操作：卡片按 JSON 自动填好日期与人物
  const conversation = page.getByTestId("conversation");
  await expect(conversation.getByText("被要求转岗")).toBeVisible({
    timeout: 15000,
  });
  await expect(conversation.getByText(occurredLabel)).toBeVisible();
  await expect(conversation.getByText(/主管/).first()).toBeVisible();

  // 一步确认，事件进入回顾
  await page.getByRole("button", { name: "记下来" }).first().click();
  await expect(conversation.getByText("已记入回顾")).toBeVisible();
});
