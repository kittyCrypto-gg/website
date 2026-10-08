import type {
    ContentLayout,
    FramePadding,
    FrameStyle
} from "./types.ts";

export function captureFrameStyle(
    element: HTMLElement
): FrameStyle {
    return {
        display: element.style.display,
        position: element.style.position,
        left: element.style.left,
        top: element.style.top,
        width: element.style.width,
        height: element.style.height,
        maxWidth: element.style.maxWidth,
        maxHeight: element.style.maxHeight,
        resize: (
            element.style as CSSStyleDeclaration & {
                resize?: string;
            }
        ).resize ?? "",
        zIndex: element.style.zIndex,
        paddingTop: element.style.paddingTop,
        paddingRight: element.style.paddingRight,
        paddingBottom: element.style.paddingBottom,
        paddingLeft: element.style.paddingLeft
    };
}

export function captureFramePadding(
    element: HTMLElement
): FramePadding {
    const computed = window.getComputedStyle(element);

    return {
        top: computed.paddingTop,
        right: computed.paddingRight,
        bottom: computed.paddingBottom,
        left: computed.paddingLeft
    };
}

export function captureContentLayout(
    element: HTMLElement
): ContentLayout {
    const computed = window.getComputedStyle(element);

    return {
        display: computed.display,
        flexDirection: computed.flexDirection,
        flexWrap: computed.flexWrap,
        justifyContent: computed.justifyContent,
        alignItems: computed.alignItems,
        alignContent: computed.alignContent,
        justifyItems: computed.justifyItems,
        justifySelf: computed.justifySelf,
        placeItems: computed.placeItems,
        placeContent: computed.placeContent,
        placeSelf: computed.placeSelf,
        gap: computed.gap,
        rowGap: computed.rowGap,
        columnGap: computed.columnGap,
        gridTemplateColumns: computed.gridTemplateColumns,
        gridTemplateRows: computed.gridTemplateRows,
        gridAutoFlow: computed.gridAutoFlow,
        gridAutoColumns: computed.gridAutoColumns,
        gridAutoRows: computed.gridAutoRows,
        overflow: computed.overflow,
        overflowX: computed.overflowX,
        overflowY: computed.overflowY
    };
}

export function restoreFrameStyle(
    element: HTMLElement,
    style: FrameStyle
): void {
    element.style.display = style.display;
    element.style.position = style.position;
    element.style.left = style.left;
    element.style.top = style.top;
    element.style.width = style.width;
    element.style.height = style.height;
    element.style.maxWidth = style.maxWidth;
    element.style.maxHeight = style.maxHeight;
    (
        element.style as CSSStyleDeclaration & {
            resize?: string;
        }
    ).resize = style.resize;
    element.style.zIndex = style.zIndex;
    element.style.paddingTop = style.paddingTop;
    element.style.paddingRight = style.paddingRight;
    element.style.paddingBottom = style.paddingBottom;
    element.style.paddingLeft = style.paddingLeft;

    for (const property of [
        "--window-left",
        "--window-top",
        "--window-width",
        "--window-height",
        "--window-z-index"
    ]) {
        element.style.removeProperty(property);
    }
}
