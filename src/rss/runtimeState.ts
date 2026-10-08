import { Clusteriser } from "../clusterise.ts";
import { CalCtrl, type CalSel } from "../calendar.tsx";
import { makeCalendarSelection, makeDefaultAuthorOff } from "./filterModel.ts";
import type { Pst } from "./types.ts";

/** One mutable RSS session shared by the lazily-loaded feature modules. */
export const rssState: {
    blogClstr: Clusteriser | null;
    calCtl: CalCtrl | null;
    allPsts: readonly Pst[];
    authorOff: Set<string>;
    athMenuOpen: boolean;
    curCalSel: CalSel;
} = {
    blogClstr: null,
    calCtl: null,
    allPsts: [],
    authorOff: makeDefaultAuthorOff(),
    athMenuOpen: false,
    curCalSel: makeCalendarSelection([], [], [])
};

let repaintHandler: (() => void) | null = null;

/** Avoid cross-import cycles between event handlers and their RSS orchestrator. */
export function registerRssFilterRepaint(handler: () => void): void {
    repaintHandler = handler;
}

export function notifyRssFiltersChanged(): void {
    if (!repaintHandler) throw new Error("RSS filter repaint handler is not registered");
    repaintHandler();
}
