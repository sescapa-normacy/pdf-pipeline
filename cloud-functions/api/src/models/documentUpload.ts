import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import type { DocumentUpload, DocumentType, DocumentStatus } from '../types/documents';

export async function createDocumentUpload(params: {
  id: string;
  accountId: string;
  fileName: string;
  gcsPath: string;
  documentType: DocumentType;
  ctdSection?: string | null;
}): Promise<DocumentUpload> {
  const db = getDb();
  const now = new Date();
  const [row] = await db('document_uploads')
    .insert({
      id: params.id,
      account_id: params.accountId,
      file_name: params.fileName,
      gcs_path: params.gcsPath,
      document_type: params.documentType,
      ctd_section: params.ctdSection ?? null,
      status: 'uploaded',
      uploaded_at: now,
      created_at: now,
      updated_at: now,
    })
    .returning('*');
  return mapRow(row);
}

export async function listDocumentUploads(
  accountId: string,
  page: number,
  limit: number,
): Promise<DocumentUpload[]> {
  const db = getDb();
  const rows = await db('document_uploads')
    .where({ account_id: accountId })
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset((page - 1) * limit);
  return rows.map(mapRow);
}

function mapRow(row: Record<string, unknown>): DocumentUpload {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    fileName: row.file_name as string,
    gcsPath: row.gcs_path as string,
    documentType: row.document_type as DocumentType,
    ctdSection: row.ctd_section as string | null,
    status: row.status as DocumentStatus,
    uploadedAt: row.uploaded_at as Date,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}
