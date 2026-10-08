import type {
    ContentLayout,
    FramePadding
} from "./types.ts";

export function applyContentRootLayout(
    root: HTMLDivElement,
    layout: ContentLayout
): void {
    root.style.display = layout.display;
    root.style.flexDirection = layout.flexDirection;
    root.style.flexWrap = layout.flexWrap;
    root.style.justifyContent = layout.justifyContent;
    root.style.alignItems = layout.alignItems;
    root.style.alignContent = layout.alignContent;
    root.style.justifyItems = layout.justifyItems;
    root.style.justifySelf = layout.justifySelf;
    root.style.placeItems = layout.placeItems;
    root.style.placeContent = layout.placeContent;
    root.style.placeSelf = layout.placeSelf;
    root.style.gap = layout.gap;
    root.style.rowGap = layout.rowGap;
    root.style.columnGap = layout.columnGap;
    root.style.gridTemplateColumns = layout.gridTemplateColumns;
    root.style.gridTemplateRows = layout.gridTemplateRows;
    root.style.gridAutoFlow = layout.gridAutoFlow;
    root.style.gridAutoColumns = layout.gridAutoColumns;
    root.style.gridAutoRows = layout.gridAutoRows;
    root.style.overflow = layout.overflow;
    root.style.overflowX = layout.overflowX;
    root.style.overflowY = layout.overflowY;
}

export function applyMountedFrameLayout(frame: HTMLElement): void {
    frame.style.setProperty("display", "flex", "important");
    frame.style.setProperty("flex-direction", "column", "important");
    frame.style.setProperty("align-items", "stretch", "important");
    frame.style.setProperty("justify-content", "flex-start", "important");
    frame.style.setProperty("gap", "0px", "important");
}

export function clearMountedFrameLayout(frame: HTMLElement): void {
    frame.style.removeProperty("display");
    frame.style.removeProperty("flex-direction");
    frame.style.removeProperty("align-items");
    frame.style.removeProperty("justify-content");
    frame.style.removeProperty("gap");
}

export function applyMountedContentLayout(
    frame: HTMLElement,
    body: HTMLDivElement,
    root: HTMLDivElement,
    padding: FramePadding
): void {
    frame.style.setProperty("padding-top", "0px", "important");
    frame.style.setProperty("padding-right", "0px", "important");
    frame.style.setProperty("padding-bottom", "0px", "important");
    frame.style.setProperty("padding-left", "0px", "important");

    body.style.paddingTop = "0px";
    body.style.paddingRight = "0px";
    body.style.paddingBottom = "0px";
    body.style.paddingLeft = "0px";

    root.style.paddingTop = padding.top;
    root.style.paddingRight = padding.right;
    root.style.paddingBottom = padding.bottom;
    root.style.paddingLeft = padding.left;
}

export function clearMountedContentLayout(
    frame: HTMLElement,
    body: HTMLDivElement,
    root: HTMLDivElement
): void {
    frame.style.removeProperty("padding-top");
    frame.style.removeProperty("padding-right");
    frame.style.removeProperty("padding-bottom");
    frame.style.removeProperty("padding-left");

    body.style.paddingTop = "";
    body.style.paddingRight = "";
    body.style.paddingBottom = "";
    body.style.paddingLeft = "";

    root.style.paddingTop = "";
    root.style.paddingRight = "";
    root.style.paddingBottom = "";
    root.style.paddingLeft = "";
}

export function measureHeaderHeight(header: HTMLDivElement): number {
    return Math.max(
        0,
        Math.ceil(header.getBoundingClientRect().height)
    );
}

export function applyMinimisedFrameLayout(
    frame: HTMLElement,
    header: HTMLDivElement
): void {
    const minimisedHeight = `${measureHeaderHeight(header)}px`;

    frame.style.setProperty("height", minimisedHeight, "important");
    frame.style.setProperty("min-height", minimisedHeight, "important");
    frame.style.setProperty("max-height", minimisedHeight, "important");
    frame.style.setProperty("block-size", minimisedHeight, "important");
    frame.style.setProperty("min-block-size", minimisedHeight, "important");
    frame.style.setProperty("max-block-size", minimisedHeight, "important");
    frame.style.setProperty("overflow", "hidden", "important");
}

export function clearMinimisedFrameLayout(frame: HTMLElement): void {
    frame.style.removeProperty("height");
    frame.style.removeProperty("min-height");
    frame.style.removeProperty("max-height");
    frame.style.removeProperty("block-size");
    frame.style.removeProperty("min-block-size");
    frame.style.removeProperty("max-block-size");
    frame.style.removeProperty("overflow");
}

export function applyMinimisedBodyLayout(body: HTMLDivElement): void {
    body.style.setProperty("display", "block", "important");
    body.style.setProperty("height", "0px", "important");
    body.style.setProperty("min-height", "0px", "important");
    body.style.setProperty("max-height", "0px", "important");
    body.style.setProperty("block-size", "0px", "important");
    body.style.setProperty("min-block-size", "0px", "important");
    body.style.setProperty("max-block-size", "0px", "important");
    body.style.setProperty("flex", "0 0 0px", "important");
    body.style.setProperty("overflow", "hidden", "important");
    body.style.setProperty("padding-top", "0px", "important");
    body.style.setProperty("padding-bottom", "0px", "important");
}

export function clearMinimisedBodyLayout(body: HTMLDivElement): void {
    body.style.removeProperty("display");
    body.style.removeProperty("height");
    body.style.removeProperty("min-height");
    body.style.removeProperty("max-height");
    body.style.removeProperty("block-size");
    body.style.removeProperty("min-block-size");
    body.style.removeProperty("max-block-size");
    body.style.removeProperty("flex");
    body.style.removeProperty("overflow");
    body.style.removeProperty("padding-top");
    body.style.removeProperty("padding-bottom");
}
