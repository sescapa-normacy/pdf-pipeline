import * as ff from '@google-cloud/functions-framework';
import express from 'express';
import cors from 'cors';
import { requestSignedUrl, listDocuments } from './handlers/documents';
import { getJob, getDocumentJob } from './handlers/jobs';

const app = express();

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.post('/documents/signed-url', wrap(requestSignedUrl));
app.get('/documents', wrap(listDocuments));
app.get('/documents/:documentId/job', wrap(getDocumentJob));
app.get('/jobs/:jobId', wrap(getJob));

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', statusCode: 404 });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res
      .status(500)
      .json({ error: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 });
  },
);

// ── Cloud Functions entry point ───────────────────────────────────────────────
ff.http('api', app);

// ── Helper ────────────────────────────────────────────────────────────────────
function wrap(
  fn: (req: express.Request, res: express.Response) => Promise<void>,
): express.RequestHandler {
  return (req, res, next) => fn(req, res).catch(next);
}
