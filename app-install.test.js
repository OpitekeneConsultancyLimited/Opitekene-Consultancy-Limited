import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const script = await readFile(new URL("./app-install.js", import.meta.url), "utf8");

function createInstallPage({
  userAgent = "Mozilla/5.0 Chrome/140.0.0.0",
  standalone = false,
  platform = "Linux",
  maxTouchPoints = 0,
  mobileViewport = true,
} = {}) {
  const windowListeners = new Map();
  const elements = ["header", "hero", "phone"].map(() => ({
    hidden: true,
    disabled: false,
    listeners: new Map(),
    addEventListener(name, callback) {
      this.listeners.set(name, callback);
    },
    setAttribute() {},
    click() {
      return this.listeners.get("click")();
    },
  }));
  const help = {
    hidden: true,
    textContent: "",
    scrollCount: 0,
    scrollIntoView() {
      this.scrollCount += 1;
    },
  };
  const body = {
    classList: {
      toggle() {},
      remove() {},
    },
  };
  const serviceWorkerRegistrations = [];
  const context = {
    document: {
      querySelectorAll: () => elements,
      querySelector: (selector) => selector === "#install-help" ? help : elements[2],
      body,
    },
    window: {
      isSecureContext: true,
      matchMedia: (query) => ({
        matches: query === "(display-mode: standalone)" ? standalone : mobileViewport,
      }),
      addEventListener(name, callback) {
        windowListeners.set(name, callback);
      },
    },
    navigator: {
      userAgent,
      standalone,
      platform,
      maxTouchPoints,
      serviceWorker: {
        register: async (path) => {
          serviceWorkerRegistrations.push(path);
          return {};
        },
      },
    },
    console,
  };
  vm.runInNewContext(script, context);
  return { elements, help, body, windowListeners, serviceWorkerRegistrations };
}

test("shows install controls and uses the browser install prompt when available", async () => {
  const page = createInstallPage();
  assert.ok(page.elements.every((button) => !button.hidden));
  let promptCount = 0;
  const promptEvent = {
    preventDefault() {},
    prompt: async () => { promptCount += 1; },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  };
  page.windowListeners.get("beforeinstallprompt")(promptEvent);
  await page.elements[1].click();
  assert.equal(promptCount, 1);
  assert.match(page.help.textContent, /being installed/);
  assert.equal(page.help.hidden, false);
  assert.ok(page.elements.every((button) => !button.disabled));
});

test("shows Android menu instructions when the browser has no install prompt", async () => {
  const page = createInstallPage({ userAgent: "Mozilla/5.0 Android Chrome/140.0.0.0" });
  await page.elements[0].click();
  assert.match(page.help.textContent, /three-dot menu/);
  assert.equal(page.help.hidden, false);
  assert.equal(page.help.scrollCount, 1);
});

test("directs iPhone users in another browser to Safari", async () => {
  const page = createInstallPage({
    userAgent: "Mozilla/5.0 (iPhone) CriOS/140.0.0.0 Safari/604.1",
  });
  await page.elements[1].click();
  assert.match(page.help.textContent, /Open this TaxComp page in Safari/);
});

test("hides install buttons in standalone mode and confirms service-worker registration", async () => {
  const page = createInstallPage({ standalone: true });
  assert.ok(page.elements.every((button) => button.hidden));
  await page.windowListeners.get("load")();
  assert.deepEqual(page.serviceWorkerRegistrations, ["./service-worker.js"]);
});

test("hides the install controls after the app is installed", () => {
  const page = createInstallPage();
  page.windowListeners.get("appinstalled")();
  assert.ok(page.elements.every((button) => button.hidden));
  assert.equal(page.help.hidden, true);
  assert.match(page.help.textContent, /installed on this device/);
});

test("keeps a phone install button visible and hides the sticky banner on desktop", () => {
  const phone = createInstallPage({ mobileViewport: true });
  const desktop = createInstallPage({ mobileViewport: false });
  assert.equal(phone.elements[2].hidden, false);
  assert.equal(desktop.elements[2].hidden, true);
});
