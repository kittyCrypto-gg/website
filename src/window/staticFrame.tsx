import { render2Frag, render2Mkup } from "../reactHelpers.tsx";
import type { WindowApiOptions, WindowButtonRole } from "./types.ts";
import { shouldShowButton } from "./controls.ts";

const labels: Readonly<Record<WindowButtonRole, string>> = {
    close: "Close",
    minimise: "Minimise / restore",
    float: "Float / dock"
};

function WindowControl({ id, role }: { id: string; role: WindowButtonRole }) {
    return (
        <button
            type="button"
            id={`${id}-btn-${role}`}
            className={role === "minimise" ? "btn minimise toggle-view" : `btn ${role}`}
            data-window-role={role}
            title={labels[role]}
            aria-label={labels[role]}
        >
            <svg viewBox="0 0 12 12" width="1em" height="1em" aria-hidden="true" focusable="false">
                <circle cx="6" cy="6" r="5" style={{ fill: `var(--window-btn-${role}-fill)` }} />
            </svg>
        </button>
    );
}

/** One component defines the head for both build-time output and runtime fallbacks. */
function WindowFrameHead({ id, title, options }: {
    id: string; title: string; options: WindowApiOptions;
}) {
    const roles = (["close", "minimise", "float"] as const).filter((role) =>
        shouldShowButton(options, role)
    );
    return (
        <div id={`${id}-header`} className="window-header">
            <div className="window-controls">
                {roles.map((role) => <WindowControl key={role} id={id} role={role} />)}
            </div>
            <span id={`${id}-title`} className="window-title">{title}</span>
        </div>
    );
}

function WindowFrameBody({ id, contents }: { id: string; contents?: string }) {
    return (
        <div id={`${id}-body`} className="window-body">
            <div className="window-content-root" data-window-content-root="true"
                dangerouslySetInnerHTML={contents === undefined ? undefined : { __html: contents }} />
        </div>
    );
}

/** Build and runtime share the exact same body and content-root elements. */
export function renderStaticWindowBody(id: string, contents: string): string {
    return render2Mkup(<WindowFrameBody id={id} contents={contents} />);
}

/** Only dynamic, code-created windows need their framework nodes constructed. */
export function createRuntimeWindowStructure(
    id: string, title: string, options: WindowApiOptions
): Readonly<{ header: HTMLDivElement; body: HTMLDivElement; contentRoot: HTMLDivElement }> {
    const fragment = render2Frag(
        <>
            <WindowFrameHead id={id} title={title} options={options} />
            <WindowFrameBody id={id} />
        </>
    );
    const header = fragment.querySelector<HTMLDivElement>(".window-header");
    const body = fragment.querySelector<HTMLDivElement>(".window-body");
    const contentRoot = fragment.querySelector<HTMLDivElement>("[data-window-content-root]");
    if (!header || !body || !contentRoot) throw new Error("Failed to create window structure");
    return { header, body, contentRoot };
}

/** Static frame structure matching WindowMaker.buildWindow(), with no browser state. */
export function renderStaticWindowHead(id: string, title: string, options: WindowApiOptions): string {
    return render2Mkup(<WindowFrameHead id={id} title={title} options={options} />);
}

/** Launchers are also part of the static document and hydrate in place. */
export function renderStaticLauncher(id: string, title: string, src: string, closedDisplay: string): string {
    return render2Mkup(
        <img
            id={`window-api-launcher-${id}`}
            data-kc-static-window-launcher={id}
            className="window-launcher"
            data-window-launcher-visible="false"
            src={src}
            alt={`${title} icon`}
            title={`Double-click to open ${title}`}
            draggable={false}
            width={48}
            height={48}
            style={{ width: "48px", height: "48px", objectFit: "contain", ["--window-launcher-display" as string]: closedDisplay }}
        />
    );
}
