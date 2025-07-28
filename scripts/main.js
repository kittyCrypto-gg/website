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
      document.getElementById('terminal-loading')?.style.setProperty('display', 'none');
      window.addEventListener('resize', () => scaleBannerToFit());
      console.log("Banner loaded successfully");
      resolve();
    });
  });
});

let currentTheme = null;
// Function to get a cookie value
const getCookie = (name) => {
  const cookies = document.cookie.split("; ");
  const cookie = cookies.find(row => row.startsWith(`${name}=`));
  return cookie ? cookie.split("=")[1] : null;
};

// Function to set a cookie
const setCookie = (name, value, days = 365) => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/`;
};

// Function to delete a cookie
const deleteCookie = (name) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
};

// Force page reflow to ensure theme change is immediately reflected
const repaint = () => {
  void document.body.offsetHeight;
};

// Load JSON file for UI elements
async function initialiseUI() {
  try {
    // Load JSON file for UI elements
    const response = await fetch('scripts/main.json');
    if (!response.ok)
      throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    // Inject any scripts defined in main.json into <head>
    if (data.headScripts) {
      data.headScripts.forEach(scriptSrc => {
        const script = document.createElement("script");
        script.src = scriptSrc;
        script.defer = true;
        document.head.appendChild(script);
      });
    }

    // Populate the menu
    const menu = document.getElementById('main-menu');
    if (!menu) throw new Error('Element #main-menu not found!');
    for (const [text, link] of Object.entries(data.mainMenu)) {
      const button = document.createElement('a');
      button.href = link;
      button.textContent = text;
      button.classList.add('menu-button');
      menu.appendChild(button);
    }

    // Populate the header
    const header = document.getElementById('main-header');
    if (!header) throw new Error('Element #main-header not found!');
    if (!header.textContent.trim())
      header.textContent = data.header;

    // Populate the footer
    const footer = document.getElementById('main-footer');
    if (!footer) throw new Error('Element #main-footer not found!');
    const currentYear = new Date().getFullYear();
    footer.textContent = data.footer.replace('${year}', currentYear);

    // Theme Toggle Button
    const themeToggle = document.createElement("button");
    themeToggle.id = "theme-toggle";
    themeToggle.classList.add("theme-toggle-button");
    document.body.appendChild(themeToggle);

    // Theme application helpers
    const applyLightTheme = () => {
      document.documentElement.classList.remove("dark-mode");
      document.documentElement.classList.add("light-mode");
      themeToggle.textContent = data.themeToggle.light;
      setCookie("darkMode", "false");
      repaint();
      currentTheme = 'light';
      console.log("Applied light theme");
    };
    const applyDarkTheme = () => {
      document.documentElement.classList.remove("light-mode");
      document.documentElement.classList.add("dark-mode");
      themeToggle.textContent = data.themeToggle.dark;
      setCookie("darkMode", "true");
      repaint();
      currentTheme = 'dark';
      console.log("Applied dark theme");
    };

    // Set initial theme
    getCookie("darkMode") === "true" ? applyDarkTheme() : applyLightTheme();

    // Theme toggle event (concise & robust)
    themeToggle.addEventListener("click", () => {
      const isDark = currentTheme
        ? currentTheme === 'dark'
        : document.documentElement.classList.contains("dark-mode");
      isDark ? applyLightTheme() : applyDarkTheme();
    });

    themeToggle.title = data.themeToggle.title || "Theme";

    if (!document.location.pathname.includes("reader.html")) return; // Only run if on reader page

    const readerToggle = document.createElement("button");
    readerToggle.id = "reader-toggle";
    readerToggle.classList.add("theme-toggle-button");
    readerToggle.style.bottom = `80px`;
    readerToggle.textContent = data.readerModeToggle.enable;
    readerToggle.setAttribute('data-enable', data.readerModeToggle.enable);
    readerToggle.setAttribute('data-disable', data.readerModeToggle.disable);
    readerToggle.title = data.readerModeToggle.title || "Reader Mode";
    document.body.appendChild(readerToggle);

    await setupReaderToggle();

    // Read aloud toggle button
    const readAloudToggle = document.createElement("button");
    readAloudToggle.id = "read-aloud-toggle";
    readAloudToggle.classList.add("theme-toggle-button");
    readAloudToggle.style.bottom = `140px`;
    readAloudToggle.textContent = data.readAloudToggle.enable;
    readAloudToggle.setAttribute('data-enable', data.readAloudToggle.enable);
    readAloudToggle.setAttribute('data-disable', data.readAloudToggle.disable);
    readAloudToggle.title = data.readAloudToggle.title || "Read Aloud";
    document.body.appendChild(readAloudToggle);

    if (readAloudToggle) readAloudToggle.addEventListener('click', showReadAloudMenu);

    const params = new URLSearchParams(window.location.search);

    if (params.has("darkmode") && params.get("darkmode").toLowerCase() === "true")
      applyDarkTheme();
    else if (params.has("darkmode") && params.get("darkmode").toLowerCase() === "false")
      applyLightTheme();
    else
      getCookie("darkMode") === "true" ? applyDarkTheme() : applyLightTheme();


  } catch (error) {
    console.error('Error loading JSON or updating DOM:', error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initialiseUI();
});