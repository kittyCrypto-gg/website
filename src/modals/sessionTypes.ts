import type { Dec, ModalFactorySessionHost, ModalMode, ModalPosition } from "./types.ts";

export type SessionSpec = Readonly<{
    factory: ModalFactorySessionHost;
    id: string;
    mode: ModalMode;

    readerModeCompatible: boolean;
    windowed: boolean;

    modalClassName: string;
    overlayClassName: string;

    closeOnEscape: boolean;
    closeOnOutsideClick: boolean;

    position: ModalPosition | null;
    asTextBubble: boolean;

    decorators: readonly Dec[];
    html: string;
}>;

