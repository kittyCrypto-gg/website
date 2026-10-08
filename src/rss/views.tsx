import React from "react";
import * as icons from "../icons.tsx";
import {
    fmtDt,
    mkPstDomRef,
    mkPstShortId,
    mkPstSlug
} from "./postModel.ts";
import { DEFAULT_UNSELECTED_AUTHORS } from "./filterModel.ts";
import { renderRssMarkdown } from "./renderMarkdown.ts";
import type { AthOpt, Pst } from "./types.ts";

/**
 * Little share thing.
 * @param {Readonly<{ pst: Pst; placement: "top" | "bottom" }>} props
 * @returns {JSX.Element}
 */
export function RssShareBtn({
    pst,
    placement
}: Readonly<{
    pst: Pst;
    placement: "top" | "bottom";
}>): JSX.Element {
    const postRef = mkPstShortId(pst);

    return (
        <button
            type="button"
            className={`rss-post-share rss-post-share--${placement} kc-round-icon-btn`}
            data-rss-share-post={postRef}
            aria-label={`Share ${pst.ttl}`}
            title="Share post"
        >
            {icons.MakeShareIcon()}
        </button>
    );
}

/**
 * Comments slot, disabled sometimes.
 * @param {Readonly<{ slug: string; disabled: boolean }>} props
 * @returns {JSX.Element}
 */
export function RssCmntSlot({
    slug,
    disabled
}: Readonly<{
    slug: string;
    disabled: boolean;
}>): JSX.Element {
    if (disabled) {
        return (
            <section
                className="rss-comments rss-comments--disabled comments-container"
                data-rss-comment-disabled="1"
            >
                <div className="segment-header">Visitor Comments</div>

                <p className="rss-comments__status">
                    Comments are disabled for automated posts.
                </p>
            </section>
        );
    }

    return (
        <section
            className="rss-comments comments-container"
            data-rss-comment-slug={slug}
            data-rss-comment-disabled="0"
        >
            <div className="segment-header">Leave your comment!</div>

            <div className="comment-input">
                <div className="comment-row comment-meta-row">
                    <input
                        type="text"
                        id="comment-nick"
                        maxLength={32}
                        placeholder="Your nickname (max 32 characters)"
                        data-rss-comment-nick="1"
                    />

                    <input
                        type="text"
                        id="comment-website"
                        placeholder="Your Website (Optional)"
                        data-rss-comment-website="1"
                    />

                    <div className="comment-location-field">
                        <div className="comment-location-control">
                            <select
                                id="comment-location"
                                aria-label="Your location"
                                data-rss-comment-location="1"
                            >
                                <option value="">Location (Optional)</option>
                            </select>

                            <span
                                id="comment-location-flag"
                                aria-hidden="true"
                                data-rss-comment-location-flag="1"
                            >
                                🌎
                            </span>
                        </div>
                    </div>
                </div>

                <div className="comment-row comment-body-row">
                    <textarea
                        id="new-comment"
                        maxLength={256}
                        rows={4}
                        placeholder="Write your comment here (max 256 characters)..."
                        data-rss-comment-msg="1"
                    />
                </div>

                <div className="comment-row comment-submit-row">
                    <button
                        id="post-comment-button"
                        type="button"
                        data-rss-comment-post="1"
                    >
                        Post
                    </button>
                </div>
            </div>

            <div className="segment-header">Visitor Comments</div>

            <p
                className="rss-comments__status"
                data-rss-comments-status="1"
                aria-live="polite"
            >
                Comments load when the post is opened.
            </p>

            <div className="comments-box" data-rss-comments-box="1" />
        </section>
    );
}

/**
 * Big post card thing.
 * @param {Readonly<{ pst: Pst; exp: boolean }>} props
 * @returns {JSX.Element}
 */
export function PstCard({ pst, exp }: Readonly<{ pst: Pst; exp: boolean }>): JSX.Element {
    const postRef = mkPstDomRef(pst);
    const cnt = { __html: renderRssMarkdown(pst.cnt, postRef) };
    const arr = exp ? "🔽" : "▶️";
    const expd = exp ? "true" : "false";
    const cls = exp ? "rss-post-content content-expanded" : "rss-post-content content-collapsed";
    const commentsDisabled = DEFAULT_UNSELECTED_AUTHORS.has(pst.ath);
    const slug = mkPstSlug(pst);

    return (
        <article
            className="rss-post-block"
            data-pub={pst.pub}
            data-gid={pst.gid}
            data-rss-post-ref={postRef}
        >
            <div
                className="rss-post-toggle"
                {...(exp ? {} : { tabIndex: 0, role: "button" })}
                aria-expanded={expd}
            >
                <div className="rss-post-header">
                    <span className="summary-arrow">{arr}</span>
                    <span className="rss-post-title">{pst.ttl}</span>
                    <span className="rss-post-date">{fmtDt(pst.pub)}</span>
                    <RssShareBtn pst={pst} placement="top" />
                </div>

                <div className="rss-post-meta">
                    <span className="rss-post-author">By: {pst.ath}</span>
                </div>

                <div className="rss-post-summary summary-collapsed">
                    <span className="summary-text">{pst.dsc}</span>
                </div>
            </div>

            <div className={cls}>
                <div className="rss-post-content__inner" dangerouslySetInnerHTML={cnt} />

                <div className="rss-post-share-row">
                    <RssShareBtn pst={pst} placement="bottom" />
                </div>

                <RssCmntSlot
                    slug={slug}
                    disabled={commentsDisabled}
                />
            </div>
        </article>
    );
}

/**
 * Empty state, boring.
 * @param {Readonly<{ ttl: string; body: string }>} props
 * @returns {JSX.Element}
 */
export function EmptyBlk({ ttl, body }: Readonly<{ ttl: string; body: string }>): JSX.Element {
    return (
        <section className="rss-empty" aria-live="polite">
            <div className="rss-empty__ttl">{ttl}</div>
            <p className="rss-empty__txt">{body}</p>
        </section>
    );
}

/**
 * Wee author drawer button.
 * @param {Readonly<{ opn: boolean }>} props
 * @returns {JSX.Element}
 */
function AthTglBtn({ opn }: Readonly<{ opn: boolean }>): JSX.Element {
    return (
        <button
            type="button"
            className="rss-filters__toggle rss-author-filter__toggle kc-round-icon-btn kc-click-header__control"
            data-rss-author-menu-tgl="1"
            aria-controls="kc-blog-author-filter-body"
            aria-expanded={opn ? "true" : "false"}
            aria-label={opn ? "Collapse author filters" : "Expand author filters"}
            title={opn ? "Collapse author filters" : "Expand author filters"}
        >
            {opn ? icons.MakeDecreaseFontIcon() : icons.MakeIncreaseFontIcon()}
        </button>
    );
}

/**
 * Author all/select button.
 * @param {Readonly<{ act: string; txt: string; cnt: number; disabled: boolean }>} props
 * @returns {JSX.Element}
 */
function AuthorAllBtn({
    act,
    txt,
    cnt,
    disabled
}: Readonly<{
    act: string;
    txt: string;
    cnt: number;
    disabled: boolean;
}>): JSX.Element {
    return (
        <button
            type="button"
            className="rss-author-filter__all kc-click-header__control"
            data-rss-author-act={act}
            disabled={disabled}
            title={`${txt} (${cnt})`}
        >
            <span className="rss-author-filter__allTxt">{txt}</span>
            <span className="rss-author-filter__allCnt">{cnt}</span>
        </button>
    );
}

/**
 * Author buttons.
 * @param {Readonly<{ opts: readonly AthOpt[]; opn: boolean }>} props
 * @returns {JSX.Element}
 */
export function AuthorFilter({
    opts,
    opn
}: Readonly<{
    opts: readonly AthOpt[];
    opn: boolean;
}>): JSX.Element {
    const onCnt = opts.filter((opt) => opt.on).length;
    const allOn = opts.length > 0 && onCnt === opts.length;
    const act = allOn ? "clr" : "all";
    const txt = allOn ? "Clear all" : "Select all";
    const actionCnt = opts
        .filter((opt) => !allOn || opt.on)
        .reduce((total, opt) => total + opt.cnt, 0);

    return (
        <section
            className="rss-author-filter"
            aria-label="Author filters"
            data-rss-author-open={opn ? "1" : "0"}
        >
            <header
                className="rss-author-filter__hdr kc-click-header"
                data-rss-author-menu-hdr="1"
                role="button"
                tabIndex={0}
                aria-expanded={opn ? "true" : "false"}
                title={opn ? "Collapse author filters" : "Expand author filters"}
            >
                <div className="rss-author-filter__titleWrap">
                    <h3 className="rss-author-filter__ttl">Authors</h3>
                    <p className="rss-author-filter__txt">
                        Showing {onCnt} of {opts.length}
                    </p>
                </div>

                <div className="rss-author-filter__actions kc-click-header__actions">
                    <AuthorAllBtn
                        act={act}
                        txt={txt}
                        cnt={actionCnt}
                        disabled={opts.length === 0}
                    />

                    <AthTglBtn opn={opn} />
                </div>
            </header>

            <div
                id="kc-blog-author-filter-body"
                className="rss-filters__body rss-author-filter__body"
                aria-hidden={opn ? "false" : "true"}
            >
                <div className="rss-filters__body-inner rss-author-filter__body-inner">
                    <div className="rss-author-filter__list">
                        {opts.map((opt) => (
                            <button
                                key={opt.ath}
                                type="button"
                                className="rss-author-filter__btn"
                                data-rss-author={opt.ath}
                                data-on={opt.on ? "1" : "0"}
                                aria-pressed={opt.on ? "true" : "false"}
                                title={opt.on ? `Hide ${opt.ath}` : `Show ${opt.ath}`}
                            >
                                <span className="rss-author-filter__name">{opt.ath}</span>
                                <span className="rss-author-filter__dot" aria-hidden="true">
                                    •
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

