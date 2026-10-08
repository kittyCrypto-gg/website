import type { ReactElement } from "react";
import * as helpers from "../helpers.ts";
import { render2Mkup } from "../reactHelpers.tsx";
import {
    directChildByTag,
    elementText,
    ensureStylesheet,
    serialiseMixedContent
} from "./common.ts";

const themes: Record<string, unknown> = {};

type HtmlBits = Readonly<{ __html: string }>;

function html(raw: string): HtmlBits {
    return { __html: raw };
}

async function loadThemes(
    url: string = "../data/themes.json"
): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load themes from ${url}`);
    }

    const data: unknown = await response.json();

    for (const key of Object.keys(themes)) delete themes[key];
    for (const [key, value] of Object.entries(
        data as Record<string, unknown>
    )) {
        themes[key] = value;
    }
}

function getTheme(address: string): string {
    const normalised = address.toLowerCase();

    for (const [theme, addressesRaw] of Object.entries(themes)) {
        const addresses = addressesRaw as readonly string[];
        if (!addresses.some(
            (candidate) => candidate.toLowerCase() === normalised
        )) continue;
        return theme;
    }

    return "";
}

function mapRich(
    root: ParentNode,
    selector: string
): string[] {
    return Array.from(root.querySelectorAll(selector))
        .map((node) => serialiseMixedContent(node))
        .filter(Boolean);
}

function Signature(props: {
    logo: string;
    company: string;
    lines: string[];
    disclaimers: string[];
}): ReactElement {
    return (
        <>
            <hr className="email-signature-sep" />
            <div className="email-signature">
                {props.logo && (
                    <div className="email-signature-logo">
                        <img
                            src={props.logo}
                            alt={props.company || "Company logo"}
                            className="email-signature-logo-img"
                        />
                    </div>
                )}
                <div className="email-signature-text">
                    <div
                        dangerouslySetInnerHTML={
                            html(props.lines.join("<br/>"))
                        }
                    />
                    {props.disclaimers.length > 0 && (
                        <div className="email-signature-disclaimer">
                            {props.disclaimers.map((line, index) => (
                                <div
                                    key={`disc-${index}`}
                                    className="email-signature-disclaimer-line"
                                    dangerouslySetInnerHTML={html(line)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

function parseSignature(signature: Element): string {
    const text = (selector: string): string =>
        (signature.querySelector(selector)?.textContent || "").trim();

    const name = text("name");
    const company = text("company");
    const address = text("address");
    const telephone = text("telephone");
    const emailAddress = text("emailAddress");
    const logo = text("logo").trim();
    const positions = mapRich(signature, "position");
    const disclaimers = mapRich(signature, "disclaimer");

    const hasAny =
        name ||
        positions.length ||
        company ||
        address ||
        telephone ||
        emailAddress ||
        logo ||
        disclaimers.length;

    if (!hasAny) return "";

    const lines = [
        name &&
            `<strong class="email-signature-name">${helpers.escapeHtml(name)}</strong>`,
        ...positions.map(
            (position) =>
                `<span class="email-signature-position">${position}</span>`
        ),
        company &&
            `<span class="email-signature-company">${helpers.escapeHtml(company)}</span>`,
        address &&
            `<span class="email-signature-address">${helpers.escapeHtml(address)}</span>`,
        telephone &&
            `<span class="email-signature-telephone">Tel: ${helpers.escapeHtml(telephone)}</span>`,
        emailAddress &&
            `<span class="email-signature-email">Email: ${helpers.escapeHtml(emailAddress)}</span>`
    ].filter(Boolean) as string[];

    return render2Mkup(
        <Signature
            logo={logo}
            company={company}
            lines={lines}
            disclaimers={disclaimers}
        />
    );
}

function Mail(props: {
    themeClass: string;
    recipientIp: string;
    fromNameHtml: string;
    fromAddr: string;
    toNameHtml: string;
    toAddr: string;
    subject: string;
    timestamp: string;
    contentHtml: string;
}): ReactElement {
    const className = props.themeClass
        ? `email-card ${props.themeClass}`
        : "email-card";

    return (
        <div className="email-wrapper show">
            <div className={className} data-recipient-ip={props.recipientIp}>
                <div className="email-header">
                    <div className="email-meta">
                        <div className="email-row">
                            <span className="email-label">From</span>
                            <span className="email-value">
                                <span
                                    className="email-name"
                                    dangerouslySetInnerHTML={html(props.fromNameHtml)}
                                />
                                <span className="email-address">({props.fromAddr})</span>
                            </span>
                        </div>
                        <div className="email-row">
                            <span className="email-label">To</span>
                            <span className="email-value">
                                <span
                                    className="email-name"
                                    dangerouslySetInnerHTML={html(props.toNameHtml)}
                                />
                                <span className="email-address">({props.toAddr})</span>
                            </span>
                        </div>
                        <div className="email-row email-subject-row">
                            <span className="email-label">Subject</span>
                            <span className="email-subject-text">{props.subject}</span>
                            <span className="email-timestamp">{props.timestamp}</span>
                        </div>
                    </div>
                    <div className="email-actions-bar" role="toolbar">
                        <div className="email-actions">
                            <button className="email-action" data-email-action="reply">↩️</button>
                            <button className="email-action" data-email-action="forward">➡️</button>
                            <button className="email-action" data-email-action="flag">🚩</button>
                            <button className="email-action" data-email-action="archive">🗄️</button>
                            <button className="email-action" data-email-action="delete">🗑️</button>
                        </div>
                    </div>
                </div>
                <div
                    className="email-content"
                    dangerouslySetInnerHTML={html(props.contentHtml)}
                />
            </div>
        </div>
    );
}

function buildContentHtml(email: Element): string {
    const content = directChildByTag(email, ["content"]);
    if (!content) return "";

    return Array.from(content.childNodes)
        .map((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return helpers.escapeHtml(node.textContent || "");
            }

            if (!(node instanceof Element)) return "";
            return node.tagName.toLowerCase() === "signature"
                ? parseSignature(node)
                : node.outerHTML;
        })
        .join("");
}

export async function replaceEmails(
    htmlContent: string,
    cssHref: string = "../styles/modules/email.css"
): Promise<string> {
    ensureStylesheet(cssHref);

    if (Object.keys(themes).length === 0) {
        try {
            await loadThemes();
        } catch (error: unknown) {
            console.error("Failed to load themes:", error);
        }
    }

    return htmlContent.replace(
        /<email\b[^>]*>[\s\S]*?<\/email>/gi,
        (block: string) => {
            const doc = new DOMParser().parseFromString(
                `<root>${block}</root>`,
                "application/xml"
            );
            const email = doc.querySelector("email");
            if (!email) return block;

            const from = email.querySelector("from");
            const to = email.querySelector("to");
            const fromName = from?.querySelector("name");
            const toName = to?.querySelector("name");
            const fromAddress = from ? elementText(from, "addr") : "";
            const toAddress = to ? elementText(to, "addr") : "";

            return render2Mkup(
                <Mail
                    themeClass={getTheme(toAddress)}
                    recipientIp={elementText(email, "toIp") || ""}
                    fromNameHtml={
                        fromName
                            ? serialiseMixedContent(fromName)
                            : helpers.escapeHtml(
                                from ? elementText(from, "name") : ""
                            )
                    }
                    fromAddr={fromAddress}
                    toNameHtml={
                        toName
                            ? serialiseMixedContent(toName)
                            : helpers.escapeHtml(
                                to ? elementText(to, "name") : ""
                            )
                    }
                    toAddr={toAddress}
                    subject={elementText(email, "subject")}
                    timestamp={elementText(email, "timestamp")}
                    contentHtml={buildContentHtml(email)}
                />
            );
        }
    );
}

declare global {
    interface Window {
        ipAdress?: string;
    }
}

export function bindEmailActions(): void {
    document.addEventListener("click", (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const button = target.closest(".email-action");
        if (!button) return;

        const currentIp = window.ipAdress;
        const emailCard = button.closest(".email-card") as HTMLElement | null;
        const expectedIp = emailCard?.dataset.recipientIp || "";

        if (!currentIp || !expectedIp || currentIp !== expectedIp) {
            const toName =
                emailCard
                    ?.querySelector(".email-row:nth-child(2) .email-name")
                    ?.textContent?.trim() ||
                "Unknown";
            const toAddress =
                emailCard
                    ?.querySelector(".email-row:nth-child(2) .email-address")
                    ?.textContent
                    ?.replace(/[()]/g, "")
                    ?.trim() ||
                "unknown";

            alert(
                `Authentication error: Invalid credentials for ${toName} (${toAddress})`
            );
            return;
        }

        console.log(
            "WTH! Who are you?! You performed the email action: " +
            (button as HTMLElement).dataset.emailAction
        );
    });
}
