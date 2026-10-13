import { expect, test, type Page } from "@playwright/test";

/** 把浏览器时间固定在某个小时（默认 18:30，即下班后） */
const fixTime = async (page: Page, hour = 18, minute = 30) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  await page.clock.setFixedTime(d);
};

/** 加载演示数据，等待「今天」页就绪 */
const loadDemo = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示" }).click();
  await expect(page.getByRole("heading", { name: "今天的状态" })).toBeVisible({
    timeout: 15000,
  });
};

test.beforeEach(async ({ page }) => {
  await fixTime(page);
});

test("下班后打开网站先弹出快速打卡，选心情保存后自动收起并同步到「今天」页", async ({
  page,
}) => {
  await loadDemo(page);

  // 先弹出的是「快速打卡」：7 个手绘心情，一键就能记
  const modal = page.getByTestId("checkin-modal");
  await expect(modal).toBeVisible({ timeout: 15000 });
  await expect(modal.getByRole("radio")).toHaveCount(7);

  // 保存 → 出现成功动效与提示 → 自动收起
  await modal.getByRole("radio", { name: /开心/ }).click();
  await modal.getByRole("button", { name: "保存今天" }).click();
  await expect(modal.getByTestId("checkin-done")).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByTestId("checkin-modal")).toHaveCount(0, {
    timeout: 5000,
  });

  // 心情同步到「今天」页，并显示为已保存（不需要再保存一次）
  await expect(
    page
      .getByRole("radiogroup", { name: "今天的心情" })
      .getByRole("radio", { name: /开心/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
});

test("填写过之后，这一天不会再出现", async ({ page }) => {
  await loadDemo(page);

  const modal = page.getByTestId("checkin-modal");
  await expect(modal).toBeVisible({ timeout: 15000 });
  await modal.getByRole("radio", { name: /还行/ }).click();
  await modal.getByRole("button", { name: "保存今天" }).click();
  await expect(page.getByTestId("checkin-modal")).toHaveCount(0, {
    timeout: 5000,
  });

  // 当天多次刷新也不会再弹
  await page.reload();
  await expect(page.getByRole("heading", { name: "今天的状态" })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByTestId("checkin-modal")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "今天的状态" })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByTestId("checkin-modal")).toHaveCount(0);
});

test("没填写时，下班前不打扰、下班后才提醒", async ({ page }) => {
  // 中午打开：不在提醒时间，不弹
  await fixTime(page, 12, 0);
  await loadDemo(page);
  await expect(page.getByTestId("checkin-modal")).toHaveCount(0);

  // 下班后（18:30）再打开：弹出
  await fixTime(page, 18, 30);
  await page.reload();
  await expect(page.getByTestId("checkin-modal")).toBeVisible({
    timeout: 15000,
  });
});

test("快速打卡可以「直接进入」，不记录任何东西；刷新后仍会再提醒", async ({
  page,
}) => {
  await loadDemo(page);

  const modal = page.getByTestId("checkin-modal");
  await expect(modal).toBeVisible({ timeout: 15000 });
  await modal.getByTestId("checkin-skip").click();
  await expect(page.getByTestId("checkin-modal")).toHaveCount(0);

  // 没有选中任何心情，状态仍是「未保存」
  await expect(page.getByText("未保存", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("radiogroup", { name: "今天的心情" })
      .getByRole("radio", { name: /开心/ }),
  ).toHaveAttribute("aria-checked", "false");

  // 当天还没填写：重新打开（刷新）后再次弹出
  await page.reload();
  await expect(page.getByTestId("checkin-modal")).toBeVisible({
    timeout: 15000,
  });
});
