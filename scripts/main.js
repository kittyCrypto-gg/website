import { loadBanner, setupTerminalWindow, scaleBannerToFit } from "./banner.js";
import { setupReaderToggle } from "./readerMode.js";
import { showReadAloudMenu } from "./readAloud.js";

document.addEventListener("DOMContentLoaded", () => {
  document.body.style.visibility = "visible";
  document.body.style.opacity = "1";

  loadBanner().then(async () => {
    await setupTerminalWindow();
    await scaleBannerToFit();
    await new Promise(resolve => {
      document.getElementById("terminal-loading")?.style.setProperty("display", "none");
      window.addEventListener("resize", () => scaleBannerToFit());
      console.log("Banner loaded successfully");
      resolve();
    });
  });
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

    if (data.headScripts) {
      data.headScripts.forEach(scriptSrc => {
        const script = document.createElement("script");
        script.src = scriptSrc;
        script.defer = true;
        document.head.appendChild(script);
      });
    }

    const menu = document.getElementById("main-menu");
    if (!menu) throw new Error("Element #main-menu not found!");
    for (const [text, link] of Object.entries(data.mainMenu)) {
      const button = document.createElement("a");
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

    const themeToggle = document.createElement("button");
    themeToggle.id = "theme-toggle";
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

    const readerToggle = document.createElement("button");
    readerToggle.id = "reader-toggle";
    readerToggle.classList.add("theme-toggle-button");
    readerToggle.style.bottom = "80px";
    readerToggle.textContent = data.readerModeToggle.enable;
    readerToggle.setAttribute("data-enable", data.readerModeToggle.enable);
    readerToggle.setAttribute("data-disable", data.readerModeToggle.disable);
    readerToggle.title = data.readerModeToggle.title || "Reader Mode";
    document.body.appendChild(readerToggle);

    await setupReaderToggle();

    const readAloudToggle = document.createElement("button");
    readAloudToggle.id = "read-aloud-toggle";
    readAloudToggle.classList.add("theme-toggle-button");
    readAloudToggle.style.bottom = "140px";
    readAloudToggle.textContent = data.readAloudToggle.enable;
    readAloudToggle.setAttribute("data-enable", data.readAloudToggle.enable);
    readAloudToggle.setAttribute("data-disable", data.readAloudToggle.disable);
    readAloudToggle.title = data.readAloudToggle.title || "Read Aloud";
    document.body.appendChild(readAloudToggle);

    if (readAloudToggle)
      readAloudToggle.addEventListener("click", showReadAloudMenu);

    const params = new URLSearchParams(window.location.search);

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
