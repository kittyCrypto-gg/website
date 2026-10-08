import { render2Frag } from "../reactHelpers.tsx";
import { ImgNav } from "./views.tsx";

function enableImageSwipe(
    image: HTMLImageElement,
    getX: () => number,
    getY: () => number,
    setPos: (x: number, y: number) => void
): void {
    let lastX = 0;
    let lastY = 0;
    let isSwiping = false;

    image.addEventListener(
        "touchstart",
        (event: TouchEvent) => {
            if (!image.classList.contains("active")) return;
            if (event.touches.length !== 1) return;

            isSwiping = true;
            lastX = event.touches[0].clientX;
            lastY = event.touches[0].clientY;
        },
        { passive: true }
    );

    image.addEventListener(
        "touchmove",
        (event: TouchEvent) => {
            if (!isSwiping || event.touches.length !== 1) return;

            const currentX = event.touches[0].clientX;
            const currentY = event.touches[0].clientY;
            const deltaX = currentX - lastX;
            const deltaY = currentY - lastY;

            lastX = currentX;
            lastY = currentY;

            const pxToPercent = 300;
            const nextX = Math.min(
                100,
                Math.max(0, getX() - (deltaX / pxToPercent) * 100)
            );
            const nextY = Math.min(
                100,
                Math.max(0, getY() - (deltaY / pxToPercent) * 100)
            );

            setPos(nextX, nextY);
        },
        { passive: true }
    );

    const stopSwipe = (): void => {
        isSwiping = false;
    };

    image.addEventListener("touchend", stopSwipe);
    image.addEventListener("touchcancel", stopSwipe);
}

function attachHold(
    root: Document,
    button: HTMLButtonElement,
    eventName: "mousedown" | "touchstart",
    onHold: () => void
): void {
    button.addEventListener(eventName, () => {
        const interval = window.setInterval(onHold, 100);

        const stopHold = (): void => {
            clearInterval(interval);
            root.removeEventListener("mouseup", stopHold);
            root.removeEventListener("touchend", stopHold);
            root.removeEventListener("mouseleave", stopHold);
            root.removeEventListener("touchcancel", stopHold);
        };

        root.addEventListener("mouseup", stopHold);
        root.addEventListener("touchend", stopHold);
        root.addEventListener("mouseleave", stopHold);
        root.addEventListener("touchcancel", stopHold);
        onHold();
    });
}

export function activateImageNavigation(root: Document = document): void {
    root.querySelectorAll(".image-nav").forEach((nav) => nav.remove());

    root.querySelectorAll(".chapter-image-container").forEach((containerEl) => {
        const container = containerEl as HTMLElement;
        const image = container.querySelector(".chapter-image");
        if (!(image instanceof HTMLImageElement)) return;

        const navOverlay = document.createElement("div");
        navOverlay.classList.add("image-nav");
        navOverlay.appendChild(render2Frag(<ImgNav />));
        container.appendChild(navOverlay);

        let posX = 50;
        let posY = 50;
        const step = 5;

        const updatePos = (): void => {
            image.style.transformOrigin = `${posX}% ${posY}%`;
        };

        const syncNavOverlay = (): void => {
            navOverlay.classList.toggle(
                "active",
                image.classList.contains("active")
            );
        };

        const bindDirection = (
            selector: string,
            move: () => void
        ): void => {
            const button = navOverlay.querySelector(selector);
            if (!(button instanceof HTMLButtonElement)) return;

            attachHold(root, button, "mousedown", move);
            attachHold(root, button, "touchstart", move);
        };

        bindDirection(".btn-up", () => {
            posY = Math.max(0, posY - step);
            updatePos();
        });
        bindDirection(".btn-down", () => {
            posY = Math.min(100, posY + step);
            updatePos();
        });
        bindDirection(".btn-left", () => {
            posX = Math.max(0, posX - step);
            updatePos();
        });
        bindDirection(".btn-right", () => {
            posX = Math.min(100, posX + step);
            updatePos();
        });

        const centre = navOverlay.querySelector(".btn-center");
        if (centre instanceof HTMLButtonElement) {
            centre.addEventListener("click", () => {
                posX = 50;
                posY = 50;
                updatePos();
            });
        }

        image.addEventListener("click", () => {
            image.classList.toggle("active");
            syncNavOverlay();
        });

        container.addEventListener("mouseenter", () => {
            if (!image.classList.contains("active")) return;
            navOverlay.classList.add("active");
        });

        container.addEventListener("mouseleave", () => {
            navOverlay.classList.remove("active");
        });

        enableImageSwipe(
            image,
            () => posX,
            () => posY,
            (x, y) => {
                posX = x;
                posY = y;
                updatePos();
            }
        );
    });
}
