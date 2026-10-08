import { render2Mkup } from "../reactHelpers.tsx";
import { ReaderCtrls } from "./views.tsx";
import { RaMenu } from "../readAloud/views.tsx";
import { READ_ALOUD_BUTTONS, READ_ALOUD_VOICES, READ_ALOUD_REGIONS } from "../readAloud/config.ts";

/** Permanent reader navigation markup; chapter values and actions hydrate later. */
export function renderReaderNavigation(): Readonly<{ top: string; bottom: string }> {
    return {
        top: '<div id="kc-reader-controls-top" class="reader-controls-top" hidden data-kc-reader-static="1">' +
            render2Mkup(<ReaderCtrls />) + '</div>',
        bottom: '<div id="kc-reader-controls-bottom" class="reader-controls-bottom" hidden data-kc-reader-static="1">' +
            render2Mkup(<ReaderCtrls bottom />) + '</div>'
    };
}

/** Prebuilt read-aloud menu starts hidden, as in the original template. */
export function renderReadAloudMenu(): string {
    return render2Mkup(
        <RaMenu buttons={READ_ALOUD_BUTTONS} voices={READ_ALOUD_VOICES} regions={READ_ALOUD_REGIONS} />
    );
}

/** Story inventory is fetched dynamically; only its fixed layout ships in HTML. */
export function renderStoryPicker(): string {
    return '<div class="story-dropdown" data-kc-story-static="1">' +
        '<button id="reader-story-selector" type="button" class="story-dropdown__button" aria-haspopup="true">Pick a story...</button>' +
        '<div class="story-dropdown__sizer" aria-hidden="true">' +
        '<div class="story-dropdown__sizer-item story-dropdown__sizer-item--hint">Pick a story...</div></div>' +
        '<div class="story-dropdown__content"><div class="story-dropdown__hint" aria-hidden="true">Pick a story...</div></div>' +
        '</div>';
}
