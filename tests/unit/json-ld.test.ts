import { describe, expect, it } from 'vitest';
import { jsonLdString } from '../../src/json-ld';

describe('jsonLdString', () => {
  it('cannot close the surrounding <script> element', () => {
    const hostile = { name: '</script><script>alert(1)</script><!--' };
    const out = jsonLdString(hostile);
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c/script>');
    expect(JSON.parse(out)).toEqual(hostile);
  });
});
