import * as icons from "../icons.tsx";
import type { ReaderButtons } from "./types.ts";

/** Same defaults used by static rendering and browser-side reader controls. */
export function createReaderButtons(): ReaderButtons {
    return {
        toggleParagraphNumbers: { icon: icons.MakeToggleParagraphNumbersIcon(), action: "Toggle paragraph numbers" },
        clearBookmark: { icon: icons.MakeClearBookmarkIcon(), action: "Clear bookmark for this chapter" },
        prevChapter: { icon: icons.MakePrevChapterIcon(), action: "Previous chapter" },
        jumpToChapter: { icon: icons.MakeJumpToChapterIcon(), action: "Jump to chapter" },
        nextChapter: { icon: icons.MakePrevChapterIcon(180), action: "Next chapter" },
        scrollDown: { icon: icons.MakePrevChapterIcon(270), action: "Scroll down" },
        showInfo: { icon: icons.MakeShowInfoIcon(), action: "Show navigation info" },
        decreaseFont: { icon: icons.MakeDecreaseFontIcon(), action: "Decrease font size" },
        resetFont: { icon: icons.MakeResetFontIcon(), action: "Reset font size" },
        increaseFont: { icon: icons.MakeIncreaseFontIcon(), action: "Increase font size" },
        scrollUp: { icon: icons.MakePrevChapterIcon(90), action: "Scroll up" }
    };
}
