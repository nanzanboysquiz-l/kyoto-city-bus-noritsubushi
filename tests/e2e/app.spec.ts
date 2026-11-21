import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
});

test("shows route progress on an interactive map and in a textual list", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("公式GTFSの試作表示", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "路線の進捗地図" }),
  ).toBeVisible();
  await expect(page.getByText("京都駅前～三条京阪前")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.getByText("乗車済み", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("未乗車", { exact: true }).first()).toBeVisible();
});

test("filters the route list by ride progress", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "未乗車", exact: true }).click();

  await expect(page.locator(".route-list li")).toHaveCount(194);
  await expect(page.getByText("京都駅前～三条京阪前")).toBeVisible();
});

test("switches between map, ride entry, and group summary screens", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "記録" }).first().click();
  await expect(
    page.getByRole("heading", { name: "乗車を記録する" }),
  ).toBeVisible();
  await expect(page.getByText("このブラウザーに保存します。クラウド同期は未接続です。")).toBeVisible();

  await page.getByRole("button", { name: "グループ" }).first().click();
  await expect(
    page.getByRole("heading", { name: "みんなの進捗" }),
  ).toBeVisible();
  await expect(page.getByText("個人別の合計距離だけを共有")).toBeVisible();
});

test("updates available stops when the selected route changes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "記録" }).first().click();
  await page.getByLabel("路線").selectOption("kyoto-city-00302");

  await expect(page.getByLabel("乗った停留所")).toHaveValue("京都外大前");
  await expect(page.getByLabel("降りた停留所")).toHaveValue("上終町・瓜生山学園 京都芸術大学前");
  await expect(page.getByLabel("乗った停留所")).toContainText("京都外大前");
});

test("saves a ride locally, shows history, and restores it after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "記録" }).first().click();
  await page.getByRole("button", { name: "記録を保存" }).click();

  await expect(page.getByText("ブラウザーに保存しました。")).toBeVisible();
  await expect(page.getByText("乗車履歴")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "記録" }).first().click();
  await expect(page.getByText("乗車履歴")).toBeVisible();
  await expect(page.getByText("4.2 km", { exact: true })).toBeVisible();
});

test("downloads a vector SVG with demo disclosure", async ({ page }) => {
  await page.goto("/");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVGをダウンロード" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("kyoto-bus-progress-demo.svg");
});

test("downloads ride history as CSV", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "記録" }).first().click();
  await page.getByRole("button", { name: "記録を保存" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSVで保存" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("kyoto-bus-rides.csv");
});

test("keeps the map fitted and usable on a narrow phone screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "メインメニュー" }).last()).toBeVisible();
  await expect(
    page.getByRole("region", { name: "路線の進捗地図" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "地図を拡大" })).toBeVisible();

  const dimensions = await page.locator(".maplibregl-canvas").evaluate((canvas) => {
    const frame = canvas.parentElement?.parentElement;
    return {
      canvasHeight: canvas.getBoundingClientRect().height,
      frameHeight: frame?.getBoundingClientRect().height ?? 0,
      pageWidth: document.documentElement.scrollWidth,
    };
  });

  expect(dimensions.canvasHeight).toBeGreaterThan(300);
  expect(dimensions.pageWidth).toBeLessThanOrEqual(390);
  expect(Math.abs(dimensions.frameHeight - dimensions.canvasHeight)).toBeLessThan(4);

  const controlSizes = await page
    .locator(".map-pan-grid button, .map-zoom-controls button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const { width, height } = button.getBoundingClientRect();
        return { width, height };
      }),
    );
  expect(controlSizes).toHaveLength(6);
  expect(controlSizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
});
