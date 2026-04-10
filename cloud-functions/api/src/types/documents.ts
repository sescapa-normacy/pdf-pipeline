export type DocumentType = 'ctd_module3' | 'supporting';
export type DocumentStatus = 'uploaded' | 'processing' | 'curated' | 'failed';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface DocumentUpload {
  id: string;
  accountId: string;
  fileName: string;
  gcsPath: string;
  documentType: DocumentType;
  /** For supporting documents: the CTD section this doc provides evidence for (e.g. "3.2.S.4.1") */
  ctdSection: string | null;
  status: DocumentStatus;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessingJob {
  id: string;
  documentUploadId: string;
  status: JobStatus;
  errorMessage: string | null;
  chunksCount: number | null;
  entitiesCount: number | null;
  /** GCS prefix of the curated output, e.g. "curated/{documentUploadId}" */
  outputGcsPath: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SignedUrlRequest {
  fileName: string;
  contentType: string;
  documentType: DocumentType;
  /** Required when documentType is "supporting" */
  ctdSection?: string;
}
