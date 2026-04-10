// pdf-parse does not ship TypeScript types; declare the minimal interface we use.
declare module 'pdf-parse' {
  interface PDFData {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
  }
  function parse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>,
  ): Promise<PDFData>;
  export = parse;
}

import pdfParse from 'pdf-parse';

export interface ParsedPdf {
  /** Full extracted text from the document */
  text: string;
  pageCount: number;
}

/**
 * Extracts raw text from a PDF buffer.
 *
 * NOTE: Raw text from pdf-parse does not preserve table structure.
 * Table detection and reconstruction are delegated to the LLM step.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedPdf> {
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    pageCount: data.numpages,
  };
}
