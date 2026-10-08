import { render2Mkup } from "../reactHelpers.tsx";
import {
    getReaderNds,
    serialisNde
} from "../tategaki.tsx";

function renderBlock(
    tag: "p" | "h1" | "h2" | "blockquote",
    className: string,
    innerHtml: string
): string {
    const markup = { __html: innerHtml };

    switch (tag) {
        case "h1":
            return render2Mkup(
                <h1 className={className} dangerouslySetInnerHTML={markup} />
            );
        case "h2":
            return render2Mkup(
                <h2 className={className} dangerouslySetInnerHTML={markup} />
            );
        case "blockquote":
            return render2Mkup(
                <blockquote className={className} dangerouslySetInnerHTML={markup} />
            );
        default:
            return render2Mkup(
                <p className={className} dangerouslySetInnerHTML={markup} />
            );
    }
}

export function wrapBookmark(
    id: string,
    blockHtml: string
): string {
    return render2Mkup(
        <div
            className="reader-bookmark"
            id={id}
            dangerouslySetInnerHTML={{ __html: blockHtml }}
        />
    );
}

export function buildReaderHtml(
    readerNodes: ReturnType<typeof getReaderNds>
): string {
    return readerNodes
        .map((node) => {
            const tategakiMarkup = serialisNde(node);
            if (tategakiMarkup) return tategakiMarkup;

            const paragraph = node;
            const cleaned = paragraph.tagName === "paragraph";
            const paragraphProperties = cleaned
                ? null
                : paragraph.getElementsByTagName("w:pPr")[0];

            const styleElement =
                !cleaned && paragraphProperties
                    ? paragraphProperties.getElementsByTagName("w:pStyle")[0]
                    : null;

            const style = styleElement?.getAttribute("w:val") ?? "";
            const title = style === "Title";
            const heading = style === "Heading1" || style === "Heading2";
            const quote = style === "Quote";
            const intenseQuote = style === "IntenseQuote";

            const tag: "p" | "h1" | "h2" | "blockquote" =
                title
                    ? "h1"
                    : heading
                        ? "h2"
                        : quote || intenseQuote
                            ? "blockquote"
                            : "p";

            const className =
                title
                    ? "reader-title"
                    : heading
                        ? "reader-subtitle"
                        : intenseQuote
                            ? "reader-quote reader-intense"
                            : quote
                                ? "reader-quote"
                                : "reader-paragraph";

            const runs = cleaned
                ? Array.from(paragraph.childNodes)
                    .map((childNode) =>
                        childNode.nodeType === 1
                            ? new XMLSerializer().serializeToString(childNode)
                            : (childNode.textContent || "")
                    )
                    .join("")
                : Array.from(paragraph.getElementsByTagName("w:r"))
                    .map((run) => {
                        const text = Array.from(
                            run.getElementsByTagName("w:t")
                        )
                            .map((textNode) => textNode.textContent || "")
                            .join("");

                        const runProperties = run.getElementsByTagName("w:rPr")[0];
                        const classes: string[] = [];

                        if (runProperties?.getElementsByTagName("w:b").length) {
                            classes.push("reader-bold");
                        }
                        if (runProperties?.getElementsByTagName("w:i").length) {
                            classes.push("reader-italic");
                        }
                        if (runProperties?.getElementsByTagName("w:u").length) {
                            classes.push("reader-underline");
                        }
                        if (runProperties?.getElementsByTagName("w:strike").length) {
                            classes.push("reader-strike");
                        }
                        if (runProperties?.getElementsByTagName("w:smallCaps").length) {
                            classes.push("reader-smallcaps");
                        }

                        return render2Mkup(
                            <span className={classes.join(" ")}>{text}</span>
                        );
                    })
                    .join("");

            return renderBlock(tag, className, runs);
        })
        .join("\n");
}
