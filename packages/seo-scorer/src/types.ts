export type PageType = 'homepage' | 'category' | 'product' | 'legal';

export interface SeoScore {
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  content_quality: number;
  meta_elements: number;
  structure: number;
  links: number;
  media: number;
  schema: number;
  technical: number;
  social: number;
  suggestions?: string[];
}
