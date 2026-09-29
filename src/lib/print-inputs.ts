// src/lib/print-inputs.ts — CA-27: the ResumeModel of one document, from the common frame and the document's profile
// (identity, order list, header link). Shared by the five src/pages/print/*.astro pages.
import type { DocumentId } from '../config';
import { splitEntryId } from '../i18n/utils';
import { NEUTRAL_IDENTITY, getVariant, resolveIdentity } from '../variants';
import { getAwards, getFactSource, getProjects, getPublications, getResume } from './portfolio';
import { todayIso } from './records';
import { ACADEMIC_EXTRAS, DOC_LANG, DOC_PROFILE, buildResumeModel, type ResumeModel } from './resume-model';

export async function printModel(doc: DocumentId): Promise<ResumeModel> {
  const lang = DOC_LANG[doc];
  const profile = DOC_PROFILE[doc];
  const facts = await getFactSource();
  const game = resolveIdentity(getVariant('game'), lang, facts);
  const own = profile.identity === 'academic' ? null : resolveIdentity(getVariant(profile.identity), lang, facts);
  // A-11: the Academic CV takes the B-11 neutral headline and keeps the game tagline.
  const identity = own ? { headline: own.headline, tagline: own.tagline } : { headline: NEUTRAL_IDENTITY.headline[lang], tagline: game.tagline };
  const projects = [...(await getProjects('ko')), ...(await getProjects('en'))].map((e) => ({ ...splitEntryId(e.id), data: e.data }));
  return buildResumeModel({
    resume: await getResume(),
    projects,
    publications: (await getPublications()).map((e) => ({ id: e.id, data: e.data })),
    awards: await getAwards(),
    doc,
    today: todayIso(),
    academicExtras: ACADEMIC_EXTRAS,
    identity,
    order: getVariant(profile.order).orders.pdfProjectOrder,
  });
}
