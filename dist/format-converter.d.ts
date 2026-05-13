/**
 * Plain-text format converter for iMessage via Sendblue.
 *
 * iMessage is a plain-text platform — markdown bold/italic/links are not
 * rendered natively. Outbound messages strip all formatting. Inbound messages
 * are treated as plain text.
 */
/**
 * Strip markdown-style formatting for Sendblue outbound messages.
 * Preserves newlines and URLs but removes bold, italic, code fences, etc.
 */
export declare function toPlainText(text: string): string;
//# sourceMappingURL=format-converter.d.ts.map