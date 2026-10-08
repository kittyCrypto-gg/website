import { WindowCore } from "./WindowCore.ts";
import { createRuntimeWindowStructure } from "./staticFrame.tsx";
import { applyContentRootLayout } from "./layout.ts";

/** Window feature: WindowStructure responsibility. */
export class WindowStructure extends WindowCore {
    /**
     * Creates only dynamic, code-requested windows. Pages with static markup
     * take the hydrateStaticFrame path without constructing or moving nodes.
     */
    protected buildWindow(): void {
        const frame = this.frameEl;
        if (!frame) throw new Error("Cannot build window without a content element");

        if (frame.dataset.kcStaticWindow === this.windowId) {
            this.hydrateStaticFrame();
            return;
        }

        this.originalContentNodes = Array.from(frame.childNodes);
        const { header, body, contentRoot } = createRuntimeWindowStructure(
            this.windowId,
            this.options.title ?? frame.getAttribute("data-window-title") ?? "Window",
            this.options
        );
        for (const node of this.originalContentNodes) contentRoot.appendChild(node);
        frame.append(header, body);

        this.headerEl = header;
        this.bodyEl = body;
        this.contentRootEl = contentRoot;
        this.closeButtonEl = header.querySelector<HTMLButtonElement>('[data-window-role="close"]');
        this.minimiseButtonEl = header.querySelector<HTMLButtonElement>('[data-window-role="minimise"]');
        this.floatButtonEl = header.querySelector<HTMLButtonElement>('[data-window-role="float"]');
        this.titleEl = header.querySelector<HTMLSpanElement>(".window-title");

        if (this.contentLayout) applyContentRootLayout(contentRoot, this.contentLayout);
    }

    /**
     * Attaches the controller to a window structure emitted by the page build.
     * Performs no replacements or content relocation.
     */
    protected hydrateStaticFrame(): void {
        const frame = this.frameEl;
        if (!frame) return;

        const header = frame.querySelector(":scope > .window-header");
        const body = frame.querySelector(":scope > .window-body");
        const contentRoot = body?.querySelector(":scope > [data-window-content-root='true']");
        const title = header?.querySelector(".window-title");
        if (!(header instanceof HTMLDivElement)) throw new Error("Static window header missing");
        if (!(body instanceof HTMLDivElement)) throw new Error("Static window body missing");
        if (!(contentRoot instanceof HTMLDivElement)) throw new Error("Static window content missing");
        if (!(title instanceof HTMLSpanElement)) throw new Error("Static window title missing");

        this.headerEl = header;
        this.bodyEl = body;
        this.contentRootEl = contentRoot;
        this.titleEl = title;
        this.closeButtonEl = header.querySelector<HTMLButtonElement>('[data-window-role="close"]');
        this.minimiseButtonEl = header.querySelector<HTMLButtonElement>('[data-window-role="minimise"]');
        this.floatButtonEl = header.querySelector<HTMLButtonElement>('[data-window-role="float"]');
        this.originalContentNodes = Array.from(contentRoot.childNodes);

        if (this.contentLayout) applyContentRootLayout(contentRoot, this.contentLayout);
    }

}
