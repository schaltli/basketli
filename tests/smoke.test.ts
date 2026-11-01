import { describe, expect, it } from 'vitest';
import { de } from '../src/ui/i18n/de';

describe('smoke', () => {
  it('has an app title', () => {
    expect(de.appTitle).toBe('basketli');
  });
});
