import { getDb } from '../db';
import type { ProcessingJob, JobStatus } from '../types/documents';

export async function findProcessingJobById(id: string): Promise<ProcessingJob | null> {
  const db = getDb();
  const row = await db('processing_jobs').where({ id }).first();
  return row ? mapRow(row) : null;
}

export async function findLatestJobForDocument(
  documentUploadId: string,
): Promise<ProcessingJob | null> {
  const db = getDb();
  const row = await db('processing_jobs')
    .where({ document_upload_id: documentUploadId })
    .orderBy('created_at', 'desc')
    .first();
  return row ? mapRow(row) : null;
}

function mapRow(row: Record<string, unknown>): ProcessingJob {
  return {
    id: row.id as string,
    documentUploadId: row.document_upload_id as string,
    status: row.status as JobStatus,
    errorMessage: row.error_message as string | null,
    chunksCount: row.chunks_count as number | null,
    entitiesCount: row.entities_count as number | null,
    outputGcsPath: row.output_gcs_path as string | null,
    startedAt: row.started_at as Date | null,
    completedAt: row.completed_at as Date | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}
