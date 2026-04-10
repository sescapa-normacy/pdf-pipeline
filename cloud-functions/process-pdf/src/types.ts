export type DocumentType = 'ctd_module3' | 'supporting';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type DocumentStatus = 'uploaded' | 'processing' | 'curated' | 'failed';

// ── Claude extraction output ──────────────────────────────────────────────────

export type DataType = 'text' | 'table';

export interface ChunkContent {
  dataType: DataType;
  /** For text: the paragraph text. For table: empty string (table is in csvData) */
  value: string;
  /** Present only when dataType is "table" */
  csvData?: string;
}

export interface ExtractedChunk {
  paragraph: string;
  /** CTD section code, e.g. "3.2.S.4.1". May be empty for supporting docs */
  ctdSection: string;
  content: ChunkContent[];
}

export type EntityType =
  | 'Substance'
  | 'Manufacturer'
  | 'TestMethod'
  | 'Specification'
  | 'BatchNumber'
  | 'Regulation';

export interface ExtractedEntity {
  type: EntityType;
  /** Primary label — substance name, manufacturer name, test method name, etc. */
  name?: string;
  /** For Specification entities */
  text?: string;
  /** For BatchNumber entities */
  number?: string;
  /** For Regulation entities */
  code?: string;
  title?: string;
}

export interface ExtractionResult {
  chunks: ExtractedChunk[];
  entities: ExtractedEntity[];
}

// ── Graph builder output ──────────────────────────────────────────────────────

export interface ChunkRow {
  chunkId: string;
  paragraph: string;
  ctdSection: string;
  dataType: DataType;
  /** Text content, or the GCS object name of the table CSV */
  value: string;
}

export interface EntityRow {
  entityId: string;
  entityType: EntityType;
  /** Canonical display name */
  entityName: string;
  chunkId: string;
}

export interface RelationshipRow {
  fromId: string;
  fromType: string;
  toId: string;
  toType: string;
  relationship: string;
}
