import type { ReactElement } from "react";
import { render2Mkup } from "../reactHelpers.tsx";
import {
    directChildByTag,
    elementText,
    ensureStylesheet,
    serialiseMixedContent
} from "./common.ts";

type HtmlBits = Readonly<{ __html: string }>;

function html(raw: string): HtmlBits {
    return { __html: raw };
}

function Sms(props: {
    type: "in" | "out";
    nickname: string;
    contentHtml: string;
    timestamp: string;
}): ReactElement {
    return (
        <div className={`message-wrapper ${props.type} show`}>
            <div className={`message ${props.type}`}>
                <div className="nickname-strip">{props.nickname}</div>
                <div
                    className="message-text"
                    dangerouslySetInnerHTML={html(props.contentHtml)}
                />
                <div className={`timestamp ${props.type}`}>
                    {props.timestamp}
                </div>
            </div>
        </div>
    );
}

export function replaceSmsMessages(
    htmlContent: string,
    cssHref: string = "../styles/modules/sms.css"
): string {
    ensureStylesheet(cssHref);

    const pattern =
        /<message\b[^>]*\btype=["'](in|out)["'][^>]*>[\s\S]*?<\/message>/gi;

    return htmlContent.replace(
        pattern,
        (block: string, typeRaw: string) => {
            const type = typeRaw.trim().toLowerCase();
            if (type !== "in" && type !== "out") return block;

            const doc = new DOMParser().parseFromString(
                `<root>${block}</root>`,
                "application/xml"
            );
            const message = doc.querySelector("message");
            if (!message) return block;

            const contentNode = directChildByTag(message, ["content"]);

            return render2Mkup(
                <Sms
                    type={type}
                    nickname={elementText(message, "nickname")}
                    contentHtml={
                        contentNode
                            ? serialiseMixedContent(contentNode)
                            : ""
                    }
                    timestamp={elementText(message, "timestamp")}
                />
            );
        }
    );
}
