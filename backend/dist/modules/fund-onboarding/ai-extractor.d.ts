import type { ClassificationResult, ExtractionResult } from './types';
export declare function extractPdfTextForOnboarding(buffer: Buffer): Promise<string>;
export declare function classifyDocument(pdfText: string): Promise<ClassificationResult>;
export declare function extractValues(pdfText: string, fundKey?: string): Promise<ExtractionResult>;
//# sourceMappingURL=ai-extractor.d.ts.map