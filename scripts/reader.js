import { replaceTategaki } from './tategaki.js';
import { removeExistingById, recreateSingleton } from "./main.js";
import { replaceSmsMessages, replaceEmails, replaceSVGs, replaceTooltips, bindEmailActions } from "./mediaStyler.js";

const READER_PARA_NUMS_COOKIE = "showParagraphNumbers";
const READER_PARA_NUMS_CLASS = "reader-show-paragraph-numbers";
const PNUM_TOGGLE_SELECTOR = ".btn-toggle-paragraph-numbers";

window.params = new URLSearchParams(window.location.search);
window.storyPath = window.params.get("story");;
window.storyName = window.storyPath ? window.storyPath.split("/").pop() : null;
window.chapter = parseInt(window.params.get("chapter") || "1");
const apiPath = "https://srv.kittycrypto.gg";

window.fallback = document.getElementById('js-content-fallback');
if (window.fallback) window.fallback.style.display = 'none';

window.chapterCacheKey = `chapterCache_${window.storyName}`;
window.lastKnownChapter = parseInt(localStorage.getItem(window.chapterCacheKey) || "0");

window.readerRoot = document.getElementById("reader");
window.storyPickerRoot = document.getElementById("story-picker");

window.buttons = {
  toggleParagraphNumbers: { icon: "🔢", action: "Toggle paragraph numbers" },
  clearBookmark: { icon: "↩️", action: "Clear bookmark for this chapter" },
  prevChapter: { icon: "⏪", action: "Previous chapter" },
  jumpToChapter: { icon: "🆗", action: "Jump to chapter" },
  nextChapter: { icon: "⏩", action: "Next chapter" },
  scrollDown: { icon: "⏬", action: "Scroll down" },
  showInfo: { icon: "ℹ️", action: "Show navigation info" },
  decreaseFont: { icon: "➖", action: "Decrease font size" },
  resetFont: { icon: "🔁", action: "Reset font size" },
  increaseFont: { icon: "➕", action: "Increase font size" },
  scrollUp: { icon: "⏫", action: "Scroll up" }
};

// Reader-specific cookie helpers to avoid collision with main.js
function setReaderCookie(name, value, days = 365, root = document) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  root.cookie = `reader_${name}=${value}; expires=${expires}; path=/`;
}

function getReaderCookie(name, root = document) {
  const cookies = root.cookie.split("; ");
  const cookie = cookies.find(row => row.startsWith(`reader_${name}=`));
  return cookie ? cookie.split("=")[1] : null;
}

function renderPNum(root = document) {
  const reader = window.readerRoot;
  if (!reader) return;

  const shouldRenderNumber = (bookmarkEl) => {
    const contentEl = bookmarkEl.firstElementChild;
    if (!contentEl) return false;

    const clone = contentEl.cloneNode(true);

    clone.querySelectorAll(".reader-paragraph-num, .bookmark-emoji").forEach(n => n.remove());

    if (clone.querySelector("email, sms, tooltip, signature, content, logo")) {
      return false;
    }

    if (clone.querySelector("img, svg, video, audio, iframe")) {
      return false;
    }

    const text = (clone.textContent || "")
      .replace(/\s+/g, "")
      .trim();

    return text.length > 0;
  };

  const allBookmarks = Array.from(reader.querySelectorAll(".reader-bookmark"));

  const numberedBookmarks = allBookmarks.filter(el =>
    typeof el.id === "string" && /-ch\d+-\d+$/.test(el.id)
  );

  if (numberedBookmarks.length === 0) return;

  // Padding width from highest ordinal
  const maxOrdinal = Math.max(...numberedBookmarks.map(el => {
    const m = el.id.match(/-(\d+)$/);
    return m ? Number(m[1]) : 0;
  }));

  const digits = String(maxOrdinal).length;

  reader.style.setProperty("--reader-para-num-col-width", `${digits}ch`);
  reader.style.setProperty("--reader-para-num-gap", "0.9em");

  for (const el of numberedBookmarks) {
    const match = el.id.match(/-(\d+)$/);
    if (!match) continue;

    const ordinal = Number(match[1]);
    const label = String(ordinal).padStart(digits, "0");

    const shouldRender = shouldRenderNumber(el);

    let num = el.querySelector(":scope > .reader-paragraph-num");

    if (!shouldRender) {
      if (num) num.remove();
      continue;
    }

    if (!num) {
      num = document.createElement("span");
      num.className = "reader-paragraph-num";
      num.setAttribute("aria-hidden", "true");
      el.insertAdjacentElement("afterbegin", num);
    }

    if (num.textContent !== label) {
      num.textContent = label;
    }
  }
}

function enablePNum(enabled) {
  const reader = window.readerRoot;
  if (!reader) return;

  const syncPNumToggleButtons = (isEnabled, root = document) => {
    root.querySelectorAll(PNUM_TOGGLE_SELECTOR).forEach(btn => {
      // "crossed" typically indicates OFF
      btn.classList.toggle("menu-crossed", isEnabled);
    });
  };

  const removeInjectedPNums = () => {
    reader.querySelectorAll(".reader-paragraph-num").forEach(n => n.remove());
    reader.style.removeProperty("--reader-para-num-col-width");
    reader.style.removeProperty("--reader-para-num-gap");
  };

  reader.classList.toggle(READER_PARA_NUMS_CLASS, enabled);
  setReaderCookie(READER_PARA_NUMS_COOKIE, enabled ? "true" : "false");

  syncPNumToggleButtons(enabled, document);

  if (!enabled) {
    removeInjectedPNums();
    return;
  }

  renderPNum(document);
}

function refreshPNum(root = document) {
  const reader = window.readerRoot;
  if (!reader) return;
  if (!reader.classList.contains(READER_PARA_NUMS_CLASS)) return;

  renderPNum(root);
}

function togglePNum() {
  const reader = window.readerRoot;
  if (!reader) return;

  const next = !reader.classList.contains(READER_PARA_NUMS_CLASS);
  enablePNum(next);
}

function initPNumCookie() {
  const v = getReaderCookie(READER_PARA_NUMS_COOKIE);
  enablePNum(v === "true");
}

// Helper to check for aliases of tags in the cleaned or bloated XML
function getElementsByAliases(doc, aliases) {
  for (const tag of aliases) {
    const found = doc.getElementsByTagName(tag);
    if (found.length > 0) return Array.from(found);
  }
  return [];
}

function prevBtnEn(chapter, chapters) {
  const hasChapter0 = chapters.includes(0);
  chapter = Number(chapter);
  if (chapter <= 1 && !hasChapter0) return false;
  if (chapter <= 0) return false;
  return true;
}

function updatePrevButtonState(root = document) {
  const chapters = JSON.parse(localStorage.getItem(window.chapterCacheKey) || "[]");
  const enablePrev = prevBtnEn(window.chapter, chapters);

  root.querySelectorAll(".btn-prev").forEach(btn => {
    btn.disabled = !enablePrev;
  });
}

function clearBookmarkForCurrentChapter() {
  const base = getStoryBaseUrl();
  if (!base) return;

  const storyKey = makeStoryKey(base);
  localStorage.removeItem(`bookmark_${storyKey}_ch${window.chapter}`);
  showTemporaryNotice("Bookmark cleared for this chapter.");
}

function showTemporaryNotice(message, timeout = 1000) {
  const notice = document.createElement("div");
  notice.textContent = message;
  notice.style.position = "fixed";
  notice.style.top = "50%"; // halfway down the viewport
  notice.style.left = "50%";
  notice.style.transform = "translate(-50%, -50%)"; // centre horizontally and vertically
  notice.style.background = "var(--chatroom-bg-colour)";
  notice.style.color = "var(--chatroom-text-colour)";
  notice.style.padding = "10px 20px";
  notice.style.borderRadius = "8px";
  notice.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  notice.style.zIndex = "9999";
  document.body.appendChild(notice);

  setTimeout(() => {
    notice.remove();
  }, timeout);
}

function ctrlDetach() {
  const controls = document.querySelector(".reader-controls-top");
  if (!controls) return;

  const SENTINEL_ID = "kc-reader-controls-sentinel";

  removeExistingById(SENTINEL_ID);

  if (window.__kcReaderCtrlObserver && typeof window.__kcReaderCtrlObserver.disconnect === "function") {
    window.__kcReaderCtrlObserver.disconnect();
    window.__kcReaderCtrlObserver = null;
  }

  const sentinel = document.createElement("div");
  sentinel.id = SENTINEL_ID;
  sentinel.style.position = "absolute";
  sentinel.style.top = "0";
  sentinel.style.left = "0";
  sentinel.style.width = "1px";
  sentinel.style.height = "1px";

  const parent = controls.parentNode;
  if (!parent) return;

  parent.insertBefore(sentinel, controls);

  const observer = new IntersectionObserver(
    ([entry]) => {
      const detached = !entry.isIntersecting;
      controls.classList.toggle("is-detached", detached);
      window.dispatchEvent(
        new CustomEvent("reader:controls-detached", {
          detail: { detached }
        })
      );
    },
    { threshold: 0 }
  );

  observer.observe(sentinel);

  window.__kcReaderCtrlObserver = observer;
  window.readerTopAnchor = sentinel;
}

// Inject navigation bars at top and bottom
function injectNav() {
  const TOP_ID = "kc-reader-controls-top";
  const BOTTOM_ID = "kc-reader-controls-bottom";

  // Remove any existing nav wrappers (including duplicates)
  removeExistingById(TOP_ID);
  removeExistingById(BOTTOM_ID);

  const navHTML = `
    <div class="chapter-navigation">
      <button class="btn-toggle-paragraph-numbers">${window.buttons.toggleParagraphNumbers.icon}</button>
      <button class="btn-clear-bookmark">${window.buttons.clearBookmark.icon}</button>
      <button class="btn-prev">${window.buttons.prevChapter.icon}</button>
      <input class="chapter-display" type="text" value="1" readonly style="width: 2ch; text-align: center; border: none; background: transparent; font-weight: bold;" />
      <input class="chapter-input" type="number" min="0" style="width: 2ch; text-align: center;" />
      <button class="btn-jump">${window.buttons.jumpToChapter.icon}</button>
      <button class="chapter-end" disabled style="width: 2ch; text-align: center; font-weight: bold;"></button>
      <button class="btn-next">${window.buttons.nextChapter.icon}</button>
      <button class="btn-scroll-down">${window.buttons.scrollDown.icon}</button>
      <button class="btn-info">${window.buttons.showInfo.icon}</button>
    </div>
    <div class="font-controls">
      <button class="font-decrease">${window.buttons.decreaseFont.icon}</button>
      <button class="font-reset">${window.buttons.resetFont.icon}</button>
      <button class="font-increase">${window.buttons.increaseFont.icon}</button>
    </div>
  `;

  const navTop = document.createElement("div");
  navTop.id = TOP_ID;
  navTop.innerHTML = navHTML;

  const navBottom = navTop.cloneNode(true);
  navBottom.id = BOTTOM_ID;

  navTop.classList.add("reader-controls-top");
  navBottom.classList.add("reader-controls-bottom");

  // Replace ⏬ with ⏫ in the bottom nav
  const scrollDownBtn = navBottom.querySelector(".btn-scroll-down");
  if (scrollDownBtn) {
    scrollDownBtn.textContent = window.buttons.scrollUp.icon;
    scrollDownBtn.classList.remove("btn-scroll-down");
    scrollDownBtn.classList.add("btn-scroll-up");
  }

  if (!window.readerRoot) return;

  window.readerRoot.insertAdjacentElement("beforebegin", navTop);
  window.readerRoot.insertAdjacentElement("afterend", navBottom);
}

// Font size logic
function updateFontSize(delta = 0) {
  const current = parseFloat(getReaderCookie("fontSize")) || 1;
  const newSize = Math.max(0.7, Math.min(2.0, current + delta));
  setReaderCookie("fontSize", newSize.toFixed(2));
  window.readerRoot.style.setProperty("font-size", `${newSize}em`);
  refreshTategakiFont();
}

function showNavigationInfo() {
  alert(`Navigation Button Guide:
  ${window.buttons.toggleParagraphNumbers.icon}  – ${window.buttons.toggleParagraphNumbers.action}
  ${window.buttons.clearBookmark.icon}  – ${window.buttons.clearBookmark.action}
  ${window.buttons.prevChapter.icon}  – ${window.buttons.prevChapter.action}
  ${window.buttons.jumpToChapter.icon}  – ${window.buttons.jumpToChapter.action}
  ${window.buttons.nextChapter.icon}  – ${window.buttons.nextChapter.action}
  ${window.buttons.scrollDown.icon}  – ${window.buttons.scrollDown.action}
  ${window.buttons.scrollUp.icon}  – ${window.buttons.scrollUp.action}

Font Controls:
  ${window.buttons.decreaseFont.icon}  – ${window.buttons.decreaseFont.action}
  ${window.buttons.resetFont.icon}  – ${window.buttons.resetFont.action}
  ${window.buttons.increaseFont.icon}  – ${window.buttons.increaseFont.action}`);
}

function bindNavigationEvents(root = document) {
  const chapters = JSON.parse(localStorage.getItem(window.chapterCacheKey) || "[]");

  root.querySelectorAll(".btn-toggle-paragraph-numbers").forEach(btn => {
    btn.onclick = () => togglePNum();
  });

  root.querySelectorAll(".btn-prev").forEach(btn => btn.onclick = () => {
    if (!prevBtnEn(window.chapter, chapters)) {
      btn.disabled = true;
      return;
    }
    jumpTo(window.chapter - 1);
  });

  root.querySelectorAll(".btn-next").forEach(btn => btn.onclick = () => {
    if (window.chapter < window.lastKnownChapter) jumpTo(window.chapter + 1);
  });

  // Jump to the chapter typed next to this button
  root.querySelectorAll(".btn-jump").forEach(btn => {
    btn.onclick = () => {
      const input = btn.parentElement.querySelector(".chapter-input");
      if (!input) return;

      const val = parseInt(input.value, 10);
      if (!isNaN(val) && val >= 0 && val <= window.lastKnownChapter) {
        jumpTo(val);
      }
    };
  });

  root.querySelectorAll(".chapter-input").forEach(input => {
    input.value = window.chapter;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = parseInt(e.target.value);
        if (val >= 0 && val <= window.lastKnownChapter) jumpTo(val);
      }
    });
  });

  root.querySelectorAll(".btn-rescan").forEach(btn => btn.onclick = async () => {
    localStorage.removeItem(window.chapterCacheKey);
    window.lastKnownChapter = await discoverChapters();
    updateNav();
  });

  root.querySelectorAll(".btn-clear-bookmark").forEach(btn => {
    btn.onclick = () => clearBookmarkForCurrentChapter(root);
  });

  root.querySelectorAll(".font-increase").forEach(btn => btn.onclick = () => updateFontSize(0.1));
  root.querySelectorAll(".font-decrease").forEach(btn => btn.onclick = () => updateFontSize(-0.1));
  root.querySelectorAll(".font-reset").forEach(btn => btn.onclick = () => updateFontSize(0));
  root.querySelectorAll(".btn-info").forEach(btn => btn.onclick = showNavigationInfo);
}

async function populateStoryPicker(root = document) {
  if (!window.storyPickerRoot) return;
  try {
    const res = await fetch(`${apiPath}/stories.json`);
    if (!res.ok) throw new Error("No stories found");
    const stories = await res.json();
    const select = root.createElement("select");
    select.className = "story-selector";
    select.innerHTML = `<option value="">Select a story...</option>`;
    Object.keys(stories).forEach((name) => {
      const opt = root.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === window.storyName) opt.selected = true;
      select.appendChild(opt);
    });
    select.onchange = () => {
      if (select.value) {
        window.location.search = `?story=${encodeURIComponent(select.value)}&chapter=1`;
      }
    };
    window.storyPickerRoot.appendChild(select);
  } catch (err) {
    console.warn("No stories found or failed to load stories.json", err);
  }
}

function getStoryBaseUrl(storyName = null) {
  const name = storyName || window.storyName || (window.storyPath ? window.storyPath.split("/").pop() : null);
  if (!name) return null;
  return `${apiPath}/stories/${encodeURIComponent(name)}`;
}

async function loadChapter(n) {
  window.chapter = n;
  try {
    const base = getStoryBaseUrl();
    if (!base) throw new Error("No story selected.");

    const res = await fetch(`${base}/chapt${n}.xml`);
    if (!res.ok) throw new Error("Chapter not found");
    const xmlText = await res.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    // Use the helper function to support both "w:p" and "paragraph" tags
    const paras = getElementsByAliases(xmlDoc, ["w:p", "paragraph"]);
    let htmlContent = paras.map(p => {
      const isCleaned = p.tagName === "paragraph";
      const pPr = isCleaned ? null : p.getElementsByTagName("w:pPr")[0];
      let style = "";
      if (!isCleaned && pPr) {
        const styleEl = pPr.getElementsByTagName("w:pStyle")[0];
        if (styleEl) style = styleEl.getAttribute("w:val") || "";
      }
      let tag = "p";
      let className = "reader-paragraph";
      if (style === "Title") {
        tag = "h1";
        className = "reader-title";
      } else if (style === "Heading1" || style === "Heading2") {
        tag = "h2";
        className = "reader-subtitle";
      } else if (style === "Quote") {
        tag = "blockquote";
        className = "reader-quote";
      } else if (style === "IntenseQuote") {
        tag = "blockquote";
        className = "reader-quote reader-intense";
      }
      const runs = isCleaned
        ? Array.from(p.childNodes)
          .map(n => n.nodeType === 1 ? new XMLSerializer().serializeToString(n) : (n.textContent || ""))
          .join("")
        : Array.from(p.getElementsByTagName("w:r")).map(run => {
          const text = Array.from(run.getElementsByTagName("w:t"))
            .map(t => t.textContent)
            .join("");
          const rPr = run.getElementsByTagName("w:rPr")[0];
          const spanClass = [];
          if (rPr) {
            if (rPr.getElementsByTagName("w:b").length) spanClass.push("reader-bold");
            if (rPr.getElementsByTagName("w:i").length) spanClass.push("reader-italic");
            if (rPr.getElementsByTagName("w:u").length) spanClass.push("reader-underline");
            if (rPr.getElementsByTagName("w:strike").length) spanClass.push("reader-strike");
            if (rPr.getElementsByTagName("w:smallCaps").length) spanClass.push("reader-smallcaps");
          }
          return `<span class="${spanClass.join(" ")}">${text}</span>`;
        }).join("");

      return `<${tag} class="${className}">${runs}</${tag}>`;
    }).join("\n");

    // Process Special Tags

    htmlContent = await replaceEmails(htmlContent);
    htmlContent = await replaceSmsMessages(htmlContent);
    htmlContent = await replaceTategaki(htmlContent);
    htmlContent = await replaceImageTags(htmlContent);
    htmlContent = await replaceTooltips(htmlContent);
    htmlContent = await injectBookmarksIntoHTML(htmlContent, base, window.chapter);

    // Render the HTML
    window.readerRoot.innerHTML = htmlContent;
    await replaceSVGs(window.readerRoot);

    requestAnimationFrame(() => {
      refreshPNum(document);
    });

    // Start tracking scroll progress
    observeAndSaveBookmarkProgress(document);

    // Scroll to the saved bookmark after DOM layout is ready
    requestAnimationFrame(() => {
      restoreBookmark(base, window.chapter);
    });

    // Activate features
    activateImageNavigation(document);

    updateNav(document);
    bindNavigationEvents(document);
    setReaderCookie(`bookmark_${makeStoryKey(base)}`, window.chapter);
    window.scrollTo(0, 0);

  } catch (err) {
    window.readerRoot.innerHTML = `
      <div class="chapter-404">
        <h2>📕 Chapter ${n} Not Found</h2>
        <p>Looks like this XML chapter doesn't exist yet.</p>
      </div>
    `;
    console.error(err);
  }
}

export async function getChapters(storyName) {
  const indexRes = await fetch(`${apiPath}/stories.json`);
  if (!indexRes.ok) throw new Error("Failed to load stories index");

  const index = await indexRes.json();

  const files = index[storyName];
  if (!Array.isArray(files)) return { chapters: [], urls: [] };

  const base = getStoryBaseUrl(storyName);

  const chapters = files
    .map((f) => {
      const m = /^chapt(\d+)\.xml$/i.exec(f);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);

  const urls = chapters.map((n) => `${base}/chapt${n}.xml`);

  return { chapters, urls };
}

async function discoverChapters(storyName = null) {
  const { chapters } = await getChapters(storyName || window.storyName);

  const last = chapters.length > 0 ? Math.max(...chapters) : 0;
  window.lastKnownChapter = last;

  localStorage.setItem(
    window.chapterCacheKey,
    JSON.stringify(chapters)
  );

  return chapters;
}

function jumpTo(n) {
  // Attempt to get story path from URL (decoded) or fallback to localStorage
  let currentStoryPath = decodeURIComponent(window.storyPath) || localStorage.getItem('currentStoryPath');

  // If no story path is found, alert the user and prevent the jump
  if (!currentStoryPath) {
    alert("No story selected. Please select a story first.");
    return;
  }

  // Save the current story path for future navigation
  localStorage.setItem('currentStoryPath', currentStoryPath);

  // Properly encode the URL before setting it
  const encodedPath = encodeURIComponent(currentStoryPath);
  window.location.search = `?story=${encodedPath}&chapter=${n}`;
}

function replaceImageTags(htmlContent) {
  // Regex to match ::img:url:...:alt:...::
  const imageWithAltRegex = /::img:url:(.*?):alt:(.*?)::/g;

  // Replace each ::img:url:...:alt:...:: with an <img> wrapped in a div
  htmlContent = htmlContent.replace(imageWithAltRegex, (match, url, alt) => {
    return `
      <div class="chapter-image-container">
        <img 
          src="${url.trim()}" 
          alt="${alt.trim()}" 
          class="chapter-image" 
          loading="lazy" 
          onerror="this.onerror=null; this.src='/path/to/fallback-image.png'; this.alt='Image not found';"
        />
      </div>
    `;
  });

  // Match images without alt text: ::img:url:...::
  const imageWithoutAltRegex = /::img:url:(.*?)::/g;
  return htmlContent.replace(imageWithoutAltRegex, (match, url) => {
    return `
      <div class="chapter-image-container">
        <img 
          src="${url.trim()}" 
          alt="Chapter Image" 
          class="chapter-image" 
          loading="lazy" 
          onerror="this.onerror=null; this.src='/path/to/fallback-image.png'; this.alt='Image not found';"
        />
      </div>
    `;
  });
}

function refreshTategakiFont(root = document) {
  // current computed body font-size in px
  const px = parseFloat(getComputedStyle(window.readerRoot).fontSize);
  root
    .querySelectorAll(".tategaki-container svg text")
    .forEach(t => t.setAttribute("font-size", px));
}

function updateNav(root = document) {
  root.querySelectorAll(".chapter-display").forEach(el => el.value = window.chapter);
  root.querySelectorAll(".chapter-end").forEach(btn => btn.textContent = window.lastKnownChapter);

  // If Chapter 0 is detected, allow the Previous button to activate when on Chapter 1
  const chapters = JSON.parse(localStorage.getItem(window.chapterCacheKey) || "[]");
  const hasChapter0 = chapters.includes(0);

  root.querySelectorAll(".btn-next").forEach(btn => {
    btn.disabled = window.chapter === window.lastKnownChapter;
  });

  updatePrevButtonState(root);
}

async function initReader() {
  await populateStoryPicker(document);
  if (!window.storyPath) return;

  injectNav();
  ctrlDetach();
  initPNumCookie();

  const chapters = await discoverChapters();

  if (!params.get("chapter")) {
    const bookmark = parseInt(getReaderCookie(`bookmark_${encodeURIComponent(window.storyPath)}`));
    if (bookmark && chapters.includes(bookmark)) {
      window.chapter = bookmark;
    } else {
      window.chapter = 1;
    }
  }

  await loadChapter(window.chapter);

  const initialFont = parseFloat(getReaderCookie("fontSize")) || 1;
  window.readerRoot.style.setProperty("font-size", `${initialFont}em`);
}

export function activateImageNavigation(root = document) {
  // First, clear any existing overlays and listeners to avoid duplication
  root.querySelectorAll(".image-nav").forEach(nav => nav.remove());

  root.querySelectorAll(".chapter-image-container").forEach(container => {
    const image = container.querySelector(".chapter-image");

    // === Create Navigation Overlay ===
    const navOverlay = document.createElement("div");
    navOverlay.classList.add("image-nav");
    navOverlay.innerHTML = `
      <button class="btn-up">⬆️</button>
      <div class="horizontal">
        <button class="btn-left">⬅️</button>
        <button class="btn-center">⏺️</button>
        <button class="btn-right">➡️</button>
      </div>
      <button class="btn-down">⬇️</button>
    `;

    container.appendChild(navOverlay);

    // === State Logic ===
    let posX = 50;
    let posY = 50;
    const step = 5;

    const updatePosition = () => {
      image.style.transformOrigin = `${posX}% ${posY}%`;
    };

    // === Holdable Button Logic (JS-safe) ===
    const startHold = (onHold) => {
      const interval = setInterval(onHold, 100);
      const stopHold = () => {
        clearInterval(interval);
        root.removeEventListener("mouseup", stopHold);
        root.removeEventListener("touchend", stopHold);
        root.removeEventListener("mouseleave", stopHold);
      };
      root.addEventListener("mouseup", stopHold);
      root.addEventListener("touchend", stopHold);
      root.addEventListener("mouseleave", stopHold);
      onHold(); // immediate execution
    };

    navOverlay.querySelector(".btn-up").addEventListener("mousedown", () => {
      startHold(() => {
        posY = Math.max(0, posY - step);
        updatePosition();
      });
    });

    navOverlay.querySelector(".btn-down").addEventListener("mousedown", () => {
      startHold(() => {
        posY = Math.min(100, posY + step);
        updatePosition();
      });
    });

    navOverlay.querySelector(".btn-left").addEventListener("mousedown", () => {
      startHold(() => {
        posX = Math.max(0, posX - step);
        updatePosition();
      });
    });

    navOverlay.querySelector(".btn-right").addEventListener("mousedown", () => {
      startHold(() => {
        posX = Math.min(100, posX + step);
        updatePosition();
      });
    });

    // Touch support for mobile
    navOverlay.querySelector(".btn-up").addEventListener("touchstart", () => {
      startHold(() => {
        posY = Math.max(0, posY - step);
        updatePosition();
      });
    });

    navOverlay.querySelector(".btn-down").addEventListener("touchstart", () => {
      startHold(() => {
        posY = Math.min(100, posY + step);
        updatePosition();
      });
    });

    navOverlay.querySelector(".btn-left").addEventListener("touchstart", () => {
      startHold(() => {
        posX = Math.max(0, posX - step);
        updatePosition();
      });
    });

    navOverlay.querySelector(".btn-right").addEventListener("touchstart", () => {
      startHold(() => {
        posX = Math.min(100, posX + step);
        updatePosition();
      });
    });

    // Centre button is click only
    navOverlay.querySelector(".btn-center").addEventListener("click", () => {
      posX = 50;
      posY = 50;
      updatePosition();
    });

    // === Zoom toggle ===
    const toggleZoom = () => {
      if (image.classList.contains("active")) {
        image.classList.remove("active");
        navOverlay.classList.remove("active");
      } else {
        image.classList.add("active");
        navOverlay.classList.add("active");
      }
    };

    image.addEventListener("click", toggleZoom);

    container.addEventListener("mouseleave", () => {
      navOverlay.classList.remove("active");
    });

    // === Swipe support for mobile ===
    enableImageSwipeNavigation(image, () => posX, () => posY, (x, y) => {
      posX = x;
      posY = y;
      updatePosition();
    });
  });

  // === Swipe handler helper ===
  function enableImageSwipeNavigation(image, getX, getY, setPosition) {
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let isSwiping = false;

    image.addEventListener("touchstart", e => {
      if (!image.classList.contains("active")) return;
      if (e.touches.length === 1) {
        isSwiping = true;
        startX = lastX = e.touches[0].clientX;
        startY = lastY = e.touches[0].clientY;
      }
    }, { passive: true });

    image.addEventListener("touchmove", e => {
      if (!isSwiping || e.touches.length !== 1) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;

      const deltaX = currentX - lastX;
      const deltaY = currentY - lastY;
      lastX = currentX;
      lastY = currentY;

      const pxToPercent = 300; // base: 300px for full range
      let newX = getX() - (deltaX / pxToPercent) * 100;
      let newY = getY() - (deltaY / pxToPercent) * 100;

      newX = Math.min(100, Math.max(0, newX));
      newY = Math.min(100, Math.max(0, newY));
      setPosition(newX, newY);
    }, { passive: true });

    image.addEventListener("touchend", () => {
      isSwiping = false;
    });
  }
}

function makeStoryKey(storyBase) {
  return encodeURIComponent(storyBase).replace(/\W/g, "_");
}

export async function injectBookmarksIntoHTML(htmlContent, storyBase, chapter) {
  const storyKey = makeStoryKey(storyBase);
  const bookmarkId = localStorage.getItem(`bookmark_${storyKey}_ch${chapter}`);
  let counter = 0;

  const isMeaningfulInnerHtml = (innerHtml) => {
    // Media counts as meaningful even without text
    if (/<(img|svg|video|audio|iframe)\b/i.test(innerHtml)) return true;

    // Remove tags and whitespace and common non-breaking spaces
    const text = innerHtml
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;|&#160;/gi, "")
      .replace(/\s+/g, "")
      .trim();

    return text.length > 0;
  };

  return htmlContent.replace(
    /<(p|h1|h2|blockquote)(.*?)>([\s\S]*?)<\/\1>/g,
    (match, tag, attrs, inner) => {
      // Keep empty paragraphs as-is: no bookmark wrapper, no id, no counting
      if (!isMeaningfulInnerHtml(inner)) return match;

      const id = `bm-${storyKey}-ch${chapter}-${counter}`;
      counter += 1;

      const emojiSpan = id === bookmarkId
        ? `<span class="bookmark-emoji" aria-label="bookmark">🔖</span> `
        : "";

      return `<div class="reader-bookmark" id="${id}"><${tag}${attrs}>${emojiSpan}${inner}</${tag}></div>`;
    }
  );
}

function observeAndSaveBookmarkProgress(root = document) {
  const bookmarks = Array.from(root.querySelectorAll(".reader-bookmark"));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) return;

      const id = entry.target.id;
      const match = id.match(/^bm-([^]+)-ch(\d+)-\d+$/);
      if (!match) return;

      const storyKey = match[1];
      const chapter = match[2];
      const key = `bookmark_${storyKey}_ch${chapter}`;
      const newIndex = bookmarks.findIndex(el => el.id === id);

      if (newIndex === bookmarks.length - 1) {
        localStorage.removeItem(key);
        return;
      }

      const savedId = localStorage.getItem(key);
      const savedIndex = bookmarks.findIndex(el => el.id === savedId);
      if (newIndex <= savedIndex) return;

      localStorage.setItem(key, id);
    }
  }, {
    threshold: 0.6
  });

  setTimeout(() => {
    bookmarks.forEach(el => observer.observe(el));
  }, 1000);
}

function restoreBookmark(storyBase, chapter) {
  const storyKey = makeStoryKey(storyBase);
  const key = `bookmark_${storyKey}_ch${chapter}`;
  const id = localStorage.getItem(key);
  if (!id) return;

  const bookmarkDiv = document.getElementById(id);
  if (!bookmarkDiv) return;

  const nextBookmark = bookmarkDiv.nextElementSibling;
  if (nextBookmark) {
    const scrollY = nextBookmark.getBoundingClientRect().top;
    window.scrollTo({ top: scrollY, behavior: "smooth" });
  }

  bookmarkDiv.classList.add("reader-highlight");

  setTimeout(() => {
    bookmarkDiv.classList.add("fade-out");
    bookmarkDiv.addEventListener("transitionend", () => {
      bookmarkDiv.classList.remove("reader-highlight", "fade-out");
    }, { once: true });
  }, 5000);
}

function restoreLastStoryRead() {
  const story = window.params.get("story");
  const chapter = window.chapter;
  const lastKey = "lastStoryRead";

  if (story && chapter !== null) {
    localStorage.setItem(lastKey, JSON.stringify({ story, chapter }));
    return;
  }

  const last = localStorage.getItem(lastKey);
  if (!last) return;

  try {
    const { story, chapter } = JSON.parse(last);
    if (!story || chapter === null) return;

    const encoded = `?story=${encodeURIComponent(story)}&chapter=${chapter}`;
    window.location.search = encoded;
  } catch (e) {
    console.warn("Failed to parse lastStoryRead:", e);
  }
}

function initiateReader() {
  document.addEventListener("DOMContentLoaded", () => {
    restoreLastStoryRead();
    initReader();
    activateImageNavigation(document);
    bindEmailActions();
  });

  document.addEventListener("click", (e) => {
    const target = e.target;
    const bookmarks = Array.from(document.querySelectorAll(".reader-bookmark"));
    if (!bookmarks.length) return;

    if (target.classList.contains("btn-scroll-down")) {
      const upBtn = document.querySelector(".btn-scroll-up");
      if (!upBtn) return;
      upBtn.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (target.classList.contains("btn-scroll-up")) {
      const anchor = window.readerTopAnchor ||
        document.body.firstElementChild ||
        document.body;

      anchor.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      return;
    }
  });
}

export async function setupReader(root = document) {
  bindNavigationEvents(root);
  activateImageNavigation(root);
  refreshTategakiFont(root);
  observeAndSaveBookmarkProgress(root);
}

export async function readerIsFullyLoaded() {
  const requestAnimationFramePromise = async (callback) => {
    const done = await new Promise(resolve => {
      requestAnimationFrame(() => {
        callback(resolve);
      });
    });
    return done;
  };

  return new Promise(resolve => {
    const checkReady = async () => {
      if (document.readyState === "complete" && document.querySelectorAll(".reader-bookmark").length > 0)
        resolve(true); // Resolve the outer promise when ready
      await requestAnimationFramePromise(checkReady);
    };

    checkReady(resolve); // Start the initial check with resolve as the callback
  });
}

export function getParams() {
  return {
    storyPath: window.storyPath,
    chapter: window.chapter
  };
}

export function forceBookmark(bookmarkId) {
  const base = getStoryBaseUrl();
  if (!base) return;

  const storyKey = makeStoryKey(base);
  const key = `bookmark_${storyKey}_ch${window.chapter}`;

  const target = document.getElementById(bookmarkId);
  if (!target) {
    console.warn(`No element found with ID "${bookmarkId}".`);
    return;
  }

  localStorage.setItem(key, bookmarkId);
}

async function renderXmlDoc(xmlDoc, opts) {
  const paras = getElementsByAliases(xmlDoc, ["w:p", "paragraph"]);

  let htmlContent = paras.map(p => {
    const isCleaned = p.tagName === "paragraph";
    const pPr = isCleaned ? null : p.getElementsByTagName("w:pPr")[0];
    let style = "";

    if (!isCleaned && pPr) {
      const styleEl = pPr.getElementsByTagName("w:pStyle")[0];
      if (styleEl) style = styleEl.getAttribute("w:val") || "";
    }

    let tag = "p";
    let className = "reader-paragraph";

    if (style === "Title") {
      tag = "h1";
      className = "reader-title";
    } else if (style === "Heading1" || style === "Heading2") {
      tag = "h2";
      className = "reader-subtitle";
    } else if (style === "Quote") {
      tag = "blockquote";
      className = "reader-quote";
    } else if (style === "IntenseQuote") {
      tag = "blockquote";
      className = "reader-quote reader-intense";
    }

    const runs = isCleaned
      ? Array.from(p.childNodes)
        .map(n => n.nodeType === 1 ? new XMLSerializer().serializeToString(n) : (n.textContent || ""))
        .join("")
      : Array.from(p.getElementsByTagName("w:r")).map(run => {
        const text = Array.from(run.getElementsByTagName("w:t"))
          .map(t => t.textContent)
          .join("");

        const rPr = run.getElementsByTagName("w:rPr")[0];
        const spanClass = [];

        if (rPr) {
          if (rPr.getElementsByTagName("w:b").length) spanClass.push("reader-bold");
          if (rPr.getElementsByTagName("w:i").length) spanClass.push("reader-italic");
          if (rPr.getElementsByTagName("w:u").length) spanClass.push("reader-underline");
          if (rPr.getElementsByTagName("w:strike").length) spanClass.push("reader-strike");
          if (rPr.getElementsByTagName("w:smallCaps").length) spanClass.push("reader-smallcaps");
        }

        return `<span class="${spanClass.join(" ")}">${text}</span>`;
      }).join("");

    return `<${tag} class="${className}">${runs}</${tag}>`;
  }).join("\n");

  htmlContent = replaceEmails(htmlContent);
  htmlContent = replaceSmsMessages(htmlContent);
  htmlContent = replaceTategaki(htmlContent);
  htmlContent = replaceImageTags(htmlContent);

  if (opts.withBookmarks && opts.storyBase && Number.isInteger(opts.chapter)) {
    htmlContent = injectBookmarksIntoHTML(htmlContent, opts.storyBase, opts.chapter);
  }

  window.readerRoot.innerHTML = htmlContent;
  await replaceSVGs(window.readerRoot);

  requestAnimationFrame(() => {
    refreshPNum(document);
  });

  observeAndSaveBookmarkProgress(document);
  activateImageNavigation(document);
  bindNavigationEvents(document);
  refreshTategakiFont(document);

  if (opts.withBookmarks && opts.storyBase && Number.isInteger(opts.chapter)) {
    requestAnimationFrame(() => {
      restoreBookmark(opts.storyBase, opts.chapter);
    });
  }
}

function parseXmlText(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");

  const parseError = xmlDoc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    const msg = parseError.textContent || "Invalid XML";
    throw new Error(msg);
  }

  return xmlDoc;
}

function pickSingleFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";

    input.addEventListener("change", () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      input.remove();
      resolve(file);
    }, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
}

window.debug = window.debug || {};

window.debug.pickXml = async function () {
  const file = await pickSingleFile(".xml,application/xml,text/xml");
  if (!file) return;

  const xmlText = await readFileAsText(file);
  const xmlDoc = parseXmlText(xmlText);

  await renderXmlDoc(xmlDoc, {
    withBookmarks: false,
    storyBase: null,
    chapter: null
  });
};

window.debug.renderXmlText = async function (xmlText) {
  const xmlDoc = parseXmlText(xmlText);

  await renderXmlDoc(xmlDoc, {
    withBookmarks: false,
    storyBase: null,
    chapter: null
  });
};

window.debug.renderXmlFile = async function (file) {
  const xmlText = await readFileAsText(file);
  const xmlDoc = parseXmlText(xmlText);

  await renderXmlDoc(xmlDoc, {
    withBookmarks: false,
    storyBase: null,
    chapter: null
  });
};

if (/\/reader(?:\.html)?(?:\/|$)/.test(window.location.pathname)) initiateReader();