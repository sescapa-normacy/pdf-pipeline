import { Storage } from '@google-cloud/storage';

const storage = new Storage();

const RAW_PDFS_BUCKET = process.env.GCS_RAW_PDFS_BUCKET;
if (!RAW_PDFS_BUCKET) throw new Error('GCS_RAW_PDFS_BUCKET env var is not set');

/**
 * Returns a V4 signed URL valid for 15 minutes.
 * The caller should PUT the PDF file to this URL with Content-Type: application/pdf.
 *
 * Requires the function's service account to have:
 *   - roles/storage.objectAdmin on the RAW_PDFs bucket
 *   - roles/iam.serviceAccountTokenCreator on itself
 */
export async function generateSignedUploadUrl(params: {
  gcsPath: string;
  contentType: string;
  expiresInMinutes?: number;
}): Promise<string> {
  const [url] = await storage
    .bucket(RAW_PDFS_BUCKET!)
    .file(params.gcsPath)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + (params.expiresInMinutes ?? 15) * 60 * 1000,
      contentType: params.contentType,
    });
  return url;
}
