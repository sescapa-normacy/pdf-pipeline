import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { generateSignedUploadUrl } from '../services/gcs';
import { createDocumentUpload, listDocumentUploads } from '../models/documentUpload';
import type { SignedUrlRequest } from '../types/documents';

/**
 * POST /documents/signed-url
 *
 * Creates a document_upload record and returns a short-lived signed URL
 * so the client can PUT the PDF directly to GCS.
 */
export async function requestSignedUrl(req: Request, res: Response): Promise<void> {
  const { fileName, contentType, documentType, ctdSection }: SignedUrlRequest =
    req.body;

  if (!fileName || !contentType || !documentType) {
    res.status(400).json({
      error: 'fileName, contentType, and documentType are required',
      code: 'MISSING_REQUIRED_FIELDS',
      statusCode: 400,
    });
    return;
  }

  if (!['ctd_module3', 'supporting'].includes(documentType)) {
    res.status(400).json({
      error: 'documentType must be ctd_module3 or supporting',
      code: 'INVALID_DOCUMENT_TYPE',
      statusCode: 400,
    });
    return;
  }

  if (documentType === 'supporting' && !ctdSection) {
    res.status(400).json({
      error: 'ctdSection is required for supporting documents',
      code: 'MISSING_CTD_SECTION',
      statusCode: 400,
    });
    return;
  }

  if (contentType !== 'application/pdf') {
    res.status(400).json({
      error: 'Only PDF files are accepted',
      code: 'INVALID_CONTENT_TYPE',
      statusCode: 400,
    });
    return;
  }

  // TODO: replace with identity from API Gateway JWT/API key once auth is wired
  const accountId = (req.headers['x-account-id'] as string) ?? 'default';

  const documentUploadId = uuidv4();
  const gcsPath = `uploads/${documentUploadId}/${fileName}`;

  const [signedUrl, documentUpload] = await Promise.all([
    generateSignedUploadUrl({ gcsPath, contentType }),
    createDocumentUpload({ id: documentUploadId, accountId, fileName, gcsPath, documentType, ctdSection }),
  ]);

  res.status(201).json({
    signedUrl,
    gcsPath,
    documentUploadId: documentUpload.id,
  });
}

/**
 * GET /documents?page=1&limit=50
 */
export async function listDocuments(req: Request, res: Response): Promise<void> {
  const accountId = (req.headers['x-account-id'] as string) ?? 'default';
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));

  const documents = await listDocumentUploads(accountId, page, limit);
  res.status(200).json({ documents, page, limit });
}
