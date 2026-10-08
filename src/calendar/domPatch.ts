import { renderCalendarView } from "./view.tsx";
import type { CalSct, CalVw } from "./types.ts";

type CalRoot = HTMLElement;

/** Keep the scaffold and listeners stable; only state-bearing attributes change. */
function syncAttributes(target: Element, source: Element): void {
    const names = ["data-open", "aria-expanded", "aria-hidden", "title", "aria-label"];
    for (const name of names) {
        const value = source.getAttribute(name);
        if (value === null) continue;
        if (target.getAttribute(name) !== value) target.setAttribute(name, value);
    }
}

function required(root: ParentNode, selector: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error("Calendar shell missing: " + selector);
    return element;
}

function syncToggle(target: HTMLElement, source: HTMLElement): void {
    const wasOpen = target.getAttribute("aria-expanded");
    syncAttributes(target, source);
    if (wasOpen !== source.getAttribute("aria-expanded")) {
        target.replaceChildren(...Array.from(source.childNodes));
    }
}

function updateSelectedPills(oldHeader: HTMLElement, newHeader: HTMLElement): void {
    const previous = oldHeader.querySelector<HTMLElement>(".cal__selBar");
    const next = newHeader.querySelector<HTMLElement>(".cal__selBar");
    if (!next) {
        previous?.remove();
        return;
    }
    if (previous) {
        previous.replaceChildren(...Array.from(next.childNodes));
        return;
    }
    oldHeader.insertBefore(next, required(oldHeader, ".cal__hdrActions"));
}

function updateClearButton(oldHeader: HTMLElement, newHeader: HTMLElement): void {
    const existing = oldHeader.querySelector<HTMLElement>(".cal__clr");
    const fresh = newHeader.querySelector<HTMLElement>(".cal__clr");
    if (!fresh) {
        existing?.remove();
        return;
    }
    if (existing) return;
    const actions = required(oldHeader, ".cal__hdrActions");
    actions.insertBefore(fresh, required(actions, ".cal__rootTgl"));
}

function syncSection(oldRoot: CalRoot, newRoot: CalRoot, name: CalSct): void {
    const selector = `.cal__sct[data-cal-sct-root="${name}"]`;
    const previous = required(oldRoot, selector);
    const fresh = required(newRoot, selector);
    syncAttributes(previous, fresh);

    const oldHeader = required(previous, ".cal__sctHdr");
    const newHeader = required(fresh, ".cal__sctHdr");
    syncAttributes(oldHeader, newHeader);

    const count = required(previous, ".cal__sctCnt");
    const nextCount = required(fresh, ".cal__sctCnt");
    if (count.textContent !== nextCount.textContent) count.textContent = nextCount.textContent;

    syncToggle(required(previous, ".cal__sctTgl"), required(fresh, ".cal__sctTgl"));
    syncAttributes(required(previous, ".cal__sctBody"), required(fresh, ".cal__sctBody"));

    // Year/month/day buttons depend on the fetched RSS feed, not the static page.
    const container = required(previous, ".cal__sctBodyInner");
    const nextContainer = required(fresh, ".cal__sctBodyInner");
    container.replaceChildren(...Array.from(nextContainer.childNodes));
}

/**
 * Hydrate the calendar already built into blog.html without replacing its root,
 * header, toggle buttons or section containers. Subsequent selection changes
 * update only the dynamic date cells, pills, counters and control attributes.
 */
export function updateCalendarDom(host: HTMLElement, view: CalVw): void {
    const fragment = renderCalendarView(view);
    const fresh = fragment.firstElementChild;
    if (!(fresh instanceof HTMLElement)) throw new Error("Calendar render produced no root");

    const previous = host.querySelector<HTMLElement>(":scope > .cal");
    if (!previous) {
        host.replaceChildren(fresh);
        return;
    }

    syncAttributes(previous, fresh);
    const oldHeader = required(previous, ".cal__hdr");
    const newHeader = required(fresh, ".cal__hdr");
    syncAttributes(oldHeader, newHeader);

    const oldTitle = required(oldHeader, ".cal__ttl");
    const newTitle = required(newHeader, ".cal__ttl");
    if (oldTitle.textContent !== newTitle.textContent) oldTitle.textContent = newTitle.textContent;
    updateSelectedPills(oldHeader, newHeader);
    updateClearButton(oldHeader, newHeader);
    syncToggle(required(oldHeader, ".cal__rootTgl"), required(newHeader, ".cal__rootTgl"));
    syncAttributes(required(previous, ".cal__rootBody"), required(fresh, ".cal__rootBody"));

    for (const section of ["yrs", "mos", "dys"] as const) {
        syncSection(previous, fresh, section);
    }
}
