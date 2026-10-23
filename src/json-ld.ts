/** JSON for an inline `<script type="application/ld+json">`. `<` is escaped so no string can end the element. */
export function jsonLdString(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
