// src/content/tags.ts — project tag vocabulary. KO and EN lists are index-aligned with TAG_KEYS.
import type { Lang } from '../i18n/ui';

export const TAG_KEYS = ['geospatial', 'ml', 'public-data', 'cv', 'web', 'gamification', 'viz', 'nlp', 'stats', 'collection'] as const;
export type TagKey = (typeof TAG_KEYS)[number];
export const TAGS_KO = ['공간 분석', '머신러닝', '공공데이터', '컴퓨터 비전', '웹 서비스', '게이미피케이션', '시각화', '자연어 처리', '통계', '데이터 수집'] as const;
export const TAGS_EN = ['Geospatial', 'Machine learning', 'Public data', 'Computer vision', 'Web app', 'Gamification', 'Visualization', 'NLP', 'Statistics', 'Data collection'] as const;
export type TagLabel = (typeof TAGS_KO)[number] | (typeof TAGS_EN)[number];

/** Label in either language -> language-neutral key. Throws on an unknown label. */
export function tagKey(label: TagLabel): TagKey {
  const ko = (TAGS_KO as readonly string[]).indexOf(label);
  const index = ko !== -1 ? ko : (TAGS_EN as readonly string[]).indexOf(label);
  const key = TAG_KEYS[index];
  if (index === -1 || key === undefined) throw new Error(`Unknown tag label: ${label}`);
  return key;
}

/** Key -> label in the page language. */
export function tagLabel(key: TagKey, lang: Lang): string {
  const index = TAG_KEYS.indexOf(key);
  const label = (lang === 'ko' ? TAGS_KO : TAGS_EN)[index];
  if (label === undefined) throw new Error(`Unknown tag key: ${key}`);
  return label;
}
