import type { MainJson, MainMenuEntry, MainThemeEntry } from "./uiFetch.ts";
import { makeStableId } from "./helpers/ids.ts";
import { render2Mkup } from "./reactHelpers.tsx";

type IconMap = Readonly<Record<string, string>>;

function readMenuEntry(entry: MainMenuEntry): { href: string; icon: string | null } {
    if (typeof entry === "string") return { href: entry, icon: null };
    return { href: entry.href, icon: entry.icon?.trim() || null };
}

function themeName(key: string, value: MainThemeEntry): string {
    return value.name?.trim() || key;
}

/** The same static shell is used by the page builder and browser fallback. */
export function renderMenuShell(data: MainJson, icons: IconMap = {}): string {
    const themeEntries = Object.entries(data.themes ?? {});
    const initialTheme = data.themes?.miku ? "miku" : themeEntries[0]?.[0] ?? "";

    return render2Mkup(
        <>
            <div id="main-menu-links" className="menu-links">
                {Object.entries(data.mainMenu).map(([text, entry]) => {
                    const { href, icon } = readMenuEntry(entry);
                    const svg = icon ? icons[icon] : null;
                    return (
                        <a
                            key={text}
                            id={makeStableId("kc-main-menu_", text)}
                            href={href}
                            className={icon ? "menu-button menu-button--with-icon" : "menu-button"}
                            data-menu-icon={icon ?? undefined}
                        >
                            {icon ? (
                                <span className="menu-button-icon-wrap" aria-hidden="true">
                                    {svg ? <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : (
                                        <img className="reader-ui-icon menu-button-icon" src={icon} alt="" width="16" height="16" />
                                    )}
                                </span>
                            ) : null}
                            <span className="menu-button-text">{text}</span>
                        </a>
                    );
                })}
            </div>
            {themeEntries.length ? (
                <section id="main-menu-theme-shell" className="menu-theme-shell" data-menu-themes-open="0">
                    <header className="menu-theme-head kc-click-header" data-menu-theme-head="1" role="button" tabIndex={0}>
                        <span className="menu-theme-title">
                            <span className="menu-theme-new">New!</span>
                            <span className="menu-theme-prompt">Pick a theme!</span>
                        </span>
                        <span className="menu-theme-actions kc-click-header__actions">
                            <button type="button" className="menu-theme-toggle kc-round-icon-btn kc-click-header__control"
                                data-menu-theme-tgl="1" aria-controls="main-menu-themes-body" aria-label="Expand theme picker">+</button>
                        </span>
                    </header>
                    <div id="main-menu-themes-body" className="menu-theme-body" aria-hidden="true" style={{ maxHeight: "0px" }}>
                        <div className="menu-theme-inner">
                            <span className="menu-theme-caption">Themes:</span>
                            <div id="main-menu-themes" className="menu-themes" role="radiogroup" aria-label="Theme">
                                {themeEntries.map(([key, entry]) => (
                                    <span className="menu-theme-item" key={key}>
                                        <input id={makeStableId("kc-theme_", key)} type="radio" name="site-theme"
                                            value={key} className="menu-theme-radio" defaultChecked={key === initialTheme} />
                                        <label className="menu-theme-label" htmlFor={makeStableId("kc-theme_", key)}>
                                            {themeName(key, entry)}
                                        </label>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}
        </>
    );
}

export function renderToggleShell(
    id: string, title: string, emoji: string, classes: string,
    bottom: string | null = null, iconMarkup: string | null = null, iconPath: string | null = null,
    iconClass = "theme-toggle-button__icon"
): string {
    return render2Mkup(
        <button id={id} type="button" className={classes} title={title}
            aria-label={title} style={bottom ? { bottom } : undefined}
            data-kc-static-toggle="1" data-kc-built-icon-path={iconPath ?? undefined}>
            {iconMarkup ? (
                <span className={iconClass} aria-hidden="true"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px" }}
                    dangerouslySetInnerHTML={{ __html: iconMarkup }} />
            ) : emoji}
        </button>
    );
}
