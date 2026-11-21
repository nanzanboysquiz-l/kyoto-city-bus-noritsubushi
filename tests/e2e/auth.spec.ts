import { expect, test } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:4174" });

const userId = "00000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: corsHeaders,
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ message: "Unexpected test request." }),
    });
  });
});

test("signs up with a display name and signs out", async ({ page }) => {
  let submittedName = "";
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (new URL(route.request().url()).pathname === "/auth/v1/signup") {
      submittedName = route.request().postDataJSON().data.display_name;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify(sessionResponse(submittedName)),
      });
      return;
    }

    if (new URL(route.request().url()).pathname === "/auth/v1/logout") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ message: "Unexpected test request." }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "新規登録" }).click();
  await page.getByLabel("表示名").fill("みか");
  await page.getByLabel("メールアドレス").fill("mika@example.test");
  await page.getByLabel("パスワード").fill("long-test-password");
  await page.getByRole("button", { name: "登録してはじめる" }).click();

  await expect(
    page.getByRole("heading", { name: "路線データの準備中" }),
  ).toBeVisible();
  expect(submittedName).toBe("みか");

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
});

test("explains when email confirmation prevents an immediate session", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (new URL(route.request().url()).pathname === "/auth/v1/signup") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({
          user: {
            id: userId,
            email: "mika@example.test",
            user_metadata: { display_name: "みか" },
          },
          session: null,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ message: "Unexpected test request." }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "新規登録" }).click();
  await page.getByLabel("表示名").fill("みか");
  await page.getByLabel("メールアドレス").fill("mika@example.test");
  await page.getByLabel("パスワード").fill("long-test-password");
  await page.getByRole("button", { name: "登録してはじめる" }).click();

  await expect(
    page.getByRole("status"),
  ).toContainText("メール確認");
});

test("signs in and shows the authenticated data-readiness state", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (new URL(route.request().url()).pathname === "/auth/v1/token") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify(sessionResponse("みか")),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ message: "Unexpected test request." }),
    });
  });

  await page.goto("/");
  await page.getByLabel("メールアドレス").fill("mika@example.test");
  await page.getByLabel("パスワード").fill("long-test-password");
  await page.getByRole("button", { name: "ログイン" }).click();

  await expect(
    page.getByRole("heading", { name: "路線データの準備中" }),
  ).toBeVisible();
});

test("shows authentication errors instead of hiding them", async ({ page }) => {
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (new URL(route.request().url()).pathname === "/auth/v1/token") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({
          code: "invalid_credentials",
          message: "Invalid login credentials",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ message: "Unexpected test request." }),
    });
  });

  await page.goto("/");
  await page.getByLabel("メールアドレス").fill("mika@example.test");
  await page.getByLabel("パスワード").fill("wrong-password");
  await page.getByRole("button", { name: "ログイン" }).click();

  await expect(page.getByRole("alert")).toHaveText("Invalid login credentials");
});

test("does not create duplicate Supabase auth clients in StrictMode", async ({
  page,
}) => {
  const duplicateClientWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Multiple GoTrueClient instances detected")) {
      duplicateClientWarnings.push(message.text());
    }
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  expect(duplicateClientWarnings).toEqual([]);
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function sessionResponse(displayName: string) {
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "mika@example.test",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: displayName },
    identities: [],
    created_at: "2026-11-21T00:00:00.000Z",
  };

  return {
    access_token:
      "eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAiLCJleHAiOjQ3MjQ0NTAwMDB9.",
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "test-refresh-token",
    user,
  };
}
