import type {
    BubbleGeometry,
    ModalPlacement,
    PositionCandidate
} from "./types.ts";

export type ViewportBounds = Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
}>;

export type AnchoredPosition = Readonly<{
    placement: ModalPlacement;
    left: number;
    top: number;
    pointerX: number;
    pointerY: number;
}>;

export function clampPosition(
    value: number,
    min: number,
    max: number
): number {
    return Math.max(min, Math.min(value, max));
}

export function getViewportBounds(): ViewportBounds {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;

    return {
        left,
        top,
        right: left + width,
        bottom: top + height
    };
}

export function choosePlacement(
    targetRect: DOMRect,
    modalRect: DOMRect,
    viewport: ViewportBounds,
    gap: number
): ModalPlacement {
    const candidates: PositionCandidate[] = [
        {
            placement: "left",
            space: targetRect.left - viewport.left,
            required: modalRect.width + gap
        },
        {
            placement: "right",
            space: viewport.right - targetRect.right,
            required: modalRect.width + gap
        },
        {
            placement: "top",
            space: targetRect.top - viewport.top,
            required: modalRect.height + gap
        },
        {
            placement: "bottom",
            space: viewport.bottom - targetRect.bottom,
            required: modalRect.height + gap
        }
    ];

    candidates.sort(
        (left, right) =>
            (right.space - right.required) -
            (left.space - left.required)
    );

    return candidates[0]?.placement ?? "bottom";
}

export function placementOrigin(
    placement: ModalPlacement,
    targetRect: DOMRect,
    modalRect: DOMRect,
    gap: number
): Readonly<{ left: number; top: number }> {
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;

    const origins: Record<ModalPlacement, {
        left: number;
        top: number;
    }> = {
        left: {
            left: targetRect.left - modalRect.width - gap,
            top: targetY - modalRect.height / 2
        },
        right: {
            left: targetRect.right + gap,
            top: targetY - modalRect.height / 2
        },
        top: {
            left: targetX - modalRect.width / 2,
            top: targetRect.top - modalRect.height - gap
        },
        bottom: {
            left: targetX - modalRect.width / 2,
            top: targetRect.bottom + gap
        }
    };

    return origins[placement];
}

export function calculateAnchoredPosition(
    targetRect: DOMRect,
    modalRect: DOMRect,
    gap: number,
    viewportPad: number = 12,
    pointerPad: number = 18
): AnchoredPosition {
    const viewport = getViewportBounds();
    const placement = choosePlacement(
        targetRect,
        modalRect,
        viewport,
        gap
    );
    const origin = placementOrigin(
        placement,
        targetRect,
        modalRect,
        gap
    );

    const minLeft = viewport.left + viewportPad;
    const maxLeft = Math.max(
        minLeft,
        viewport.right - modalRect.width - viewportPad
    );
    const minTop = viewport.top + viewportPad;
    const maxTop = Math.max(
        minTop,
        viewport.bottom - modalRect.height - viewportPad
    );

    const left = clampPosition(origin.left, minLeft, maxLeft);
    const top = clampPosition(origin.top, minTop, maxTop);
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;

    const pointerX = clampPosition(
        targetX - left,
        pointerPad,
        Math.max(pointerPad, modalRect.width - pointerPad)
    );
    const pointerY = clampPosition(
        targetY - top,
        pointerPad,
        Math.max(pointerPad, modalRect.height - pointerPad)
    );

    return {
        placement,
        left,
        top,
        pointerX,
        pointerY
    };
}

function cssNumber(
    element: HTMLElement,
    name: string,
    fallback: number
): number {
    const raw = getComputedStyle(element).getPropertyValue(name);
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function readBubbleGeometry(
    element: HTMLElement
): BubbleGeometry {
    const style = getComputedStyle(element);
    const radius = Number.parseFloat(style.borderTopLeftRadius);

    return {
        radius: Number.isFinite(radius) ? radius : 12,
        tailLength: cssNumber(
            element,
            "--modal-text-bubble-tail-length",
            13
        ),
        tailHalfWidth: cssNumber(
            element,
            "--modal-text-bubble-tail-half-width",
            12
        ),
        strokeWidth: cssNumber(
            element,
            "--modal-text-bubble-stroke-width",
            1
        ),
        tailANeck: clampPosition(
            cssNumber(
                element,
                "--modal-text-bubble-tail-a-neck",
                -0.42
            ),
            -1,
            1
        ),
        tailATip: clampPosition(
            cssNumber(
                element,
                "--modal-text-bubble-tail-a-tip",
                0.1
            ),
            -1,
            1
        ),
        tailBNeck: clampPosition(
            cssNumber(
                element,
                "--modal-text-bubble-tail-b-neck",
                0.1
            ),
            -1,
            1
        ),
        tailBTip: clampPosition(
            cssNumber(
                element,
                "--modal-text-bubble-tail-b-tip",
                0.42
            ),
            -1,
            1
        )
    };
}

export function bubbleGeometrySignature(
    geometry: BubbleGeometry
): string {
    return [
        geometry.radius,
        geometry.tailLength,
        geometry.tailHalfWidth,
        geometry.strokeWidth,
        geometry.tailANeck,
        geometry.tailATip,
        geometry.tailBNeck,
        geometry.tailBTip
    ].join("|");
}

export function buildBubblePath(
    width: number,
    height: number,
    placement: ModalPlacement,
    pointerX: number,
    pointerY: number,
    geometry: BubbleGeometry
): string {
    const inset = Math.max(0.5, geometry.strokeWidth / 2);
    const left = inset;
    const top = inset;
    const right = Math.max(left, width - inset);
    const bottom = Math.max(top, height - inset);

    const radius = Math.max(
        0,
        Math.min(
            geometry.radius,
            (right - left) / 2,
            (bottom - top) / 2
        )
    );

    const maxVerticalHalf = Math.max(
        4,
        (bottom - top - radius * 2 - 12) / 2
    );
    const maxHorizontalHalf = Math.max(
        4,
        (right - left - radius * 2 - 12) / 2
    );
    const verticalHalf = Math.min(
        geometry.tailHalfWidth,
        maxVerticalHalf
    );
    const horizontalHalf = Math.min(
        geometry.tailHalfWidth,
        maxHorizontalHalf
    );

    const minPointerX = left + radius + horizontalHalf + 6;
    const maxPointerX = Math.max(
        minPointerX,
        right - radius - horizontalHalf - 6
    );
    const minPointerY = top + radius + verticalHalf + 6;
    const maxPointerY = Math.max(
        minPointerY,
        bottom - radius - verticalHalf - 6
    );

    const px = clampPosition(
        pointerX,
        minPointerX,
        maxPointerX
    );
    const py = clampPosition(
        pointerY,
        minPointerY,
        maxPointerY
    );
    const tail = geometry.tailLength;
    const tailANeckReach =
        tail * ((geometry.tailANeck + 1) / 2);
    const tailBNeckReach =
        tail * ((geometry.tailBNeck + 1) / 2);
    const verticalTangent = Math.max(1, verticalHalf * 0.45);
    const horizontalTangent = Math.max(1, horizontalHalf * 0.45);

    const paths: Record<ModalPlacement, string> = {
        left: [
            `M ${left + radius} ${top}`,
            `H ${right - radius}`,
            `Q ${right} ${top} ${right} ${top + radius}`,
            `V ${py - verticalHalf}`,
            `C ${right} ${py - verticalHalf + verticalTangent}`,
            `${right + tailANeckReach} ${py - verticalHalf * geometry.tailATip}`,
            `${right + tail} ${py}`,
            `C ${right + tailBNeckReach} ${py + verticalHalf * geometry.tailBTip}`,
            `${right} ${py + verticalHalf - verticalTangent}`,
            `${right} ${py + verticalHalf}`,
            `V ${bottom - radius}`,
            `Q ${right} ${bottom} ${right - radius} ${bottom}`,
            `H ${left + radius}`,
            `Q ${left} ${bottom} ${left} ${bottom - radius}`,
            `V ${top + radius}`,
            `Q ${left} ${top} ${left + radius} ${top}`,
            "Z"
        ].join(" "),
        right: [
            `M ${left + radius} ${top}`,
            `H ${right - radius}`,
            `Q ${right} ${top} ${right} ${top + radius}`,
            `V ${bottom - radius}`,
            `Q ${right} ${bottom} ${right - radius} ${bottom}`,
            `H ${left + radius}`,
            `Q ${left} ${bottom} ${left} ${bottom - radius}`,
            `V ${py + verticalHalf}`,
            `C ${left} ${py + verticalHalf - verticalTangent}`,
            `${left - tailANeckReach} ${py + verticalHalf * geometry.tailATip}`,
            `${left - tail} ${py}`,
            `C ${left - tailBNeckReach} ${py - verticalHalf * geometry.tailBTip}`,
            `${left} ${py - verticalHalf + verticalTangent}`,
            `${left} ${py - verticalHalf}`,
            `V ${top + radius}`,
            `Q ${left} ${top} ${left + radius} ${top}`,
            "Z"
        ].join(" "),
        top: [
            `M ${left + radius} ${top}`,
            `H ${right - radius}`,
            `Q ${right} ${top} ${right} ${top + radius}`,
            `V ${bottom - radius}`,
            `Q ${right} ${bottom} ${right - radius} ${bottom}`,
            `H ${px + horizontalHalf}`,
            `C ${px + horizontalHalf - horizontalTangent} ${bottom}`,
            `${px + horizontalHalf * geometry.tailATip} ${bottom + tailANeckReach}`,
            `${px} ${bottom + tail}`,
            `C ${px - horizontalHalf * geometry.tailBTip} ${bottom + tailBNeckReach}`,
            `${px - horizontalHalf + horizontalTangent} ${bottom}`,
            `${px - horizontalHalf} ${bottom}`,
            `H ${left + radius}`,
            `Q ${left} ${bottom} ${left} ${bottom - radius}`,
            `V ${top + radius}`,
            `Q ${left} ${top} ${left + radius} ${top}`,
            "Z"
        ].join(" "),
        bottom: [
            `M ${left + radius} ${top}`,
            `H ${px - horizontalHalf}`,
            `C ${px - horizontalHalf + horizontalTangent} ${top}`,
            `${px - horizontalHalf * geometry.tailATip} ${top - tailANeckReach}`,
            `${px} ${top - tail}`,
            `C ${px + horizontalHalf * geometry.tailBTip} ${top - tailBNeckReach}`,
            `${px + horizontalHalf - horizontalTangent} ${top}`,
            `${px + horizontalHalf} ${top}`,
            `H ${right - radius}`,
            `Q ${right} ${top} ${right} ${top + radius}`,
            `V ${bottom - radius}`,
            `Q ${right} ${bottom} ${right - radius} ${bottom}`,
            `H ${left + radius}`,
            `Q ${left} ${bottom} ${left} ${bottom - radius}`,
            `V ${top + radius}`,
            `Q ${left} ${top} ${left + radius} ${top}`,
            "Z"
        ].join(" ")
    };

    return paths[placement];
}
