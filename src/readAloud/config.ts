import type {
    ReadAloudButtons,
    VoiceOption
} from "./types.ts";

export const SPEECH_SDK_CDN =
    "https://kittycrow.dev/external?src=https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.44.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle.js";

export const READ_ALOUD_BUTTONS: ReadAloudButtons = {
    play: { icon: "▶️", action: "Start Read Aloud" },
    pause: { icon: "⏸️", action: "Pause Read Aloud" },
    stop: { icon: "⏹️", action: "Stop Read Aloud" },
    next: { icon: "⏩", action: "Next Paragraph" },
    prev: { icon: "⏪", action: "Previous Paragraph" },
    restart: { icon: "⏮️", action: "Restart" },
    config: { icon: "⚙️", action: "Configure Read Aloud" },
    hide: { icon: "👁️", action: "Hides Read Aloud menu" },
    info: { icon: "ℹ️", action: "Show Info" },
    jump: { icon: "🧭", action: "Show or hide jump to paragraph" },
    help: { icon: "❓", action: "Help" }
};

export const EYE_OPEN_SVG = "../images/eyeopen.svg";
export const EYE_CLOSED_SVG = "../images/eyeclosed.svg";

export const READ_ALOUD_VOICES: readonly VoiceOption[] = [
    { name: "en-US-JennyNeural", locale: "en-US", description: "American English (US), Female, Jenny (default)" },
    { name: "en-US-AriaNeural", locale: "en-US", description: "American English (US), Female, Aria" },
    { name: "en-GB-SoniaNeural", locale: "en-GB", description: "British English (UK), Female, Sonia" },
    { name: "en-GB-LibbyNeural", locale: "en-GB", description: "British English (UK), Female, Libby" },
    { name: "en-AU-NatashaNeural", locale: "en-AU", description: "Australian English (AU), Female, Natasha" },
    { name: "en-CA-ClaraNeural", locale: "en-CA", description: "Canadian English (CA), Female, Clara" },
    { name: "en-IN-NeerjaNeural", locale: "en-IN", description: "Indian English (IN), Female, Neerja" },
    { name: "en-NZ-MollyNeural", locale: "en-NZ", description: "New Zealand English (NZ), Female, Molly" },
    { name: "en-IE-EmilyNeural", locale: "en-IE", description: "Irish English (IE), Female, Emily" },
    { name: "en-ZA-LeahNeural", locale: "en-ZA", description: "South African English (ZA), Female, Leah" }
] as const;

export const READ_ALOUD_REGIONS = [
    "eastus", "eastus2", "southcentralus", "westus2", "westus3",
    "australiaeast", "southeastasia", "northeurope", "swedencentral",
    "uksouth", "westeurope", "centralus", "northcentralus",
    "westus", "southafricanorth", "centralindia", "eastasia",
    "japaneast", "japanwest", "koreacentral", "canadacentral",
    "francecentral", "germanywestcentral", "norwayeast", "switzerlandnorth",
    "uaenorth", "brazilsouth"
] as const;

export const JUMP_VIS_KEY = "readAloudJumpVisible";
export const SPEECH_RESOURCE_KEY = "readAloudSpeechResource";
export const READ_ALOUD_META_ATTR = "data-readaloud";

export const READ_ALOUD_IGNORE_SELECTORS = [
    ".reader-paragraph-num",
    ".bookmark-emoji",
    ".tooltip-content",
    "tooltip > content"
] as const;
