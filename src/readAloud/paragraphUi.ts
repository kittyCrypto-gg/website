export function highlightParagraph(
    paragraphs: readonly HTMLElement[],
    paragraph: HTMLElement | null
): void {
    paragraphs.forEach((item) => {
        item.classList.remove(
            "read-aloud-active",
            "read-aloud-fadeout"
        );
    });

    if (!paragraph) return;

    paragraph.classList.add("read-aloud-active");
    paragraph.classList.remove("read-aloud-fadeout");
}

export function fadeOutParagraph(
    paragraph: HTMLElement | null
): void {
    if (!paragraph) return;

    paragraph.classList.add("read-aloud-fadeout");

    window.setTimeout(() => {
        paragraph.classList.remove(
            "read-aloud-active",
            "read-aloud-fadeout"
        );
    }, 600);
}

export function scrollToParagraph(
    paragraph: HTMLElement | null
): void {
    if (!paragraph) return;

    paragraph.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}
