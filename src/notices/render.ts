import * as h from "../helpers.ts";
import type { Ntc } from "./types.ts";

function makeText(text: string): string {
    return text
        .split(/\n\s*\n/g)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => {
            return "<p>" +
                h.escapeHtml(part).replace(/\n/g, "<br>") +
                "</p>";
        })
        .join("");
}

function makeCard(notice: Ntc): string {
    return `
    <article class="ntcs-card" data-ntc-id="${notice.id}" id="ntc-${notice.id}">
      <div class="ntcs-card__tgl" tabindex="0" role="button" aria-expanded="false">
        <div class="ntcs-card__hdr">
          <span class="ntcs-card__arr">▶️</span>
          <span class="ntcs-card__ttl">${h.escapeHtml(notice.ttl)}</span>
        </div>
      </div>
      <div class="ntcs-card__cnt content-collapsed">
        <div class="ntcs-card__meta"></div>
        <div class="ntcs-card__txt">${makeText(notice.txt)}</div>
      </div>
    </article>
  `;
}

export function rndNtcs(notices: readonly Ntc[]): string {
    return `
    <section class="ntcs" aria-live="polite">
      <div class="ntcs__lst">
        ${notices.map((notice) => makeCard(notice)).join("")}
      </div>
    </section>
  `;
}
