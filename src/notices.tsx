import * as uiFetch from "./uiFetch.ts";
import { mountWindow, type WindowHandle } from "./window.ts";
import * as h from "./helpers.ts";

export type Ntc = Readonly<{
    id: string;
    ttl: string;
    txt: string;
    st: string;
    en: string;
    stDt: Date;
    enDt: Date;
}>;

type Seen = readonly string[];
type OnTgl = (() => void) | undefined;

const LS_KEY = "kc-ntcs-rd";
const WND_ID = "kc-ntcs";
const WIN_STORE_KEY = `window-api:${WND_ID}:state`;
const ROOT_ID = "kc-notices";
const CARD_SEL = ".ntcs-card[data-ntc-id]";
const MIN_W = 800;
const CHR_H = 56;

/**
 * @param {number[]} bts Hash bytes from the helper thingy.
 * @returns {string} Hex string for storage and other boring adult tasks.
 */
function bts2Hex(bts: readonly number[]): string {
    return bts.map((bt) => bt.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {string} ttl Notice title.
 * @param {string} txt Notice text.
 * @param {string} st Notice start timestamp.
 * @param {string} en Notice end timestamp.
 * @returns {Promise<string>} Stable SHA-based id so the notice does not do identity fraud.
 */
async function mkId(ttl: string, txt: string, st: string, en: string): Promise<string> {
    const src = `${ttl}\n${en}\n${st}\n${txt}`;
    const bts = await h.hashString(src);
    return bts2Hex(bts);
}

/**
 * @param {string} raw Pathname from the browser.
 * @returns {boolean} True when we're on the index page, false when we wandered off.
 */
function isIdx(raw: string): boolean {
    const pth = raw.trim().toLowerCase();
    return pth === "/" || pth === "/index" || pth === "/index.html";
}

/**
 * @param {unknown} raw Random thing from JSON land.
 * @returns {raw is Record<string, unknown>} True when it is a plain object and not a weird banana.
 */
function isRec(raw: unknown): raw is Record<string, unknown> {
    return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/**
 * @param {unknown} raw Date soup from the backend.
 * @returns {Date | null} Parsed date, or null when time itself says no.
 */
function prsDt(raw: unknown): Date | null {
    if (typeof raw !== "string") return null;

    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * @param {Date} dt A real date, hopefully not forged.
 * @returns {string} `yyyy.mm.dd HH:mm`, neat and boring in the good way.
 */
function fmtDt(dt: Date): string {
    const yr = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const dy = String(dt.getDate()).padStart(2, "0");
    const hr = String(dt.getHours()).padStart(2, "0");
    const mn = String(dt.getMinutes()).padStart(2, "0");

    return `${yr}.${mo}.${dy} ${hr}:${mn}`;
}

/**
 * @param {unknown} raw Whatever the JSON threw at us this time.
 * @returns {raw is uiFetch.NtcJsonBody} True when it smells like a notice body and not a sock.
 */
function isNtcBody(raw: unknown): raw is uiFetch.NtcJsonBody {
    if (!isRec(raw)) return false;

    return typeof raw.notice === "string" &&
        typeof raw.start === "string" &&
        typeof raw.end === "string";
}

/**
 * @param {unknown} raw Possible title keyed notice map.
 * @returns {raw is uiFetch.NtcJsonMap} True when every value is a valid notice body.
 */
function isNtcMap(raw: unknown): raw is uiFetch.NtcJsonMap {
    if (!isRec(raw)) return false;
    return Object.values(raw).every((itm) => isNtcBody(itm));
}

/**
 * @param {uiFetch.NtcJson | readonly uiFetch.NtcJsonItm[] | uiFetch.NtcJsonMap | undefined} raw Raw notice payload in one of its many hats.
 * @returns {readonly uiFetch.NtcJsonItm[]} Flat list with titles attached.
 */
function getSrc(
    raw: uiFetch.NtcJson | readonly uiFetch.NtcJsonItm[] | uiFetch.NtcJsonMap | undefined
): readonly uiFetch.NtcJsonItm[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;

    if (isNtcMap(raw)) {
        return Object.entries(raw).map(([ttl, itm]) => ({
            title: ttl,
            notice: itm.notice,
            start: itm.start,
            end: itm.end
        }));
    }

    if ("notices" in raw) {
        return getSrc(raw.notices);
    }

    return [];
}

/**
 * @param {uiFetch.NtcJsonItm} itm One notice blob, hopefully behaving itself.
 * @returns {Promise<Ntc | null>} Parsed notice, or null when the fields are wonky.
 */
async function mkNtc(itm: uiFetch.NtcJsonItm): Promise<Ntc | null> {
    const ttl = typeof itm.title === "string" ? itm.title.trim() : "";
    const txt = typeof itm.notice === "string" ? itm.notice.trim() : "";
    const st = typeof itm.start === "string" ? itm.start.trim() : "";
    const en = typeof itm.end === "string" ? itm.end.trim() : "";

    if (!ttl || !txt || !st || !en) return null;

    const stDt = prsDt(st);
    const enDt = prsDt(en);
    if (!stDt || !enDt) return null;
    if (enDt.getTime() <= stDt.getTime()) return null;

    const id = await mkId(ttl, txt, st, en);

    return {
        id,
        ttl,
        txt,
        st,
        en,
        stDt,
        enDt
    };
}

/**
 * @param {uiFetch.NtcJson} raw Raw payload from `/notices`, fresh off the wire.
 * @returns {Promise<readonly Ntc[]>} Parsed notices that survived inspection.
 */
export async function prsNtcs(raw: uiFetch.NtcJson): Promise<readonly Ntc[]> {
    const src = getSrc(raw);
    const ntcs = await Promise.all(src.map(async (itm) => mkNtc(itm)));
    return ntcs.filter((itm): itm is Ntc => itm !== null);
}

/**
 * @returns {Seen} Stored read ids, unless localStorage is having a sulk.
 */
function rdSeen(): Seen {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];

        const prs: unknown = JSON.parse(raw);
        if (!Array.isArray(prs)) return [];

        return prs.filter((itm): itm is string => typeof itm === "string" && itm.trim().length > 0);
    } catch {
        return [];
    }
}

/**
 * @param {Seen} ids Read ids to stash away for future-you.
 * @returns {void} Nothing. Just tidies the list and saves it.
 */
function svSeen(ids: Seen): void {
    try {
        const uniq = Array.from(new Set(ids));
        localStorage.setItem(LS_KEY, JSON.stringify(uniq));
    } catch {
        // Private mode can be a bit moody.
    }
}

/**
 * @param {readonly Ntc[]} ntcs Parsed notices.
 * @param {Date} now Current time from the user's browser.
 * @returns {readonly Ntc[]} Only the notices that are live right now, no time-travel nonsense.
 */
export function fltActNtcs(ntcs: readonly Ntc[], now: Date = new Date()): readonly Ntc[] {
    return ntcs.filter((ntc) => {
        const nowMs = now.getTime();
        const stMs = ntc.stDt.getTime();
        const enMs = ntc.enDt.getTime();

        return nowMs >= stMs && nowMs <= enMs;
    });
}

/**
 * @param {readonly Ntc[]} ntcs Parsed notices.
 * @param {Date} now Current time from the user's browser.
 * @param {Seen} seen Already read ids.
 * @returns {readonly Ntc[]} Only the notices that should actually show up.
 */
function fltNtcs(ntcs: readonly Ntc[], now: Date, seen: Seen): readonly Ntc[] {
    const seenSet = new Set(seen);

    return fltActNtcs(ntcs, now).filter((ntc) => !seenSet.has(ntc.id));
}

/**
 * @returns {Promise<readonly Ntc[]>} Fetches, parses, and filters current notices. A tiny conveyor belt of paperwork.
 */
export async function getActNtcs(): Promise<readonly Ntc[]> {
    const raw = await uiFetch.fetchNtcsData();
    const ntcs = await prsNtcs(raw);
    return fltActNtcs(ntcs, new Date());
}

/**
 * @param {string} txt Notice text from the backend.
 * @returns {string} Safe HTML with paragraphs and line breaks where they belong.
 */
function mkTxt(txt: string): string {
    return txt
        .split(/\n\s*\n/g)
        .map((bit) => bit.trim())
        .filter((bit) => bit.length > 0)
        .map((bit) => `<p>${h.escapeHtml(bit).replace(/\n/g, "<br>")}</p>`)
        .join("");
}

/**
 * @param {Ntc} ntc Parsed notice.
 * @returns {string} One notice card. Small, blunt, does the job.
 */
function mkCard(ntc: Ntc): string {
    return `
    <article class="ntcs-card" data-ntc-id="${ntc.id}" id="ntc-${ntc.id}">
      <div class="ntcs-card__tgl" tabindex="0" role="button" aria-expanded="false">
        <div class="ntcs-card__hdr">
          <span class="ntcs-card__arr">▶️</span>
          <span class="ntcs-card__ttl">${h.escapeHtml(ntc.ttl)}</span>
        </div>
      </div>

      <div class="ntcs-card__cnt content-collapsed">
        <div class="ntcs-card__meta">
        </div>

        <div class="ntcs-card__txt">${mkTxt(ntc.txt)}</div>
      </div>
    </article>
  `;
}

/**
 * @param {readonly Ntc[]} ntcs Notices that made the final cut.
 * @returns {string} The inner notice markup only, no frame, no window, no drama queen chrome.
 */
export function rndNtcs(ntcs: readonly Ntc[]): string {
    return `
    <section class="ntcs" aria-live="polite">
      <div class="ntcs__lst">
        ${ntcs.map((ntc) => mkCard(ntc)).join("")}
      </div>
    </section>
  `;
}

/**
 * @param {root} HTMLElement The mounted notice root.
 * @returns {readonly string[]} Notice ids currently in the DOM, the usual suspects.
 */
function getDomIds(root: HTMLElement): readonly string[] {
    return Array.from(root.querySelectorAll<HTMLElement>(CARD_SEL))
        .map((el) => el.dataset.ntcId || "")
        .filter((id) => id.length > 0);
}

/**
 * @param {wnd} WindowHandle Managed notice window.
 * @param {root} HTMLElement Notice root.
 * @param {cln} (() => void) | undefined Extra cleanup bits for observers and such.
 * @returns {void} Marks the visible notices as read when the window is closed.
 */
function atchCls(wnd: WindowHandle, root: HTMLElement, cln?: (() => void) | undefined): void {
    const frm = wnd.getFrameElement();
    if (!(frm instanceof HTMLElement)) return;

    const clsBtn = frm.querySelector(".window-controls .btn.close");
    if (!(clsBtn instanceof HTMLButtonElement)) return;

    clsBtn.addEventListener("click", () => {
        const ids = getDomIds(root);
        if (ids.length > 0) {
            svSeen([...rdSeen(), ...ids]);
        }

        cln?.();

        window.requestAnimationFrame(() => {
            wnd.dispose();
            root.remove();
        });
    });
}

/**
 * @param {wnd} WindowHandle Notice window handle.
 * @param {root} HTMLElement Notice root.
 * @returns {number} Natural content height for the current pill state, measured from the actual DOM.
 */
function getCntH(wnd: WindowHandle, root: HTMLElement): number {
    const frm = wnd.getFrameElement();
    if (!(frm instanceof HTMLElement)) return Math.ceil(root.scrollHeight);

    const oldFrmH = frm.style.height;
    const oldFrmMinH = frm.style.minHeight;
    const oldFrmMaxH = frm.style.maxHeight;
    const oldRootH = root.style.height;
    const oldRootMinH = root.style.minHeight;
    const oldRootMaxH = root.style.maxHeight;

    frm.style.height = "auto";
    frm.style.minHeight = "";
    frm.style.maxHeight = "none";

    root.style.height = "auto";
    root.style.minHeight = "";
    root.style.maxHeight = "none";

    const cntH = Math.ceil(root.scrollHeight);

    frm.style.height = oldFrmH;
    frm.style.minHeight = oldFrmMinH;
    frm.style.maxHeight = oldFrmMaxH;

    root.style.height = oldRootH;
    root.style.minHeight = oldRootMinH;
    root.style.maxHeight = oldRootMaxH;

    return cntH;
}

/**
 * @param {wnd} WindowHandle Notice window handle.
 * @param {root} HTMLElement Notice root.
 * @returns {void} Sets the window to either exact content height or 100vh, never a weird mushy middle state.
 */
function fitWnd(wnd: WindowHandle, root: HTMLElement): void {
    const frm = wnd.getFrameElement();
    if (!(frm instanceof HTMLElement)) return;

    const pxW = `${MIN_W}px`;

    frm.style.width = pxW;
    frm.style.minWidth = pxW;

    root.style.width = pxW;
    root.style.minWidth = pxW;

    const cntH = getCntH(wnd, root);
    const needFrmH = cntH + CHR_H;
    const maxFrmH = window.innerHeight;
    const useCap = needFrmH > maxFrmH;

    const frmH = useCap ? "100vh" : `${needFrmH}px`;
    const rootH = useCap ? `calc(100vh - ${CHR_H}px)` : `${cntH}px`;

    frm.style.height = frmH;
    frm.style.minHeight = frmH;
    frm.style.maxHeight = frmH;

    root.style.height = rootH;
    root.style.minHeight = rootH;
    root.style.maxHeight = rootH;
}

/**
 * @param {wnd} WindowHandle Notice window handle.
 * @param {root} HTMLElement Notice root.
 * @returns {void} Re-fits once now and once after the CSS has finished its little dramatic scene.
 */
function reqFit(wnd: WindowHandle, root: HTMLElement): void {
    window.requestAnimationFrame(() => {
        fitWnd(wnd, root);
    });

    window.setTimeout(() => {
        fitWnd(wnd, root);
    }, 280);
}

/**
 * @param {unknown} nd Random node from an event path.
 * @returns {boolean} True when it is an interactive thingy we should not hijcak.
 */
function isActNd(nd: unknown): boolean {
    return nd instanceof HTMLAnchorElement ||
        nd instanceof HTMLButtonElement ||
        nd instanceof HTMLInputElement ||
        nd instanceof HTMLTextAreaElement ||
        nd instanceof HTMLSelectElement ||
        nd instanceof HTMLLabelElement;
}

/**
 * @param {cnt} HTMLElement Notice content block.
 * @param {exp} boolean Whether it should be expanded or not.
 * @param {tgl} HTMLElement Toggle element for aria bits.
 * @param {arr} HTMLElement | null Arrow element.
 * @returns {void} Sets the visual state without pretending CSS can read minds.
 */
function setCntSt(
    cnt: HTMLElement,
    exp: boolean,
    tgl: HTMLElement,
    arr: HTMLElement | null
): void {
    tgl.setAttribute("aria-expanded", exp ? "true" : "false");

    if (arr) {
        arr.textContent = exp ? "🔽" : "▶️";
    }

    if (exp) {
        cnt.style.display = "block";
        cnt.classList.remove("content-collapsed");
        cnt.classList.add("content-expanded");
        return;
    }

    cnt.classList.remove("content-expanded");
    cnt.classList.add("content-collapsed");
}

/**
 * @param {cnt} HTMLElement Notice content block.
 * @param {tgl} HTMLElement Toggle element.
 * @param {arr} HTMLElement | null Arrow element.
 * @returns {void} Preps the body so collapsed cards stay actually collapsed.
 */
function initCntSt(cnt: HTMLElement, tgl: HTMLElement, arr: HTMLElement | null): void {
    setCntBdy(cnt, false);
    cnt.style.display = "none";
    cnt.style.maxHeight = "0px";
    setCntSt(cnt, false, tgl, arr);
}

/**
 * @param {cnt} HTMLElement Notice content block.
 * @returns {void} Forces layout so the browser stops being cheeky.
 */
function reflow(cnt: HTMLElement): void {
    void cnt.offsetHeight;
}

/**
 * @param {cnt} HTMLElement Notice content block.
 * @param {shw} boolean Whether the inner bits should be shown or tucked away.
 * @returns {void} Toggles the real content so collapsed pills stop leaking their little secrets.
 */
function setCntBdy(cnt: HTMLElement, shw: boolean): void {
    const meta = cnt.querySelector<HTMLElement>(".ntcs-card__meta");
    const txt = cnt.querySelector<HTMLElement>(".ntcs-card__txt");

    if (meta instanceof HTMLElement) {
        meta.style.display = shw ? "" : "none";
    }

    if (txt instanceof HTMLElement) {
        txt.style.display = shw ? "" : "none";
    }
}

/**
 * @param {root} HTMLElement Notice root with rendered cards.
 * @param {onTgl} (() => void) | undefined Optional callback for window re-fit stuff and similar silliness.
 * @returns {void} Wires the clicky foldy bits for any notice container, windowed or not.
 */
export function hydNtcs(root: HTMLElement, onTgl?: OnTgl): void {
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".ntcs-card"));
    if (cards.length === 0) return;

    cards.forEach((card) => {
        const tgl = card.querySelector(".ntcs-card__tgl");
        const cnt = card.querySelector<HTMLElement>(".ntcs-card__cnt");
        const arr = card.querySelector(".ntcs-card__arr");

        if (!(tgl instanceof HTMLElement)) return;
        if (!(cnt instanceof HTMLElement)) return;

        const arrEl = arr instanceof HTMLElement ? arr : null;
        initCntSt(cnt, tgl, arrEl);

        /**
         * @param {boolean} exp Whether to open or close the card.
         * @returns {void} Runs the pill accordion without tripping over itself like a noodle.
         */
        const setExp = (exp: boolean): void => {
            if (exp) {
                cnt.style.display = "block";
                setCntBdy(cnt, true);
                cnt.style.maxHeight = "0px";
                setCntSt(cnt, true, tgl, arrEl);
                reflow(cnt);
                cnt.style.maxHeight = `${cnt.scrollHeight}px`;
                onTgl?.();
                return;
            }

            cnt.style.maxHeight = `${cnt.scrollHeight}px`;
            reflow(cnt);
            setCntBdy(cnt, false);
            setCntSt(cnt, false, tgl, arrEl);
            cnt.style.maxHeight = "0px";
            onTgl?.();
        };

        /**
         * @returns {void} Toggles one card, nothing cosmic.
         */
        const tog = (): void => {
            const exp = cnt.classList.contains("content-expanded");
            setExp(!exp);
        };

        card.addEventListener("click", (ev) => {
            const pth = ev.composedPath();
            const hitCtl = pth.find((nd) => isActNd(nd));
            if (hitCtl) return;

            tog();
        });

        tgl.addEventListener("keydown", (ev) => {
            if (ev.key !== "Enter" && ev.key !== " ") return;

            ev.preventDefault();

            const pth = ev.composedPath();
            const hitCtl = pth.find((nd) => isActNd(nd));
            if (hitCtl) return;

            tog();
        });

        cnt.addEventListener("transitionend", (ev) => {
            if (ev.target !== cnt) return;
            if (ev.propertyName !== "max-height") return;

            if (cnt.classList.contains("content-collapsed")) {
                cnt.style.display = "none";
                cnt.style.maxHeight = "0px";
                onTgl?.();
                return;
            }

            cnt.style.display = "block";
            setCntBdy(cnt, true);
            cnt.style.maxHeight = `${cnt.scrollHeight}px`;
            onTgl?.();
        });
    });
}

/**
 * @param {root} HTMLElement Host element that gets the inner notice markup.
 * @param {ntcs} readonly Ntc[] Notices to shove in there.
 * @param {onTgl} (() => void) | undefined Optional callback when cards flap open or shut.
 * @returns {void} Populates a notice host with just the inside bits, no window sprinkles attached.
 */
export function popNtcs(root: HTMLElement, ntcs: readonly Ntc[], onTgl?: OnTgl): void {
    root.innerHTML = rndNtcs(ntcs);
    hydNtcs(root, onTgl);
}

/**
 * @param {root} HTMLElement Notice root element.
 * @returns {WindowHandle} Window handle for the new notice window.
 */
function mkWnd(root: HTMLElement): WindowHandle {
    root.classList.add("ntcs-window");

    return mountWindow(root, {
        id: WND_ID,
        title: "Website Notices",
        mountTarget: document.body,
        initFloat: true,
        initClosed: false,
        initMini: false,
        showCloseBttn: true,
        showMiniBttn: true,
        showFloatBttn: true
    });
}

/**
 * @param {wnd} WindowHandle Notice window handle.
 * @param {root} HTMLElement Notice root.
 * @returns {() => void} Cleanup fn for resize watching and assorted gremlins.
 */
function atchFit(wnd: WindowHandle, root: HTMLElement): () => void {
    const onWinRsz = (): void => {
        fitWnd(wnd, root);
    };

    window.addEventListener("resize", onWinRsz);

    return (): void => {
        window.removeEventListener("resize", onWinRsz);
    };
}

/**
 * @param {root} HTMLElement Notice root before window mount.
 * @returns {number} First-pass frame height for centring the initial spawn.
 */
function getInitFrmH(root: HTMLElement): number {
    const cntH = Math.ceil(root.scrollHeight);
    return Math.min(window.innerHeight, cntH + CHR_H);
}

/**
 * @param {readonly Ntc[]} ntcs Notices to show right now, before they scamper off.
 * @returns {void} Mounts the window and opens it.
 */
function mntNtcs(ntcs: readonly Ntc[]): void {
    const old = document.getElementById(ROOT_ID);
    if (old instanceof HTMLElement) {
        old.remove();
    }

    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.style.width = `${MIN_W}px`;
    root.style.minWidth = `${MIN_W}px`;
    document.body.appendChild(root);

    popNtcs(root, ntcs);

    h.ensCtrWinState({
        storeKey: WIN_STORE_KEY,
        width: MIN_W,
        height: getInitFrmH(root),
        force: true
    });

    const wnd = mkWnd(root);
    wnd.open();

    const stopFit = atchFit(wnd, root);
    const onTgl = (): void => {
        reqFit(wnd, root);
    };

    atchCls(wnd, root, stopFit);
    hydNtcs(root, onTgl);

    window.requestAnimationFrame(() => {
        fitWnd(wnd, root);
    });
}

/**
 * @returns {Promise<void>} Boots the notice module on the homepage, unless there is nothing worth showing.
 */
export async function initNtcs(): Promise<void> {
    if (isIdx(window.location.pathname)) return;

    const raw = await uiFetch.fetchNtcsData().catch(() => null);
    if (!raw) return;

    const ntcs = await prsNtcs(raw);
    if (ntcs.length === 0) return;

    const shw = fltNtcs(ntcs, new Date(), rdSeen());
    if (shw.length === 0) return;

    mntNtcs(shw);
}