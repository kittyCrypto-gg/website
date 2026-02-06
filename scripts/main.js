import { removeExistingById, recreateSingleton } from "./domSingletons.js";
import { setupTerminalModule } from "./terminal.js";
import { setupReaderToggle } from "./readerMode.js";
import * as readAloud from "./readAloud.js";
import { keyboardEmu } from "./keyboard.js";
import * as loader from "./loader.js";

const params = new URLSearchParams(window.location.search);
let terminalMod = null;
let pendingWebUiTheme = null;

function toSafeIdPart(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function makeStableId(prefix, value) {
  const part = toSafeIdPart(value);
  return part ? `${prefix}${part}` : `${prefix}x`;
}

async function checkMobile() {
  const MOBILE_DETECT_CDN =
    "https://kittycrypto.gg/external?src=https://cdn.jsdelivr.net/npm/mobile-detect@1.4.5/mobile-detect.js";

  if (!window.MobileDetect) {
    await loader.loadScript(MOBILE_DETECT_CDN, { asModule: false });
  }

  const ua = navigator.userAgent;
  const md = new MobileDetect(ua);

  const mdHit = !!md.mobile();
  const touch = navigator.maxTouchPoints > 0;

  const desktop =
    /\b(Windows NT|Macintosh|X11|Linux x86_64)\b/.test(ua) &&
    !touch;

  return mdHit || !desktop;
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.style.visibility = "visible";
  document.body.style.opacity = "1";

  const init = async () => {

    const isMobile = params.get("isMobile") !== null
      ? params.get("isMobile") === "true"
      : await checkMobile();

    const terminal = await setupTerminalModule()
      .then((mod) => {
        document
          .getElementById("terminal-loading")
          ?.style.setProperty("display", "none");

        console.log("Banner loaded successfully");
        return mod;
      })
      .catch(err => {
        console.error("Terminal initialisation failed:", err);
        throw err;
      });

    await new Promise(r => requestAnimationFrame(r));

    const xtermTextarea =
      terminal.term.element?.querySelector("textarea.xterm-helper-textarea")
      || terminal.term.element?.querySelector("textarea");

    const keyboard = (isMobile && xtermTextarea)
      ? await new keyboardEmu(
        isMobile,
        "../keyboard.html",
        "../styles/keyboard.css"
      ).install(
        {
          send: ({ seq }) => terminal.sendSeq(seq)
        },
        xtermTextarea
      )
      : null;

    const dispose = terminal.dispose;
    terminal.dispose = () => {
      if (keyboard) keyboard.destroy();
      dispose();
    };

    terminalMod = terminal;
  };

  init();
});

let currentTheme = null;

const getCookie = (name) => {
  const cookies = document.cookie.split("; ");
  const cookie = cookies.find(row => row.startsWith(`${name}=`));
  return cookie ? cookie.split("=")[1] : null;
};

const setCookie = (name, value, days = 365) => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/`;
};

const deleteCookie = (name) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
};

const repaint = () => {
  void document.body.offsetHeight;
};

async function initialiseUI() {
  try {
    const response = await fetch("scripts/main.json");
    if (!response.ok)
      throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    // Inject head scripts (guarded by id derived from src)
    if (data.headScripts) {
      data.headScripts.forEach(scriptSrc => {
        const scriptId = makeStableId("kc-head-script_", scriptSrc);

        removeExistingById(scriptId, document);

        const script = document.createElement("script");
        script.id = scriptId;
        script.src = scriptSrc;
        script.defer = true;
        document.head.appendChild(script);
      });
    }

    // Build main menu (guard each injected link by id)
    const menu = document.getElementById("main-menu");
    if (!menu) throw new Error("Element #main-menu not found!");

    for (const [text, link] of Object.entries(data.mainMenu)) {
      const linkId = makeStableId("kc-main-menu_", text);

      removeExistingById(linkId, document);

      const button = document.createElement("a");
      button.id = linkId;
      button.href = link;
      button.textContent = text;
      button.classList.add("menu-button");
      menu.appendChild(button);
    }

    const header = document.getElementById("main-header");
    if (!header) throw new Error("Element #main-header not found!");
    if (!header.textContent.trim())
      header.textContent = data.header;

    const footer = document.getElementById("main-footer");
    if (!footer) throw new Error("Element #main-footer not found!");
    const currentYear = new Date().getFullYear();
    footer.textContent = data.footer.replace("${year}", currentYear);

    // Theme toggle (singleton)
    const themeToggle = recreateSingleton("theme-toggle", () => document.createElement("button"), document);
    themeToggle.classList.add("theme-toggle-button");
    document.body.appendChild(themeToggle);

    const applyTheme = (theme, persist = false) => {
      document.documentElement.classList.toggle("dark-mode", theme === "dark");
      document.documentElement.classList.toggle("light-mode", theme === "light");
      themeToggle.textContent =
        theme === "dark" ? data.themeToggle.dark : data.themeToggle.light;
      currentTheme = theme;
      if (persist)
        setCookie("darkMode", theme === "dark" ? "true" : "false");
      repaint();

      // if (terminalMod && typeof terminalMod.setWebUiTheme === "function") {
      //   terminalMod.setWebUiTheme(theme);
      // } else {
      //   pendingWebUiTheme = theme;
      // }
    };

    const cookieDark = getCookie("darkMode");
    const osDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

    if (cookieDark !== null)
      applyTheme(cookieDark === "true" ? "dark" : "light");
    else
      applyTheme(osDark ? "dark" : "light");

    themeToggle.addEventListener("click", () => {
      applyTheme(currentTheme === "dark" ? "light" : "dark", true);
    });

    themeToggle.title = data.themeToggle.title || "Theme";

    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", e => {
        const osTheme = e.matches ? "dark" : "light";
        if (currentTheme !== osTheme)
          applyTheme(osTheme, false);
      });
    }

    if (!document.location.pathname.includes("reader.html")) return;

    // Reader mode toggle (singleton)
    const readerToggle = recreateSingleton("reader-toggle", () => document.createElement("button"), document);
    readerToggle.classList.add("theme-toggle-button");
    readerToggle.style.bottom = "80px";
    readerToggle.textContent = data.readerModeToggle.enable;
    readerToggle.setAttribute("data-enable", data.readerModeToggle.enable);
    readerToggle.setAttribute("data-disable", data.readerModeToggle.disable);
    readerToggle.title = data.readerModeToggle.title || "Reader Mode";
    document.body.appendChild(readerToggle);

    await setupReaderToggle();

    // Read aloud toggle (singleton)
    const readAloudToggle = recreateSingleton("read-aloud-toggle", () => document.createElement("button"), document);
    readAloudToggle.classList.add("theme-toggle-button");
    readAloudToggle.style.bottom = "140px";
    readAloudToggle.textContent = data.readAloudToggle.enable;
    readAloudToggle.setAttribute("data-enable", data.readAloudToggle.enable);
    readAloudToggle.setAttribute("data-disable", data.readAloudToggle.disable);
    readAloudToggle.title = data.readAloudToggle.title || "Read Aloud";
    document.body.appendChild(readAloudToggle);

    readAloudToggle.addEventListener("click", readAloud.showMenu);

    if (params.has("darkmode")) {
      const v = params.get("darkmode").toLowerCase();
      if (v === "true") applyTheme("dark", true);
      if (v === "false") applyTheme("light", true);
    }

  } catch (error) {
    console.error("Error loading JSON or updating DOM:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initialiseUI();
});