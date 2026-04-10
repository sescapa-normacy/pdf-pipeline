import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import type { DocumentType, ExtractionResult } from './types';

const client = new AnthropicVertex({
  projectId: process.env.GCP_PROJECT_ID!,
  region: process.env.VERTEX_AI_REGION ?? 'europe-west1',
});

// Model ID for Claude on Vertex AI.
// Update via VERTEX_AI_MODEL env var as newer versions become available.
const MODEL = process.env.VERTEX_AI_MODEL ?? 'claude-3-5-sonnet-v2@20241022';

/**
 * Sends the full PDF text to Claude and returns a structured extraction
 * of CTD chunks and pharmaceutical entities.
 */
export async function extractWithClaude(params: {
  text: string;
  documentType: DocumentType;
  ctdSection?: string;
  fileName: string;
}): Promise<ExtractionResult> {
  const { text, documentType, ctdSection, fileName } = params;

  const systemPrompt = buildSystemPrompt(documentType, ctdSection);
  const userPrompt = buildUserPrompt(text, fileName);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawText =
    response.content[0].type === 'text' ? response.content[0].text : '';

  return parseClaudeResponse(rawText);
}

// ── prompts ───────────────────────────────────────────────────────────────────

function buildSystemPrompt(
  documentType: DocumentType,
  ctdSection?: string,
): string {
  const docContext =
    documentType === 'ctd_module3'
      ? 'This is a CTD Module 3 (Chemistry, Manufacturing and Controls) document.'
      : `This is a supporting document providing evidence for CTD section ${ctdSection ?? 'unknown'}.`;

  return `You are a pharmaceutical regulatory document parser specializing in CTD (Common Technical Document) format.
${docContext}

Your task is to analyze the provided PDF text and return a JSON extraction.

For each identified paragraph or section:
1. Identify the CTD section code from headers (e.g. 3.2.S.4.1, 3.2.P.2.2). For supporting documents, infer the most relevant CTD section or use an empty string if not determinable.
2. Classify each content block as "text" or "table".
3. For tables: reconstruct them as valid CSV (comma-separated, with a header row). Escape commas within values with double-quotes.

Extract all pharmaceutical entities of these types:
- Substance: drug substances and excipients (active ingredients, fillers, binders, etc.)
- Manufacturer: manufacturing sites, companies, or contract organisations
- TestMethod: analytical procedures and techniques (e.g. HPLC, Karl Fischer, dissolution)
- Specification: acceptance criteria with their values (e.g. "Purity: NLT 99.0%", "Assay: 98.0–102.0%")
- BatchNumber: specific batch identifiers referenced in the document
- Regulation: referenced guidelines and standards (e.g. ICH Q6A, USP <711>, 21 CFR 211.68)

Return ONLY valid JSON — no markdown fences, no explanation — matching this schema exactly:
{
  "chunks": [
    {
      "paragraph": "<section title or paragraph header>",
      "ctdSection": "<CTD code or empty string>",
      "content": [
        { "dataType": "text", "value": "<paragraph text>" },
        { "dataType": "table", "value": "", "csvData": "<header row>\\n<data rows>" }
      ]
    }
  ],
  "entities": [
    { "type": "Substance", "name": "<name>" },
    { "type": "Manufacturer", "name": "<name>" },
    { "type": "TestMethod", "name": "<name>" },
    { "type": "Specification", "text": "<acceptance criterion>" },
    { "type": "BatchNumber", "number": "<batch number>" },
    { "type": "Regulation", "code": "<code>", "title": "<title or empty string>" }
  ]
}`;
}

function buildUserPrompt(text: string, fileName: string): string {
  return `Parse the following text extracted from "${fileName}":\n\n${text}`;
}

// ── response parsing ──────────────────────────────────────────────────────────

function parseClaudeResponse(raw: string): ExtractionResult {
  // Strip any accidental markdown fences
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Claude returned non-JSON response. First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }

  const result = parsed as ExtractionResult;

  if (!Array.isArray(result.chunks) || !Array.isArray(result.entities)) {
    throw new Error('Claude response missing required "chunks" or "entities" arrays');
  }

  return result;
}
