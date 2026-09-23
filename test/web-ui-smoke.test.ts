import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const packageRoot = resolve(root, "packages/web-ui");

test("locale picker SSR hydrates, exposes real links, and closes with Escape", async () => {
  for (const mode of ["server", "client"] as const) {
    execFileSync(process.execPath, [
      "node_modules/vite/bin/vite.js", "build", "--config",
      "packages/web-ui/vite.config.ts", "--mode", mode,
    ], { cwd: root, stdio: "pipe" });
  }
  for (const config of ["tsconfig.types.json", "tsconfig.contract.json"]) {
    execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", `packages/web-ui/${config}`], {
      cwd: root,
      stdio: "pipe",
    });
  }

  const serverPath = resolve(packageRoot, "dist/server/server.js");
  const manifest: Record<string, { file: string; css?: string[] }> = JSON.parse(
    readFileSync(resolve(packageRoot, "dist/client/.vite/manifest.json"), "utf8"),
  );
  const entry = manifest["src/client.tsx"];
  assert.ok(entry);
  assert.match(entry.file, /^assets\/client-[\w-]+\.js$/);
  const cssFile = entry.css?.[0];
  assert.ok(cssFile);
  assert.match(cssFile, /^assets\/client-[\w-]+\.css$/);
  const clientPath = resolve(packageRoot, "dist/client", entry.file);
  const cssPath = resolve(packageRoot, "dist/client", cssFile);
  const server = await import(pathToFileURL(serverPath).href);
  const client = readFileSync(clientPath, "utf8");
  const css = readFileSync(cssPath, "utf8");
  const props = {
    currentLocale: "en",
    currentShortLabel: "EN",
    buttonLabel: "Change language",
    options: [
      { locale: "en", label: "English", href: "/search?q=atom&lang=en" },
      { locale: "ko", label: "한국어", href: "/search?q=atom&lang=ko" },
    ],
  };
  const markup: string = server.renderLocalePicker(props);
  assert.match(markup, /Change language: English/);
  assert.match(markup, />EN</);
  assert.match(markup, /aria-expanded="false"/);

  const unsafe = {
    ...props,
    options: [{ locale: "en", label: "</script><script>alert(1)</script>\u2028\u2029", href: "/?lang=en" }],
  };
  const serialized: string = server.serializeLocalePickerProps(unsafe);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/u);
  assert.deepEqual(JSON.parse(serialized), unsafe);

  const mobileProps = {
    currentLocale: "zh-Hant-TW",
    currentShortLabel: "ZH-TW",
    buttonLabel: "變更語言",
    options: [
      ...props.options,
      ...["de", "es", "fr", "it", "ja", "nl", "pl", "pt-PT", "zh-Hans-CN", "zh-Hant-TW"].map((locale) => ({
        locale,
        label: locale === "zh-Hant-TW" ? "繁體中文" : locale,
        href: `/?lang=${locale}`,
      })),
    ],
  };

  const http = createServer((request, response) => {
    if (request.url === `/${entry.file}`) {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(client);
      return;
    }
    if (request.url === `/${cssFile}`) {
      response.writeHead(200, { "content-type": "text/css" });
      response.end(css);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    const selected = request.url?.includes("mobile=1") ? mobileProps : props;
    response.end(`<html><head><style>:root{--tap:44px;--lang-trigger-width:72px;--surface:white;--surface-2:#eee;--text:black;--border:#888;--focus:black;--radius-sm:8px;--space-2:8px;--space-3:12px;--weight-semibold:600;--text-sm:14px;}</style><link rel="stylesheet" href="/${cssFile}"></head><body><div id="picker" hidden>${server.renderLocalePicker(selected)}</div><details id="picker-fallback"><summary>Language</summary><a href="/?lang=ko">한국어</a></details><input aria-label="Next page control"><script type="application/json" id="picker-props">${server.serializeLocalePickerProps(selected)}</script>${server.hydrationBootstrap()}<script type="module" src="/${entry.file}"></script></body></html>`);
  });
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  const address = http.address();
  assert.ok(address !== null && typeof address !== "string");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}`);
    assert.equal(await page.locator("#picker").getAttribute("hidden"), null);
    assert.notEqual(await page.locator("#picker-fallback").getAttribute("hidden"), null);
    const trigger = page.getByRole("button", { name: "Change language" });
    const before = await trigger.boundingBox();
    assert.ok(before);
    await trigger.focus();
    await page.keyboard.press("Enter");
    assert.equal(await trigger.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("href"), "/search?q=atom&lang=en");
    const korean = page.getByRole("link", { name: "한국어" });
    assert.equal(await korean.getAttribute("href"), "/search?q=atom&lang=ko");
    assert.equal(await page.getByRole("link", { name: "English" }).getAttribute("aria-current"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    assert.equal(await page.evaluate("document.activeElement?.getAttribute('aria-label')"), "Change language: English");
    const after = await trigger.boundingBox();
    assert.equal(after?.width, before.width);

    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`http://127.0.0.1:${address.port}/?mobile=1`);
    const longTrigger = page.getByRole("button", { name: "變更語言: 繁體中文" });
    assert.equal((await longTrigger.textContent())?.trim(), "ZH-TW");
    const longBox = await longTrigger.boundingBox();
    assert.equal(longBox?.width, before.width);
    await longTrigger.focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog");
    const panelBox = await panel.boundingBox();
    assert.ok(panelBox);
    assert.ok(panelBox.x >= 0 && panelBox.x + panelBox.width <= 320);
    assert.ok(panelBox.y >= 0 && panelBox.y + panelBox.height <= 568);
    const canScroll = await panel.evaluate((element) => element.scrollHeight > element.clientHeight);
    assert.equal(canScroll, true);
  } finally {
    await browser.close();
    await new Promise<void>((done, reject) => http.close((error) => error ? reject(error) : done()));
  }
});
