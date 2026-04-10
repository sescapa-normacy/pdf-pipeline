import * as ff from '@google-cloud/functions-framework';
import { curate } from './curator';

interface StorageEventData {
  bucket: string;
  name: string;
  contentType?: string;
  metageneration?: string;
}

/**
 * Cloud Function entry point.
 *
 * Triggered by Eventarc when a file is finalised in the RAW_PDFs bucket.
 * Object path convention: uploads/{documentUploadId}/{fileName}
 */
ff.cloudEvent<StorageEventData>('processPdf', async (event) => {
  const data = event.data;
  if (!data) {
    console.warn('processPdf: received event with no data — skipping');
    return;
  }

  const { name } = data;
  console.log(`processPdf: received object ${name}`);

  // Only process PDFs placed under the uploads/ prefix
  if (!name.startsWith('uploads/')) {
    console.log(`processPdf: ignoring object outside uploads/ prefix: ${name}`);
    return;
  }

  // Extract documentUploadId from path: uploads/{documentUploadId}/{fileName}
  const parts = name.split('/');
  if (parts.length < 3) {
    console.warn(`processPdf: unexpected path format: ${name}`);
    return;
  }

  const documentUploadId = parts[1];
  console.log(`processPdf: starting curation for documentUploadId=${documentUploadId}`);

  await curate(documentUploadId, name);

  console.log(`processPdf: curation complete for documentUploadId=${documentUploadId}`);
});
