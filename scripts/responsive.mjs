// 响应式走查脚本：逐宽度、逐页面检查横向溢出与导航切换。
// 不进 tests/，不参与 vitest / playwright 用例收集。
// 用法：node scripts/responsive.mjs（需要先起好 preview 服务）
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const WIDTHS = [320, 360, 390, 414, 768, 1024, 1280, 1440];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// 先载入演示数据，让每个页面都有真实内容可测
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const demo = page.getByRole("button", { name: "体验演示" });
if (await demo.count()) {
  await demo.first().click();
  await page.waitForTimeout(900);
}

// 从本地存储里取出真实 id，才能进详情页
const ids = await page.evaluate(() => {
  const raw = localStorage.getItem("workday-companion-v1");
  const state = raw ? JSON.parse(raw).state || {} : {};
  return {
    event: state.events?.[0]?.id ?? null,
    material: state.materials?.[0]?.id ?? null,
    date: state.entries?.[0]?.date ?? null,
  };
});

const PATHS = [
  "/",
  "/today",
  "/review",
  "/review?tab=events",
  "/review?tab=materials",
  "/review?tab=pending",
  "/profile",
  "/emergency",
  "/report",
  "/materials/upload",
];
if (ids.event) PATHS.push(`/events/${ids.event}`);
if (ids.material) PATHS.push(`/materials/${ids.material}`);
if (ids.date) PATHS.push(`/today/${ids.date}`);

/** 找出真的溢出视口的元素（排除可横向滚动的祖先容器内部） */
const audit = () =>
  page.evaluate(() => {
    const vw = window.innerWidth;
    const de = document.documentElement;
    const insideScroller = (el) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (
          (s.overflowX === "auto" || s.overflowX === "scroll") &&
          p.scrollWidth > p.clientWidth + 1
        )
          return true;
        p = p.parentElement;
      }
      return false;
    };
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.right > vw + 1 && !insideScroller(el)) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || "").slice(0, 70),
          right: Math.round(b.right),
          text: (el.textContent || "").trim().slice(0, 24),
        });
      }
    }
    const aside = document.querySelector("aside");
    const bottomNav = document.querySelector("nav.fixed");
    return {
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      vw,
      sidebarVisible: aside ? getComputedStyle(aside).display !== "none" : false,
      bottomNavVisible: bottomNav
        ? getComputedStyle(bottomNav).display !== "none"
        : false,
      offenders: offenders.slice(0, 6),
      offenderCount: offenders.length,
    };
  });

const rows = [];
const issues = [];

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 844 });
  for (const path of PATHS) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(220);
    const r = await audit();
    const overflow = r.scrollW > r.vw + 1;
    const mode =
      width >= 768
        ? r.sidebarVisible && !r.bottomNavVisible
          ? "侧边栏"
          : "❌导航错"
        : r.bottomNavVisible && !r.sidebarVisible
          ? "底部导航"
          : "❌导航错";
    rows.push({ width, path, mode, scrollW: r.scrollW, vw: r.vw, over: r.offenderCount });
    if (overflow || r.offenderCount || mode.startsWith("❌")) {
      issues.push({ width, path, overflow, mode, offenders: r.offenders });
    }
  }
}

// 打印一张紧凑的表
const byWidth = new Map();
for (const row of rows) {
  if (!byWidth.has(row.width)) byWidth.set(row.width, []);
  byWidth.get(row.width).push(row);
}
for (const [width, list] of byWidth) {
  const bad = list.filter((r) => r.scrollW > r.vw + 1 || r.over > 0);
  console.log(
    `\n宽度 ${width}px  页面 ${list.length} 个  导航模式 ${list[0].mode}  ${
      bad.length ? `❌ 有问题 ${bad.length} 个` : "✅ 全部正常"
    }`,
  );
  for (const r of bad) {
    console.log(`   - ${r.path}  scrollWidth=${r.scrollW} > vw=${r.vw}  溢出元素 ${r.over}`);
  }
}

console.log("\n===== 问题明细 =====");
if (!issues.length) {
  console.log("无");
} else {
  for (const it of issues) {
    console.log(`\n[${it.width}px] ${it.path}  溢出=${it.overflow}  导航=${it.mode}`);
    for (const o of it.offenders)
      console.log(`   <${o.tag} class="${o.cls}"> right=${o.right} "${o.text}"`);
  }
}

// 存两张对照图
for (const [w, name] of [
  [360, "responsive-360"],
  [768, "responsive-768"],
  [1440, "responsive-1440"],
]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `outputs/shots/${name}.png`, fullPage: false });
  console.log("shot", name);
}

await browser.close();
