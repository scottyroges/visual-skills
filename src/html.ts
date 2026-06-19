/**
 * Only fragment (#id) and absolute http(s) hrefs are linkable — defense-in-depth against a
 * javascript:/data: href slipping into a link; anything else should render as plain text.
 * Shared by the plan (`renderers/overview`) and review (`review/tldr`) link renderers.
 */
export const SAFE_HREF = /^(#[A-Za-z0-9_-]+|https?:\/\/)/;

/** Escape text for safe inclusion in HTML element/attribute content. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
