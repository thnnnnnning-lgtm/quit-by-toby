// 视觉走查用的临时截图脚本：不进测试目录，不参与 vitest / playwright 用例。
import { chromium } from "@playwright/test";

const BASE = process.env.SHOT_BASE || "http://127.0.0.1:4173";
const OUT = process.env.SHOT_OUT || "outputs/shots";

const shots = [
  { name: "today-mobile", url: "/today", w: 390, h: 844, full: false },
  { name: "today-mobile-full", url: "/today", w: 390, h: 844, full: true },
  { name: "review-mobile-full", url: "/review", w: 390, h: 844, full: true },
  { name: "profile-mobile-full", url: "/profile", w: 390, h: 844, full: true },
  { name: "emergency-mobile-full", url: "/emergency", w: 390, h: 844, full: true },
  { name: "materials-mobile-full", url: "/materials/upload", w: 390, h: 844, full: true },
  { name: "review-desktop", url: "/review", w: 1280, h: 900, full: false },
  { name: "today-desktop", url: "/today", w: 1280, h: 900, full: false },
  { name: "report-desktop", url: "/report", w: 1280, h: 900, full: false },
  { name: "profile-desktop", url: "/profile", w: 1280, h: 900, full: false },
  { name: "events-desktop", url: "/review?tab=events", w: 1280, h: 900, full: false },
  { name: "materials-desktop", url: "/review?tab=materials", w: 1280, h: 900, full: false },
  { name: "pending-desktop", url: "/review?tab=pending", w: 1280, h: 900, full: false },
  { name: "emergency-desktop", url: "/emergency", w: 1280, h: 900, full: false },
];

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 2 });
const page = await context.newPage();

// 先一次性载入演示数据，之后各页面共用同一份 localStorage
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const demo = page.getByRole("button", { name: "体验演示" });
if (await demo.count()) {
  await demo.first().click();
  await page.waitForTimeout(600);
}

for (const shot of shots) {
  await page.setViewportSize({ width: shot.w, height: shot.h });
  await page.goto(`${BASE}${shot.url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(450);
  await page.screenshot({
    path: `${OUT}/${shot.name}.png`,
    fullPage: shot.full,
  });
  console.log("shot", shot.name);
}

// 情绪日历放大
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/review`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.getByTestId("mood-calendar").screenshot({ path: `${OUT}/zoom-calendar.png` });
console.log("shot zoom-calendar");

await browser.close();
