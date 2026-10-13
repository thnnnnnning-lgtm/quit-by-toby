import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

/** 打开网站会先弹「快速打卡」，测试里点「直接进入」关掉 */
const dismissCheckIn = async (page: import("@playwright/test").Page) => {
  const skip = page.getByTestId("checkin-skip");
  await expect(skip).toBeVisible({ timeout: 10000 });
  await skip.click();
  await expect(page.getByTestId("checkin-modal")).toHaveCount(0);
};

test.beforeEach(async ({ page }) => {
  // 快速打卡只在下班时间后弹出；固定到 18:30，保证任何时间运行行为一致
  const d = new Date();
  d.setHours(18, 30, 0, 0);
  await page.clock.setFixedTime(d);
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示" }).click();
  await expect(page.getByRole("heading", { name: "今天的状态" })).toBeVisible({
    timeout: 15000,
  });
  await dismissCheckIn(page);
});

test.describe("移动端布局与可访问性", () => {
  test("底部三项导航固定，但不遮挡页面内容", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "主导航" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link")).toHaveCount(3);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const navBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();
    const lastCard = page.locator(".page-wide > *").last();
    const cardBox = await lastCard.boundingBox();
    expect(cardBox).not.toBeNull();
    if (navBox && cardBox) {
      expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(navBox.y + 1);
    }
  });

  test("输入框吸附在底部导航之上，不重叠", async ({ page }) => {
    const dock = page.locator(".composer-dock");
    await expect(dock).toBeVisible();

    await page.locator("#message").fill("今天先记一句");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const dockBox = await dock.boundingBox();
    const navBox = await page
      .getByRole("navigation", { name: "主导航" })
      .boundingBox();
    expect(dockBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    if (dockBox && navBox) {
      // 输入框底部不越过导航顶部，且仍在视口内
      expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(navBox.y + 2);
      expect(dockBox.y).toBeGreaterThanOrEqual(0);
    }
  });

  test("没有横向滚动条", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("底部导航可以用键盘到达并激活", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "主导航" });
    const review = nav.getByRole("link", { name: "回顾" });
    await review.focus();
    await expect(review).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/review/);
    await expect(page.getByRole("heading", { name: "回顾" })).toBeVisible();
  });

  test("空状态与未接入功能有明确提示", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("暂未开发")).toBeVisible();
    await expect(page.getByText("下一次模拟服务请求失败")).toBeVisible();
    await page.goto("/today");
    await expect(page.getByText("模拟 AI").first()).toBeVisible();
  });
});

test.describe("手绘日记本风格", () => {
  test("主按钮用淡黄底，页面底色为米白，卡片白底加深墨描边", async ({
    page,
  }) => {
    const primary = page.getByRole("button", { name: "保存今天" });
    await expect(primary).toBeVisible();
    const bg = await primary.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe("rgb(255, 240, 208)");
    const border = await primary.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    );
    expect(border).toBe("rgb(41, 40, 36)");

    const pageBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(pageBg).toBe("rgb(255, 254, 251)");

    const panel = page.locator(".panel").first();
    const cardBg = await panel.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(cardBg).toBe("rgb(255, 255, 255)");
    // 手绘感来自深色描边，而不是阴影或渐变
    const cardBorder = await panel.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    );
    expect(cardBorder).toBe("rgb(41, 40, 36)");
    const shadow = await panel.evaluate(
      (el) => getComputedStyle(el).boxShadow,
    );
    expect(shadow).toBe("none");
  });

  test("心情选择用统一的手绘表情，不再混用系统 emoji", async ({ page }) => {
    const group = page.getByRole("radiogroup", { name: "今天的心情" });
    await expect(group.getByRole("radio")).toHaveCount(7);
    // 七个心情各自一个原创 SVG 角色
    await expect(group.locator("svg")).toHaveCount(7);
    const text = await group.innerText();
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)).toBe(false);
  });

  test("关注程度同时用文字表达，不只靠颜色", async ({ page }) => {
    await page.goto("/review?tab=events");
    await expect(page.locator(".page")).toContainText("值得关注");
  });
});

test("刷新后今天的数据仍在，且草稿不进入回顾", async ({ page }) => {
  await page.reload();
  await expect(page.getByRole("heading", { name: "今天的状态" })).toBeVisible({
    timeout: 15000,
  });
  await dismissCheckIn(page);

  // 今天能看到待确认的整理结果（移动端摘要默认收起，先展开）
  const summaryToggle = page.getByRole("button", { name: /今日摘要/ }).first();
  if ((await summaryToggle.getAttribute("aria-expanded")) === "false") {
    await summaryToggle.click();
  }
  // 摘要同时存在于移动端折叠面板与桌面端侧栏，取第一个（移动端）
  await expect(page.getByText("待确认的整理结果").first()).toBeVisible();

  // 草稿不会进入回顾：未确认的内容不算正式事件
  await page.goto("/review?tab=events");
  const events = page.locator(".page");
  await expect(events).toContainText("被移出项目群");
  await expect(events).not.toContainText("会议安排变化");

  await page.goto("/review");
  await expect(page.getByTestId("important-events")).toContainText(
    "被移出项目群",
  );
  await expect(page.getByTestId("important-events")).not.toContainText(
    "会议安排变化",
  );
});

test("未发送的文字作为草稿保留，刷新后还在", async ({ page }) => {
  await page.locator("#message").fill("这段字还没发出去");
  await page.reload();
  await expect(page.locator("#message")).toHaveValue("这段字还没发出去", {
    timeout: 15000,
  });
});

const dayKey = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

test.describe("情绪日历", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByTestId("mood-calendar")).toBeVisible({
      timeout: 15000,
    });
  });

  test("七列完整可见，星期与日期对齐，没有横向滚动", async ({ page }) => {
    const weekdays = page
      .getByTestId("calendar-weekdays")
      .locator("span");
    await expect(weekdays).toHaveCount(7);
    await expect(weekdays).toHaveText(["一", "二", "三", "四", "五", "六", "日"]);

    // 最后一列（周日）的右边缘不能超出视口
    const cells = page.getByTestId("calendar-grid").getByRole("button");
    const count = await cells.count();
    const last = await cells.nth(count - 1).boundingBox();
    const width = await page.evaluate(() => window.innerWidth);
    expect(last).not.toBeNull();
    if (last) expect(last.x + last.width).toBeLessThanOrEqual(width + 1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("每天只有一个主心情角色，日历只显示真实记录", async ({ page }) => {
    const grid = page.getByTestId("calendar-grid");
    const cells = grid.getByRole("button");
    const count = await cells.count();
    expect(count).toBeGreaterThanOrEqual(28);

    // 七列对齐：所有日期只落在 7 个横向位置上
    const boxes = await cells.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().x)),
    );
    expect(new Set(boxes).size).toBe(7);

    let expected = 0;
    for (let i = 0; i < count; i += 1) {
      const cell = cells.nth(i);
      const label = (await cell.getAttribute("aria-label")) || "";
      const svgs = await cell.locator("svg").count();
      // 一天只允许一个主心情角色，不做双行表情
      expect(svgs).toBeLessThanOrEqual(1);
      if (/未来日期/.test(label)) {
        // 未来日期不创建日记
        expect(svgs).toBe(0);
      } else if (/未记录$/.test(label)) {
        // 过去没记录：只有一个空心小点，不画角色
        expect(svgs).toBe(0);
      } else {
        // 有心情 / 有记录没心情 / 今天位置的手绘「＋」
        expected += 1;
      }
    }
    // 空日期不会被随机表情填满：角色数量正好等于有记录（或今天）的格子数
    await expect(grid.locator("svg")).toHaveCount(expected);
  });

  test("今天、已记录、未记录与未来日期可以区分", async ({ page }) => {
    const todayCell = page.getByTestId("calendar-grid").getByRole("button", {
      name: new RegExp(`^${dayKey(0)} `),
    });
    await expect(todayCell).toBeEnabled();

    const futureCell = page.getByTestId("calendar-grid").getByRole("button", {
      name: new RegExp(`^${dayKey(1)} `),
    });
    // 未来的日期不可点，也不会创建日记
    if ((await futureCell.count()) > 0) {
      await expect(futureCell).toBeDisabled();
    }

    const past = page.getByTestId("calendar-grid").getByRole("button", {
      name: new RegExp(`^${dayKey(-2)} `),
    });
    await expect(past).toBeEnabled();
    await past.click();
    await expect(page).toHaveURL(new RegExp(`/today/${dayKey(-2)}`));
    await expect(
      page.getByRole("heading", { name: "今天的状态" }),
    ).toBeVisible();
  });

  test("月份切换与「回到今天」都能用", async ({ page }) => {
    const title = page.getByTestId("mood-calendar").locator("h2");
    const before = await title.innerText();

    await page.getByRole("button", { name: "上个月" }).click();
    await expect(title).not.toHaveText(before);

    await page.getByRole("button", { name: "回到今天" }).click();
    await expect(title).toHaveText(before);
  });

  test("日历下方有手绘铅笔记录入口，未记录时提示今天还没写", async ({
    page,
  }) => {
    const button = page
      .getByTestId("mood-calendar")
      .getByRole("button", { name: "记录今天", exact: true });
    await expect(button).toBeVisible();
    const bg = await button.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe("rgb(255, 240, 208)");
    const border = await button.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    );
    expect(border).toBe("rgb(41, 40, 36)");
  });

  test("真实空状态与演示数据可以区分", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "清空本地数据" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "我确认清空" })
      .click();
    await expect(page).toHaveURL(/\/onboarding/);

    // 最短路径：只需要当前工作状态，其余都能跳过
    await page.getByRole("button", { name: "开始记录" }).click();
    await page.getByRole("button", { name: "跳过，直接开始记录" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/review");
    const calendar = page.getByTestId("mood-calendar");
    await expect(calendar).toBeVisible({ timeout: 15000 });

    // 空状态不画任何心情角色，也不假装有记录
    for (const mood of ["开心", "还行", "一般", "疲惫", "生气", "焦虑", "委屈"]) {
      await expect(
        page.getByTestId("calendar-grid").getByRole("button", { name: mood }),
      ).toHaveCount(0);
    }
    await expect(page.getByText("今天还没写日记")).toBeVisible();
    await expect(
      calendar.getByRole("button", { name: "记录今天", exact: true }),
    ).toBeVisible();
  });
});

test.describe("快捷话题：换一批", () => {
  test("点「换一批」循环切换预置话题，且始终是可记录的表达", async ({
    page,
  }) => {
    const topics = page.getByTestId("quick-topics");
    const change = page.getByRole("button", { name: "换一批快捷话题" });
    await expect(topics).toBeVisible({ timeout: 15000 });
    await expect(change).toBeVisible();

    // 第一批是旧版本的默认话题，保证初始体验不变
    await expect(topics.getByText("今天挺正常")).toBeVisible();

    // 换一批后是另一组话题，且旧的第一批消失
    await change.click();
    await expect(topics.getByText("今天有点焦虑")).toBeVisible();
    await expect(topics.getByText("今天挺正常")).toHaveCount(0);

    // 再点三次应当回到第一批（共 4 批，循环）
    await change.click();
    await expect(topics.getByText("会议临时取消了")).toBeVisible();
    await change.click();
    await expect(topics.getByText("公司要求我今天签文件")).toBeVisible();
    await change.click();
    await expect(topics.getByText("今天挺正常")).toBeVisible();

    // 话题数量稳定，换一批不会把提示区撑坏
    await expect(topics.locator(".chip")).toHaveCount(5);
  });
});

/** 快速打卡弹窗只在「今天」路由、且当天没填心情时出现；这里容错地关掉它 */
const closeCheckInIfAny = async (
  page: import("@playwright/test").Page,
): Promise<void> => {
  const skip = page.getByTestId("checkin-skip");
  try {
    await skip.waitFor({ state: "visible", timeout: 3000 });
    await skip.click();
  } catch {
    // 没有弹出就不用处理
  }
};

test.describe("加固项回归", () => {
  test("发送失败后重试，日记原文不会被写两遍", async ({ page }) => {
    const countInTodayContent = (needle: string) =>
      page.evaluate((text) => {
        const raw = localStorage.getItem("workday-companion-v1");
        if (!raw) return 0;
        const parsed = JSON.parse(raw) as {
          state?: { entries?: { date: string; content: string }[] };
        };
        const d = new Date();
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const entry = parsed.state?.entries?.find((e) => e.date === key);
        return (entry?.content ?? "").split(text).length - 1;
      }, needle);

    // 打开「下一次模拟请求失败」，让第一条消息必然发送失败
    await page.goto("/profile");
    await page
      .getByLabel("下一次模拟服务请求失败（可查看重试提示）")
      .check();

    await page.goto("/today");
    await closeCheckInIfAny(page);

    const text = "今天和主管沟通了项目安排";
    await page.locator("#message").fill(text);
    await page.getByRole("button", { name: "发送", exact: true }).click();

    const retry = page.getByRole("button", { name: "重试这条" });
    await expect(retry).toBeVisible({ timeout: 15000 });
    // 失败后原文里只应出现一次
    expect(await countInTodayContent(text)).toBe(1);

    // 重试重发成功后，仍然只出现一次（回归：旧实现会变成两次）
    await retry.click();
    await expect(retry).toHaveCount(0, { timeout: 15000 });
    expect(await countInTodayContent(text)).toBe(1);
  });

  test("导出备份不含 API Key，且可以重新导入", async ({ page }) => {
    // 模拟用户已经在本机配置了 AI
    await page.evaluate(() => {
      const key = "workday-companion-v1";
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw) as { state: { ai: Record<string, unknown> } };
      data.state.ai = { ...data.state.ai, apiKey: "sk-test-secret-12345" };
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.goto("/profile");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "导出备份" }).click(),
    ]);
    const file = await download.path();
    expect(file).toBeTruthy();
    const text = await readFile(file as string, "utf8");
    // 密钥绝不能出现在导出的文件里
    expect(text).not.toContain("sk-test-secret-12345");
    expect(text).toContain("workday-companion-backup");

    // 再把它导回去，流程应当走得通
    await page.locator('input[type="file"]').setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(text, "utf8"),
    });
    await expect(
      page.getByRole("heading", { name: "导入这份备份？" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "覆盖并导入" }).click();
    await expect(page.getByText("已导入备份")).toBeVisible();
  });

  test("紧急整理收到非法分类参数时回退到选分类页，不崩溃", async ({
    page,
  }) => {
    await page.goto("/emergency?category=not-a-real-category");
    await expect(
      page.getByRole("heading", { name: "紧急事项整理" }),
    ).toBeVisible({ timeout: 15000 });
    // 回退到分类选择：几种情况都在
    await expect(page.getByRole("button", { name: "被通知解除" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "账号权限被关闭" }),
    ).toBeVisible();
  });

  test("弹窗把焦点锁在内部，关闭后焦点还给触发按钮", async ({ page }) => {
    const trigger = page.getByRole("button", { name: /已确认事件/ }).first();
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // 打开后焦点落在弹窗里
    await expect
      .poll(() =>
        page.evaluate(() => document.activeElement?.getAttribute("role")),
      )
      .toBe("dialog");

    // 连按 Tab 也不会跑到遮罩后面的页面
    for (let i = 0; i < 15; i++) await page.keyboard.press("Tab");
    const inside = await page.evaluate(
      () =>
        document
          .querySelector('[role="dialog"]')
          ?.contains(document.activeElement) ?? false,
    );
    expect(inside).toBe(true);

    // Esc 关闭，焦点回到原来的触发按钮
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    const restored = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? "",
    );
    expect(restored).toContain("已确认事件");
  });
});
