import type { Notice } from '../../geometry/params';
import { de } from '../i18n/de';

/** Human-readable explanation of an automatic correction. */
export function noticeText(n: Notice): string {
  const label = de.fields[n.field] ?? n.field;
  // a wall that lost its handle or label field
  if (/^(handle|label)Sides\./.test(n.field)) return `${label}: ${de.noticeNoRoom}`;
  const value = typeof n.value === 'number' ? ` (${n.value})` : '';
  return `${label}: ${de.notice[n.kind]}${value}`;
}
