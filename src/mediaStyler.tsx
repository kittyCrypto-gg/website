import { smsEnterBounce } from "./physics.ts";
import { replaceTooltips } from "./mediaStyler/tooltips.tsx";
import {
    replaceImageTags,
    replaceSVGs
} from "./mediaStyler/assets.tsx";
import { serialiseMixedContent } from "./mediaStyler/common.ts";
import {
    bindEmailActions,
    replaceEmails
} from "./mediaStyler/email.tsx";
import { replaceSmsMessages } from "./mediaStyler/sms.tsx";

export { serialiseMixedContent };

type ReplSms = (htmlContent: string, cssHref?: string) => string;
type ReplEmails = (htmlContent: string, cssHref?: string) => Promise<string>;
type ReplSvgs = (root?: Document | Element | string) => Promise<void>;
type ReplTips = (htmlContent: string) => Promise<string>;
type BindMailActs = () => void;

type Impls = Readonly<{
    replaceSmsMessages: ReplSms;
    replaceEmails: ReplEmails;
    replaceSVGs: ReplSvgs;
    replaceImageTags: (htmlContent: string) => Promise<string>;
    replaceTooltips: ReplTips;
    bindEmailActions: BindMailActs;
}>;

type ImplOverrides = Partial<{
    replaceSmsMessages: ReplSms;
    replaceEmails: ReplEmails;
    replaceSVGs: ReplSvgs;
    replaceImageTags: (htmlContent: string) => Promise<string>;
    replaceTooltips: ReplTips;
    bindEmailActions: BindMailActs;
}>;

class MediaStyler {
    private readonly impls: Impls;

    /**
     * Lets you swap internal implementations for tests or odd cases.
     * normal usage probably leaves this alone.
     * @param {ImplOverrides} implOverrides
     * @returns {MediaStyler}
     */
    constructor(implOverrides: ImplOverrides = {}) {
        this.impls = {
            replaceSmsMessages: implOverrides.replaceSmsMessages ?? replaceSmsMessages,
            replaceEmails: implOverrides.replaceEmails ?? replaceEmails,
            replaceSVGs: implOverrides.replaceSVGs ?? replaceSVGs,
            replaceImageTags: implOverrides.replaceImageTags ?? replaceImageTags,
            replaceTooltips: implOverrides.replaceTooltips ?? replaceTooltips,
            bindEmailActions: implOverrides.bindEmailActions ?? bindEmailActions
        };
    }

    /**
     * Replaces sms message tags with styled html.
     * physics decorator still does its little bounce thing.
     * @param {string} htmlContent
     * @param {string} cssHref
     * @returns {string}
     */
    @smsEnterBounce({
        durationMs: 520,
        strength: 1,
        viscosity: 0.7,
        cssHref: "../styles/modules/physics.css",
    })
    replaceSmsMessages(htmlContent: string, cssHref: string = "../styles/modules/sms.css"): string {
        return this.impls.replaceSmsMessages(htmlContent, cssHref);
    }

    /**
     * Replaces email tags with styled email cards.
     * @param {string} htmlContent
     * @param {string} cssHref
     * @returns {Promise<string>}
     */
    replaceEmails(htmlContent: string, cssHref: string = "../styles/modules/email.css"): Promise<string> {
        return this.impls.replaceEmails(htmlContent, cssHref);
    }

    /**
     * Inlines svg images under the given root.
     * @param {Document | Element | string} root
     * @returns {Promise<void>}
     */
    replaceSVGs(root: Document | Element | string = document): Promise<void> {
        return this.impls.replaceSVGs(root);
    }

    /**
     * Replaces <chapter-image> tags with proper image markup.
     * @param {string} htmlContent
     * @returns {Promise<string>}
     */
    replaceImageTags(htmlContent: string): Promise<string> {
        return this.impls.replaceImageTags(htmlContent);
    }

    /**
     * Replaces tooltip tags with the styled tooltip markup.
     * @param {string} htmlContent
     * @returns {Promise<string>}
     */
    replaceTooltips(htmlContent: string): Promise<string> {
        return this.impls.replaceTooltips(htmlContent);
    }

    /**
     * Hooks the email action click handling.
     * @returns {void}
     */
    bindEmailActions(): void {
        this.impls.bindEmailActions();
    }
}

export default MediaStyler;