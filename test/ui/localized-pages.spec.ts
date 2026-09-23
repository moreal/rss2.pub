import { spawn, type ChildProcess } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const languageButton = (page: Page) =>
  page.locator("#picker").getByRole("button", { name: /.+: .+/ });

const languageChoice = (page: Page, name: string) =>
  page.getByRole("dialog").getByRole("link", { name, exact: true });

let server: ChildProcess;
let serverClosed: Promise<void>;
let baseUrl: string;

test.beforeAll(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "test/ui/fixture-server.ts"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Register before startup can fail: afterAll must never wait for an event
  // that already happened (for example, when the sandbox denies listen()).
  serverClosed = new Promise<void>((resolve) => server.once("close", () => resolve()));
  baseUrl = await new Promise<string>((resolve, reject) => {
    let output = "";
    let errors = "";
    server.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const match = /^PORT=(\d+)$/m.exec(output);
      if (match !== null) resolve(`http://127.0.0.1:${match[1]}`);
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      errors += chunk.toString();
    });
    server.on("exit", (code) => reject(new Error(`UI fixture exited (${code}): ${errors}`)));
    server.on("error", reject);
  });
});

test.afterAll(async () => {
  if (server !== undefined) {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGTERM");
    }
    await serverClosed;
  }
});

const locales = [
  "en", "ko", "ja", "zh-Hans-CN", "zh-Hant-TW", "de", "fr", "es",
  "it", "nl", "pl", "pt-PT",
] as const;

for (const locale of locales) {
  test(`${locale} home page arrives in the selected language`, async ({ page }) => {
    await page.goto(`${baseUrl}/?lang=${locale}`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(languageButton(page)).toBeVisible();
    const response = await page.request.get(`${baseUrl}/?lang=${locale}`);
    expect(await response.text()).toContain(`<html lang="${locale}"`);
  });
}

test("Chinese choices lead to distinct simplified and traditional pages", async ({ page }) => {
  await page.goto(`${baseUrl}/?lang=zh-Hans-CN`);
  await languageButton(page).click();
  await languageChoice(page, "繁體中文（台灣）").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant-TW");
  await languageButton(page).click();
  await languageChoice(page, "简体中文").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans-CN");
});

test("switching language preserves the search query and result", async ({ page }) => {
  await page.goto(`${baseUrl}/search?q=hello%20world&lang=en`);
  await expect(page.getByRole("searchbox")).toHaveValue("hello world");
  await languageButton(page).click();
  await languageChoice(page, "Français").click();
  await expect(page).toHaveURL(/\/search\?q=hello(?:%20|\+)world&lang=fr$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("searchbox")).toHaveValue("hello world");
  await expect(page.getByRole("link", { name: "A long example title about publishing feeds across languages" })).toBeVisible();
});

test("language picker opens and a choice can be followed by keyboard", async ({ page }) => {
  await page.goto(`${baseUrl}/?lang=ko`);
  const trigger = languageButton(page);
  await trigger.focus();
  await trigger.press("Enter");
  const english = languageChoice(page, "English");
  await expect(english).toBeVisible();
  await trigger.press("Tab");
  await expect(english).toBeFocused();
  await english.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await expect(english).toBeVisible();
  await trigger.press("Tab");
  await expect(english).toBeFocused();
  await english.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("language links remain usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/?lang=en`);
    const trigger = page.locator("summary");
    await expect(trigger).toBeVisible();
    await trigger.click();
    await page.getByRole("link", { name: "한국어", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  } finally {
    await context.close();
  }
});

test("native language chooser works when the client bundle fails", async ({ page }) => {
  await page.route("**/_assets/web-ui/assets/client-*.js", (route) => route.abort("failed"));
  await page.goto(`${baseUrl}/?lang=en`);
  const nativeTrigger = page.locator("#picker-fallback summary");
  await expect(nativeTrigger).toBeVisible();
  await expect(languageButton(page)).toBeHidden();
  await nativeTrigger.click();
  await page.getByRole("link", { name: "한국어", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.locator("#picker-fallback summary")).toBeVisible();
});

for (const locale of ["ko", "zh-Hant-TW"]) {
  test(`${locale} picker keeps its geometry through initial hydration`, async ({ page }) => {
    await page.addInitScript(`
      window.__initialLayoutShift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__initialLayoutShift += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    `);

    let releaseScript: () => void = () => {};
    const scriptGate = new Promise<void>((resolve) => {
      releaseScript = resolve;
    });
    await page.route("**/_assets/web-ui/assets/*.js", async (route) => {
      const response = await route.fetch();
      await scriptGate;
      await route.fulfill({ response });
    });

    const cssLoaded = page.waitForResponse((response) =>
      response.url().includes("/_assets/web-ui/") && response.url().endsWith(".css"),
    );
    await page.goto(`${baseUrl}/?lang=${locale}`, { waitUntil: "commit" });
    await cssLoaded;
    await page.waitForFunction(
      `Array.from(document.styleSheets).some((sheet) =>
        sheet.href?.includes("/_assets/web-ui/"))`,
    );
    const nativeTrigger = page.locator("#picker-fallback summary");
    await expect(nativeTrigger).toBeVisible();
    await expect(languageButton(page)).toBeHidden();
    const before = await nativeTrigger.boundingBox();
    expect(before).not.toBeNull();

    releaseScript();
    await page.waitForLoadState("load");
    const trigger = languageButton(page);
    await expect(trigger).toBeVisible();
    await expect(nativeTrigger).toBeHidden();
    await expect(page.locator("nav.lang button:visible")).toHaveCount(1);
    const after = await trigger.boundingBox();
    expect(after).not.toBeNull();
    if (before === null || after === null) return;
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(after[key] - before[key]), `${locale} picker ${key}`).toBeLessThanOrEqual(1);
    }
    const cls: number = await page.evaluate(
      `new Promise((resolve) => requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve(window.__initialLayoutShift))))`,
    );
    expect(cls, `${locale} initial CLS`).toBeLessThan(0.01);
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
}

test("rejected registration preserves the address, explains the error, and focuses the field", async ({ page }) => {
  await page.goto(`${baseUrl}/?lang=en`);
  const address = page.getByRole("textbox", { name: "Feed URL" });
  await address.fill("ftp://example.com/feed.xml");
  const response = page.waitForResponse((result) =>
    result.url().endsWith("/register") && result.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Register feed" }).click();
  expect((await response).status()).toBe(422);

  const rejected = page.getByRole("textbox", { name: "Feed URL" });
  await expect(rejected).toHaveValue("ftp://example.com/feed.xml");
  await expect(rejected).toBeFocused();
  await expect(rejected).toHaveAttribute("aria-invalid", "true");
  const describedBy = await rejected.getAttribute("aria-describedby");
  expect(describedBy?.split(/\s+/)).toHaveLength(2);
  for (const id of describedBy?.split(/\s+/) ?? []) {
    await expect(page.locator(`[id="${id}"]`)).toBeVisible();
  }
  await expect(page.getByRole("alert")).toContainText("ftp");
});

test("successful registration shows the account and steps for following it", async ({ page }) => {
  await page.goto(`${baseUrl}/?lang=en`);
  await page.getByRole("textbox", { name: "Feed URL" }).fill("https://example.com/feed.xml");
  const response = page.waitForResponse((result) =>
    result.url().endsWith("/register") && result.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Register feed" }).click();
  expect((await response).status()).toBe(303);
  await expect(page).toHaveURL(/\/registered\/long_feed_account_name\?created=1&lang=en$/);

  await expect(page.getByRole("heading", { level: 1, name: "Feed registered" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Follow it from your fediverse account" })).toBeVisible();
  await expect(page.getByText("@long_feed_account_name@127.0.0.1")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "press Follow" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the account page" })).toHaveAttribute("href", "/@long_feed_account_name");

  const registrationPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/register")) {
      registrationPosts.push(request.url());
    }
  });
  await languageButton(page).click();
  await languageChoice(page, "한국어").click();
  await expect(page).toHaveURL(/\/registered\/long_feed_account_name\?created=1&lang=ko$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByText("@long_feed_account_name@127.0.0.1")).toBeVisible();
  expect(registrationPosts).toEqual([]);
});

test("copying the registered account puts its full handle on the clipboard", async ({ browser }) => {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/registered/long_feed_account_name?created=1&lang=en`);
    const copy = page.getByRole("button", { name: "Copy", exact: true });
    await expect(copy).toBeVisible();
    await copy.click();
    await expect.poll(() => page.evaluate("navigator.clipboard.readText()"))
      .toBe("@long_feed_account_name@127.0.0.1");
  } finally {
    await context.close();
  }
});

test("dark theme repaints the page while keeping its content usable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${baseUrl}/?lang=en`);
  const lightBackground: string = await page.evaluate("getComputedStyle(document.body).backgroundColor");
  const lightText: string = await page.evaluate("getComputedStyle(document.body).color");

  await page.emulateMedia({ colorScheme: "dark" });
  const darkBackground: string = await page.evaluate("getComputedStyle(document.body).backgroundColor");
  const darkText: string = await page.evaluate("getComputedStyle(document.body).color");
  expect(darkBackground).not.toBe(lightBackground);
  expect(darkText).not.toBe(lightText);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await languageButton(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("reduced motion removes prolonged entrance movement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${baseUrl}/registered/long_feed_account_name?created=1&lang=en`);
  const reducedDuration: string = await page.evaluate(
    `getComputedStyle(document.querySelector("main[data-enter] .page-head")).animationDuration`,
  );
  const reducedTransform: string = await page.evaluate(
    `getComputedStyle(document.querySelector("main[data-enter] .page-head")).transform`,
  );
  expect(Math.max(...reducedDuration.split(",").map((part) => parseFloat(part))))
    .toBeLessThanOrEqual(0.001);
  expect(reducedTransform).toBe("none");
  await expect(page.getByRole("heading", { level: 1, name: "Feed registered" })).toBeVisible();
});

test("actor profile leads to a post and recovers from an invalid remote follow account", async ({ page }) => {
  await page.goto(`${baseUrl}/@long_feed_account_name?lang=en`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A long example title");
  await page.getByRole("link", { name: "Example story" }).click();
  await expect(page).toHaveURL(/\/@long_feed_account_name\/post-1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Example story" })).toBeVisible();
  await expect(page.getByText("A post from the example feed.")).toBeVisible();
  await expect(page.getByRole("link", { name: "View original" }))
    .toHaveAttribute("href", "https://example.com/posts/1");

  await page.getByRole("link", { name: /A long example title/ }).click();
  await page.getByRole("textbox", { name: "Follow from your Fediverse account" })
    .fill("invalid-account");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("link", { name: /Back to A long example title/ })).toBeVisible();
});

test("valid remote follow account redirects to the remote authorization page", async ({ page }) => {
  await page.goto(`${baseUrl}/@long_feed_account_name?lang=en`);
  await page.getByRole("textbox", { name: "Follow from your Fediverse account" })
    .fill("alice@remote.example");
  const redirectResponse = page.waitForResponse((response) =>
    response.url().includes("/remote-follow?") && response.status() === 302,
  );
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  expect((await redirectResponse).headers()["location"]).toBe(`${baseUrl}/remote-authorization`);
  await expect(page).toHaveURL(`${baseUrl}/remote-authorization`);
  await expect(page.getByRole("heading", { name: "Remote authorization" })).toBeVisible();
});

for (const width of [320, 375]) {
  test(`${width}px viewport has no document-level horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    for (const locale of locales) {
      for (const path of ["/", "/search?q=example"]) {
        const separator = path.includes("?") ? "&" : "?";
        await page.goto(`${baseUrl}${path}${separator}lang=${locale}`);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        const documentWidth: number = await page.evaluate(
          "document.documentElement.scrollWidth",
        );
        expect(documentWidth, `${path} in ${locale} at ${width}px`).toBeLessThanOrEqual(width);
      }
    }
  });
}

test("200% text at 320px reflows home, search, and registration result with reachable language choices", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const paths = [
    "/?lang=en",
    "/search?q=example&lang=en",
    "/registered/long_feed_account_name?created=1&lang=en",
  ];
  for (const path of paths) {
    await page.goto(`${baseUrl}${path}`);
    await page.addStyleTag({ content: ":root { font-size: 200% !important; }" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const documentWidth: number = await page.evaluate(
      "document.documentElement.scrollWidth",
    );
    expect.soft(documentWidth, `${path} with 200% text`).toBeLessThanOrEqual(320);

    await languageButton(page).click();
    const japanese = languageChoice(page, "日本語");
    await expect(japanese).toBeVisible();
    await japanese.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  }
});
