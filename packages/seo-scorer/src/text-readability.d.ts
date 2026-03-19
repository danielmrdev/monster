declare module "text-readability" {
  interface ReadabilityInstance {
    fleschReadingEase(text: string): number | null;
    fleschKincaidGrade(text: string): number | null;
    fleschKincaidReadingEase(text: string): number | null;
    daleChallReadabilityScore(text: string): number | null;
    automatedReadabilityIndex(text: string): number | null;
    colemanLiauIndex(text: string): number | null;
    linsearWriteFormula(text: string): number | null;
    gunningFog(text: string): number | null;
    textStandard(text: string): string;
    charCount(text: string, ignoreSpaces?: boolean): number;
    letterCount(text: string, ignoreSpaces?: boolean): number;
    syllableCount(text: string, lang?: string): number;
    lexiconCount(text: string, removePunctuation?: boolean): number;
    sentenceCount(text: string): number;
  }
  const readability: ReadabilityInstance;
  export default readability;
}
