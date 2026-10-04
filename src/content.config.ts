import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { JOBFIT_FILES, achievementSchema, awardSchema, favoriteGameSchema, gameRecordSchema, jobfitSchema, legalSchema, newsSchema, projectSchema, publicationSchema, resumeSchema } from './content/schemas';
import { yamlDocumentLoader, yamlDocumentsLoader, yamlListLoader } from './content/yaml-loader';

// Entry ids: projects/legal 'ko/<slug>' (locale folder, never a `slug:` key in frontmatter),
// publications and news = file stem, resume 'resume', jobfit 'game' | 'data' (one file each, A-13), awards/favorites/achievements/gameRecords = item id.
export const collections = {
  projects: defineCollection({ loader: glob({ pattern: '{ko,en}/*.md', base: './src/content/projects' }), schema: ({ image }) => projectSchema(image()) }),
  publications: defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/publications' }), schema: ({ image }) => publicationSchema(image()) }),
  news: defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/news' }), schema: newsSchema }),
  legal: defineCollection({ loader: glob({ pattern: '{ko,en}/*.md', base: './src/content/legal' }), schema: legalSchema }),
  resume: defineCollection({ loader: yamlDocumentLoader('src/data/resume.yaml', 'resume'), schema: resumeSchema }),
  jobfit: defineCollection({ loader: yamlDocumentsLoader(JOBFIT_FILES), schema: jobfitSchema }),
  awards: defineCollection({ loader: yamlListLoader('src/data/awards.yaml'), schema: awardSchema }),
  favorites: defineCollection({ loader: yamlListLoader('src/data/favorites.yaml', 'games'), schema: favoriteGameSchema }),
  achievements: defineCollection({ loader: yamlListLoader('src/data/achievements.yaml'), schema: achievementSchema }),
  gameRecords: defineCollection({ loader: yamlListLoader('src/data/game-records.yaml', 'records'), schema: gameRecordSchema }),
};
