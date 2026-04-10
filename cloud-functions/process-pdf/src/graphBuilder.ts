import { v4 as uuidv4 } from 'uuid';
import type {
  ExtractionResult,
  ExtractedEntity,
  ChunkRow,
  EntityRow,
  RelationshipRow,
  DocumentType,
} from './types';

// CTD section code → human-readable title (subset of Module 3)
const CTD_TITLES: Record<string, string> = {
  '3.2.S': 'Drug Substance',
  '3.2.S.1': 'General Information',
  '3.2.S.2': 'Manufacture',
  '3.2.S.3': 'Characterisation',
  '3.2.S.4': 'Control of Drug Substance',
  '3.2.S.4.1': 'Specification',
  '3.2.S.4.2': 'Analytical Procedures',
  '3.2.S.4.3': 'Validation of Analytical Procedures',
  '3.2.S.4.4': 'Batch Analyses',
  '3.2.S.4.5': 'Justification of Specification',
  '3.2.S.5': 'Reference Standards or Materials',
  '3.2.S.6': 'Container Closure System',
  '3.2.S.7': 'Stability',
  '3.2.P': 'Drug Product',
  '3.2.P.1': 'Description and Composition',
  '3.2.P.2': 'Pharmaceutical Development',
  '3.2.P.3': 'Manufacture',
  '3.2.P.4': 'Control of Excipients',
  '3.2.P.5': 'Control of Drug Product',
  '3.2.P.5.1': 'Specification',
  '3.2.P.5.2': 'Analytical Procedures',
  '3.2.P.5.3': 'Validation of Analytical Procedures',
  '3.2.P.5.4': 'Batch Analyses',
  '3.2.P.5.6': 'Justification of Specification',
  '3.2.P.6': 'Reference Standards or Materials',
  '3.2.P.7': 'Container Closure System',
  '3.2.P.8': 'Stability',
};

export interface BuildGraphResult {
  chunks: ChunkRow[];
  tableCsvFiles: Map<string, string>; // filename → CSV content
  entities: EntityRow[];
  relationships: RelationshipRow[];
  cypherScript: string;
}

export function buildGraph(
  documentId: string,
  documentName: string,
  documentType: DocumentType,
  ctdSection: string | null,
  extraction: ExtractionResult,
): BuildGraphResult {
  const chunks: ChunkRow[] = [];
  const tableCsvFiles = new Map<string, string>();
  const entities: EntityRow[] = [];
  const relationships: RelationshipRow[] = [];

  // Map entity canonical name → generated ID (MERGE deduplicates by name in Cypher)
  const entityIdMap = new Map<string, string>();

  // ── 1. Process chunks ──────────────────────────────────────────────────────
  for (const extractedChunk of extraction.chunks) {
    const chunkId = uuidv4();
    let tableIndex = 0;

    for (const contentBlock of extractedChunk.content) {
      if (contentBlock.dataType === 'text') {
        chunks.push({
          chunkId,
          paragraph: extractedChunk.paragraph,
          ctdSection: extractedChunk.ctdSection,
          dataType: 'text',
          value: contentBlock.value,
        });
      } else {
        tableIndex++;
        const safeParagraph = sanitizeFileName(extractedChunk.paragraph);
        const tableName = `${chunkId}_${safeParagraph}_table_${String(tableIndex).padStart(2, '0')}.csv`;

        tableCsvFiles.set(tableName, contentBlock.csvData ?? '');

        chunks.push({
          chunkId,
          paragraph: extractedChunk.paragraph,
          ctdSection: extractedChunk.ctdSection,
          dataType: 'table',
          value: tableName,
        });
      }
    }

    // ── 2. Link entities to this chunk ───────────────────────────────────────
    for (const entity of extraction.entities) {
      const canonicalName = entityCanonicalName(entity);
      if (!canonicalName) continue;

      let entityId = entityIdMap.get(`${entity.type}:${canonicalName}`);
      if (!entityId) {
        entityId = uuidv4();
        entityIdMap.set(`${entity.type}:${canonicalName}`, entityId);
        entities.push({
          entityId,
          entityType: entity.type,
          entityName: canonicalName,
          chunkId,
        });
      }

      relationships.push({
        fromId: chunkId,
        fromType: 'Chunk',
        toId: entityId,
        toType: entity.type,
        relationship: entityRelationship(entity.type),
      });
    }
  }

  // ── 3. Document → Section relationships ───────────────────────────────────
  const uniqueSections = [
    ...new Set(chunks.map((c) => c.ctdSection).filter(Boolean)),
  ];
  for (const sec of uniqueSections) {
    relationships.push({
      fromId: documentId,
      fromType: 'Document',
      toId: sec,
      toType: 'Section',
      relationship: 'HAS_SECTION',
    });
    relationships.push({
      fromId: sec,
      fromType: 'Section',
      toId: chunks.find((c) => c.ctdSection === sec)!.chunkId,
      toType: 'Chunk',
      relationship: 'CONTAINS',
    });
  }

  // ── 4. Generate Cypher ─────────────────────────────────────────────────────
  const cypherScript = generateCypher({
    documentId,
    documentName,
    documentType,
    ctdSection,
    chunks,
    uniqueSections,
    entities,
    relationships,
  });

  return { chunks, tableCsvFiles, entities, relationships, cypherScript };
}

// ── Cypher generation ─────────────────────────────────────────────────────────

function generateCypher(params: {
  documentId: string;
  documentName: string;
  documentType: DocumentType;
  ctdSection: string | null;
  chunks: ChunkRow[];
  uniqueSections: string[];
  entities: EntityRow[];
  relationships: RelationshipRow[];
}): string {
  const {
    documentId,
    documentName,
    documentType,
    ctdSection,
    chunks,
    uniqueSections,
    entities,
    relationships,
  } = params;

  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push('// ============================================================');
  lines.push(`// Normacy Knowledge Graph — ${documentName}`);
  lines.push(`// Document ID : ${documentId}`);
  lines.push(`// Type        : ${documentType}`);
  lines.push(`// Generated   : ${now}`);
  lines.push('// Import      : paste into Neo4j Browser or run with cypher-shell');
  lines.push('// ============================================================');
  lines.push('');

  // ── Document node ──────────────────────────────────────────────────────────
  lines.push('// ── DOCUMENT ─────────────────────────────────────────────────');
  const docProps = [
    `  id: '${esc(documentId)}'`,
    `  name: '${esc(documentName)}'`,
    `  type: '${documentType}'`,
    ctdSection ? `  supportedCtdSection: '${esc(ctdSection)}'` : null,
    `  createdAt: datetime('${now}')`,
  ]
    .filter(Boolean)
    .join(',\n');
  lines.push(`CREATE (:Document {\n${docProps}\n});`);
  lines.push('');

  // ── Section nodes ──────────────────────────────────────────────────────────
  if (uniqueSections.length > 0) {
    lines.push('// ── SECTIONS ─────────────────────────────────────────────────');
    for (const sec of uniqueSections) {
      const title = CTD_TITLES[sec] ?? sec;
      lines.push(`MERGE (s:Section {ctdCode: '${esc(sec)}'}) ON CREATE SET s.title = '${esc(title)}';`);
    }
    lines.push('');
  }

  // ── Chunk nodes ────────────────────────────────────────────────────────────
  lines.push('// ── CHUNKS ───────────────────────────────────────────────────');
  for (const chunk of chunks) {
    const chunkProps = [
      `  id: '${esc(chunk.chunkId)}'`,
      `  paragraph: '${esc(chunk.paragraph)}'`,
      `  ctdSection: '${esc(chunk.ctdSection)}'`,
      `  dataType: '${chunk.dataType}'`,
      `  value: '${esc(chunk.value)}'`,
    ].join(',\n');
    lines.push(`CREATE (:Chunk {\n${chunkProps}\n});`);
  }
  lines.push('');

  // ── Entity nodes ───────────────────────────────────────────────────────────
  lines.push('// ── ENTITIES ─────────────────────────────────────────────────');
  const seenEntityIds = new Set<string>();
  for (const entity of entities) {
    if (seenEntityIds.has(entity.entityId)) continue;
    seenEntityIds.add(entity.entityId);

    lines.push(
      `MERGE (:${entity.entityType} {id: '${esc(entity.entityId)}', name: '${esc(entity.entityName)}'});`,
    );
  }
  lines.push('');

  // ── Relationships ──────────────────────────────────────────────────────────
  lines.push('// ── RELATIONSHIPS ────────────────────────────────────────────');

  // Document → Section
  const docSectionRels = relationships.filter(
    (r) => r.fromType === 'Document' && r.toType === 'Section',
  );
  for (const rel of docSectionRels) {
    lines.push(
      `MATCH (d:Document {id: '${esc(rel.fromId)}'}), (s:Section {ctdCode: '${esc(rel.toId)}'}) CREATE (d)-[:${rel.relationship}]->(s);`,
    );
  }

  // Section → Chunk
  const sectionChunkRels = relationships.filter(
    (r) => r.fromType === 'Section' && r.toType === 'Chunk',
  );
  for (const rel of sectionChunkRels) {
    lines.push(
      `MATCH (s:Section {ctdCode: '${esc(rel.fromId)}'}), (c:Chunk {id: '${esc(rel.toId)}'}) CREATE (s)-[:${rel.relationship}]->(c);`,
    );
  }

  // Chunk → Entity
  const chunkEntityRels = relationships.filter((r) => r.fromType === 'Chunk');
  for (const rel of chunkEntityRels) {
    lines.push(
      `MATCH (c:Chunk {id: '${esc(rel.fromId)}'}), (e:${rel.toType} {id: '${esc(rel.toId)}'}) CREATE (c)-[:${rel.relationship}]->(e);`,
    );
  }

  // Supporting doc → Section link
  if (documentType === 'supporting' && ctdSection) {
    lines.push('');
    lines.push('// Supporting document link');
    lines.push(
      `MATCH (d:Document {id: '${esc(documentId)}'}), (s:Section {ctdCode: '${esc(ctdSection)}'}) MERGE (d)-[:SUPPORTS]->(s);`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

// ── helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sanitizeFileName(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 40);
}

function entityCanonicalName(entity: ExtractedEntity): string {
  switch (entity.type) {
    case 'Substance':
    case 'Manufacturer':
    case 'TestMethod':
      return entity.name ?? '';
    case 'Specification':
      return entity.text ?? '';
    case 'BatchNumber':
      return entity.number ?? '';
    case 'Regulation':
      return entity.code ?? '';
    default:
      return '';
  }
}

function entityRelationship(type: ExtractedEntity['type']): string {
  switch (type) {
    case 'Specification':
      return 'DEFINES';
    case 'BatchNumber':
      return 'REFERENCES_BATCH';
    case 'Regulation':
      return 'CITES';
    default:
      return 'MENTIONS';
  }
}
