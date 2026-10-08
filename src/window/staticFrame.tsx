import { render2Mkup } from "../reactHelpers.tsx";
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

/** Static frame structure matching WindowMaker.buildWindow(), with no browser state. */
export function renderStaticWindowHead(id: string, title: string, options: WindowApiOptions): string {
    const roles = (["close", "minimise", "float"] as const).filter((role) =>
        shouldShowButton(options, role)
    );
    return render2Mkup(
        <div id={`${id}-header`} className="window-header">
            <div className="window-controls">
                {roles.map((role) => <WindowControl key={role} id={id} role={role} />)}
            </div>
            <span id={`${id}-title`} className="window-title">{title}</span>
        </div>
    );
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
