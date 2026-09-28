// subset-font ships no types. Only the options this project passes (src/lib/favicon.ts; scripts/fonts/*.mjs are JS).
declare module 'subset-font' {
  interface SubsetFontOptions {
    targetFormat?: 'sfnt' | 'truetype' | 'woff' | 'woff2';
    variationAxes?: Record<string, number | { min: number; max: number; default?: number }>;
    preserveNameIds?: number[];
    keepAllGlyphs?: boolean;
    keepFeatures?: string[];
    noLayoutClosure?: boolean;
  }
  export default function subsetFont(font: Buffer | Uint8Array, text: string | null, options?: SubsetFontOptions): Promise<Buffer>;
}
