import * as icons from "../icons.tsx";
import { render2Frag, render2Mkup } from "../reactHelpers.tsx";

/**
 * Data-independent RSS filter markup, shared by the production page builder
 * and the browser fallback. Post-dependent calendar/author values arrive later.
 */
export function RssFiltersShell(): JSX.Element {
    return (
        <div id="kc-blog-filters" className="rss-filters"
            data-rss-filters-open="0" data-kc-static-rss-shell="1">
            <div className="rss-filters__hdr kc-click-header"
                data-rss-filters-header="1" role="button" tabIndex={0}
                aria-expanded="false" title="Expand filters">
                <h3 className="rss-filters__ttl">Filters: </h3>
                <div className="rss-filters__summary kc-click-header__control"
                    data-rss-filters-summary="1" hidden aria-hidden="true"
                    aria-label="Selected filters" />
                <div className="rss-filters__hdrActions kc-click-header__actions">
                    <button type="button" className="rss-filters__clear kc-click-header__control"
                        data-rss-filters-clear-all="1" hidden aria-hidden="true"
                        title="Clear all filters">Clear all</button>
                    <button type="button"
                        className="rss-filters__toggle kc-round-icon-btn kc-click-header__control"
                        data-rss-filters-toggle="1" aria-controls="kc-blog-filters-body"
                        aria-expanded="false" aria-label="Expand filters" title="Expand filters">
                        {icons.MakeIncreaseFontIcon()}
                    </button>
                </div>
            </div>
            <div id="kc-blog-filters-body" className="rss-filters__body" aria-hidden="true">
                <div className="rss-filters__body-inner">
                    <div id="kc-blog-cal-filter" className="blog-cal-slot"
                        aria-label="Blog date filters" />
                    <div id="kc-blog-author-filter" className="rss-author-filter-slot" />
                </div>
            </div>
        </div>
    );
}

/** The browser can hydrate the exact same elements if it encounters old HTML. */
export function createRssFilterShell(): HTMLDivElement {
    const root = render2Frag(<RssFiltersShell />).firstElementChild;
    if (!(root instanceof HTMLDivElement)) throw new Error("RSS filter shell must be a div");
    return root;
}

export function renderRssFilterShell(): string {
    return render2Mkup(<RssFiltersShell />);
}

/** Reserved content mount; only fetched posts replace this placeholder. */
export function RssLoadingState(): JSX.Element {
    return (
        <div className="rss-loading" role="status" aria-live="polite">
            Loading posts…
        </div>
    );
}

export function renderRssLoadingState(): string {
    return render2Mkup(<RssLoadingState />);
}
