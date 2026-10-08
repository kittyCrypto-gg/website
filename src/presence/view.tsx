import type { JSX } from "react";
import { toDateTimeAttribute, formatPresenceTimestamp, getCurrentLocalClock, resolvePresencePresentation } from "./model.ts";
import type { PresenceSnapshot, PresencePresentation, PresenceMetricProps } from "./model.ts";

/**
 * Renders one metric row in the details grid.
 *
 * @param {PresenceMetricProps} props - Metric label/value pair.
 * @returns {JSX.Element} Structured metric card.
 */
function PresenceMetric(props: PresenceMetricProps): JSX.Element {
    return (
        <div className="presence-panel__metric">
            <dt className="presence-panel__metric-label">{props.label}</dt>
            <dd className="presence-panel__metric-value">
                <time dateTime={props.dateTime || undefined}>{props.value}</time>
            </dd>
        </div>
    );
}

/**
 * Renders the status pill shown above the hero.
 *
 * @param {PresencePresentation} presentation - Current visual presentation.
 * @returns {JSX.Element} Status pill.
 */
function PresencePill(presentation: PresencePresentation): JSX.Element {
    return (
        <div className="stats-segment presence-panel__pill">
            <span className="presence-panel__pill-emoji" aria-hidden="true">{presentation.emoji}</span>
            <span className="presence-panel__pill-label">{presentation.badge}</span>
        </div>
    );
}

/**
 * Renders the local clock section.
 *
 * @returns {JSX.Element} Secondary hero showing the local clock and UTC offset.
 */
function PresenceLocalTimeHero(): JSX.Element {
    const localClock = getCurrentLocalClock();

    return (
        <section className="presence-panel__hero presence-panel__hero--clock">
            <div className="presence-panel__hero-copy">
                <div className="presence-panel__hero-label">Kitty&apos;s local time</div>
                <div className="presence-panel__headline presence-panel__headline--clock">
                    <canvas className="presence-panel__clock-canvas"
                        role="img" aria-label="Live local clock"
                        width={640} height={48}>
                        {localClock.currentDateTime}
                    </canvas>
                </div>
                <p className="presence-panel__subline">{localClock.utcOffset}</p>
            </div>
        </section>
    );
}

/**
 * Renders the full presence card from a snapshot.
 *
 * @param {PresenceSnapshot} snapshot - Current presence payload.
 * @returns {JSX.Element} Rendered presence card.
 */
export function PresenceCard(snapshot: PresenceSnapshot): JSX.Element {
    const presentation = resolvePresencePresentation(snapshot);
    const lastActivityDateTime = toDateTimeAttribute(snapshot.lastActivityAt);

    return (
        <article className="presence-panel" data-presence-tone={presentation.tone}>
            <PresencePill {...presentation} />

            <section className="presence-panel__hero">
                <div className="presence-panel__hero-copy">
                    <div className="presence-panel__hero-label">
                        Kitty is: <span>&nbsp;</span>
                        {presentation.statusText}
                    </div>

                    <p className="presence-panel__subline">{presentation.subline}</p>
                </div>
            </section>

            <dl className="presence-panel__grid">
                <PresenceMetric
                    label="Last activity"
                    value={formatPresenceTimestamp(snapshot.lastActivityAt)}
                    dateTime={lastActivityDateTime || undefined}
                />
            </dl>

            <PresenceLocalTimeHero />
        </article>
    );
}

/**
 * Renders the lightweight loading state.
 *
 * @param {{ message: string }} props - Component props.
 * @returns {JSX.Element} Loading state card.
 */
export function PresenceLoadingCard(props: { message: string }): JSX.Element {
    const presentation: PresencePresentation = {
        tone: "active",
        emoji: "🟦",
        badge: "Loading",
        statusText: "Loading",
        subline: props.message
    };

    return (
        <article className="presence-panel presence-panel--loading" data-presence-tone={presentation.tone}>
            <PresencePill {...presentation} />

            <section className="presence-panel__hero">
                <div className="presence-panel__hero-copy">
                    <div className="presence-panel__hero-label">
                        Kitty is: <span>&nbsp;</span>
                        {presentation.statusText}
                    </div>

                    <p className="presence-panel__subline">{presentation.subline}</p>
                </div>
            </section>
        </article>
    );
}

/**
 * Renders the error state shown when the fetch fails.
 *
 * @param {{ message: string }} props - Component props.
 * @returns {JSX.Element} Error state card.
 */
export function PresenceErrorCard(props: { message: string }): JSX.Element {
    const presentation: PresencePresentation = {
        tone: "offline",
        emoji: "⬛",
        badge: "Unavailable",
        statusText: "Unavailable",
        subline: props.message
    };

    return (
        <article className="presence-panel presence-panel--error" data-presence-tone={presentation.tone}>
            <PresencePill {...presentation} />

            <section className="presence-panel__hero">
                <div className="presence-panel__hero-copy">
                    <div className="presence-panel__hero-label">
                        Kitty is: <span>&nbsp;</span>
                        {presentation.statusText}
                    </div>

                    <p className="presence-panel__subline">{presentation.subline}</p>
                </div>
            </section>
        </article>
    );
}
