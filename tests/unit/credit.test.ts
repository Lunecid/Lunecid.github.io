import { describe, expect, it } from 'vitest';
import { creditParts } from '../../src/lib/credit';
import { t } from '../../src/i18n/utils';

describe('creditParts (final fix 2 item 9)', () => {
  it('splits at the separators, keeps each separator on the piece before it and glues © to its owner', () => {
    const ko = `${t('ko', 'favorites.characterCredit')} · © miHoYo (Zenless Zone Zero)`;
    expect(creditParts(ko)).toEqual(['캐릭터 이미지 ©\u00a0COGNOSPHERE ·', '팬 콘텐츠, 공식 제휴 아님 ·', '©\u00a0miHoYo (Zenless Zone Zero)']);
    expect(creditParts(t('en', 'favorites.characterCredit'))).toEqual(['Character art ©\u00a0COGNOSPHERE ·', 'Fan content, not officially affiliated']);
    expect(creditParts('one piece')).toEqual(['one piece']);
  });

  it('joined with spaces, the pieces read as the original line', () => {
    const line = `${t('en', 'favorites.characterCredit')} · © miHoYo (Zenless Zone Zero)`;
    expect(creditParts(line).join(' ').replace(/\u00a0/g, ' ')).toBe(line);
  });
});
