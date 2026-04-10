import { Storage } from '@google-cloud/storage';
import { getDb } from './db';
import { parsePdf } from './pdfParser';
import { extractWithClaude } from './vertexAi';
import { buildGraph } from './graphBuilder';

const storage = new Storage();

const RAW_PDFS_BUCKET = process.env.RAW_PDFS_BUCKET!;
const CURATED_BUCKET = process.env.CURATED_BUCKET!;

/**
 * Full curation pipeline for a single PDF.
 *
 * Called by the Cloud Function entry point after a file is finalised in
 * the RAW_PDFs bucket.
 */
export async function curate(
  documentUploadId: string,
  gcsPath: string,
): Promise<void> {
  const db = getDb();

  // ── 1. Load document record ───────────────────────────────────────────────
  const docRow = await db('document_uploads')
    .where({ id: documentUploadId })
    .first();

  if (!docRow) {
    throw new Error(`document_upload not found: ${documentUploadId}`);
  }

  // ── 2. Create & start job record ─────────────────────────────────────────
  const [jobRow] = await db('processing_jobs')
    .insert({
      id: require('uuid').v4(),
      document_upload_id: documentUploadId,
      status: 'running',
      started_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('*');

  await db('document_uploads')
    .where({ id: documentUploadId })
    .update({ status: 'processing', updated_at: new Date() });

  try {
    // ── 3. Download PDF ─────────────────────────────────────────────────────
    const [fileBuffer] = await storage
      .bucket(RAW_PDFS_BUCKET)
      .file(gcsPath)
      .download();

    // ── 4. Parse text ───────────────────────────────────────────────────────
    const { text } = await parsePdf(fileBuffer as Buffer);

    // ── 5. LLM extraction ───────────────────────────────────────────────────
    const extraction = await extractWithClaude({
      text,
      documentType: docRow.document_type,
      ctdSection: docRow.ctd_section ?? undefined,
      fileName: docRow.file_name,
    });

    // ── 6. Build graph artefacts ────────────────────────────────────────────
    const { chunks, tableCsvFiles, entities, relationships, cypherScript } =
      buildGraph(
        documentUploadId,
        docRow.file_name,
        docRow.document_type,
        docRow.ctd_section,
        extraction,
      );

    // ── 7. Generate CSV content ──────────────────────────────────────────────
    const chunksCSV = buildChunksCsv(chunks);
    const entitiesCSV = buildEntitiesCsv(entities);
    const relationshipsCSV = buildRelationshipsCsv(relationships);

    const outputPrefix = `curated/${documentUploadId}`;

    // ── 8. Upload artefacts to curated bucket ───────────────────────────────
    const uploads: Promise<void>[] = [
      uploadText(CURATED_BUCKET, `${outputPrefix}/chunks.csv`, chunksCSV, 'text/csv'),
      uploadText(CURATED_BUCKET, `${outputPrefix}/entities.csv`, entitiesCSV, 'text/csv'),
      uploadText(CURATED_BUCKET, `${outputPrefix}/relationships.csv`, relationshipsCSV, 'text/csv'),
      uploadText(CURATED_BUCKET, `${outputPrefix}/graph.cypher`, cypherScript, 'text/plain'),
    ];

    for (const [fileName, csvContent] of tableCsvFiles) {
      uploads.push(
        uploadText(
          CURATED_BUCKET,
          `${outputPrefix}/tables/${fileName}`,
          csvContent,
          'text/csv',
        ),
      );
    }

    await Promise.all(uploads);

    // ── 9. Mark complete ────────────────────────────────────────────────────
    await db('processing_jobs').where({ id: jobRow.id }).update({
      status: 'completed',
      chunks_count: chunks.length,
      entities_count: entities.length,
      output_gcs_path: outputPrefix,
      completed_at: new Date(),
      updated_at: new Date(),
    });

    await db('document_uploads')
      .where({ id: documentUploadId })
      .update({ status: 'curated', updated_at: new Date() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db('processing_jobs').where({ id: jobRow.id }).update({
      status: 'failed',
      error_message: message,
      completed_at: new Date(),
      updated_at: new Date(),
    });

    await db('document_uploads')
      .where({ id: documentUploadId })
      .update({ status: 'failed', updated_at: new Date() });

    throw err;
  }
}

// ── CSV builders ──────────────────────────────────────────────────────────────

type ChunkRow = { chunkId: string; paragraph: string; ctdSection: string; dataType: string; value: string };
type EntityRow = { entityId: string; entityType: string; entityName: string; chunkId: string };
type RelationshipRow = { fromId: string; fromType: string; toId: string; toType: string; relationship: string };

function buildChunksCsv(rows: ChunkRow[]): string {
  const header = 'chunk_id,paragraph,ctd_section,data_type,value';
  const body = rows.map((r) =>
    [r.chunkId, csvEsc(r.paragraph), csvEsc(r.ctdSection), r.dataType, csvEsc(r.value)].join(','),
  );
  return [header, ...body].join('\n');
}

function buildEntitiesCsv(rows: EntityRow[]): string {
  const header = 'entity_id,entity_type,entity_name,chunk_id';
  const body = rows.map((r) =>
    [r.entityId, r.entityType, csvEsc(r.entityName), r.chunkId].join(','),
  );
  return [header, ...body].join('\n');
}

function buildRelationshipsCsv(rows: RelationshipRow[]): string {
  const header = 'from_id,from_type,to_id,to_type,relationship';
  const body = rows.map((r) =>
    [r.fromId, r.fromType, r.toId, r.toType, r.relationship].join(','),
  );
  return [header, ...body].join('\n');
}

function csvEsc(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── GCS upload helper ─────────────────────────────────────────────────────────

async function uploadText(
  bucket: string,
  objectName: string,
  content: string,
  contentType: string,
): Promise<void> {
  await storage.bucket(bucket).file(objectName).save(content, {
    contentType,
    resumable: false,
  });
}
