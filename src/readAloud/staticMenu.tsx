import { render2Mkup } from "../reactHelpers.tsx";
import { RaMenu } from "./views.tsx";
import { READ_ALOUD_BUTTONS, READ_ALOUD_VOICES, READ_ALOUD_REGIONS } from "./config.ts";

/** Build-time speech UI; the controller only adds browser interactions. */
export function renderReadAloudMenu(): string {
    return render2Mkup(
        <RaMenu buttons={READ_ALOUD_BUTTONS} voices={READ_ALOUD_VOICES} regions={READ_ALOUD_REGIONS} />
    );
}
