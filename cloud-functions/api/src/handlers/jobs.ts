import type { Request, Response } from 'express';
import { findProcessingJobById, findLatestJobForDocument } from '../models/processingJob';

/**
 * GET /jobs/:jobId
 */
export async function getJob(req: Request, res: Response): Promise<void> {
  const job = await findProcessingJobById(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND', statusCode: 404 });
    return;
  }
  res.status(200).json({ job });
}

/**
 * GET /documents/:documentId/job
 */
export async function getDocumentJob(req: Request, res: Response): Promise<void> {
  const job = await findLatestJobForDocument(req.params.documentId);
  if (!job) {
    res.status(404).json({ error: 'No processing job found for this document', code: 'JOB_NOT_FOUND', statusCode: 404 });
    return;
  }
  res.status(200).json({ job });
}
