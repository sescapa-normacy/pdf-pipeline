# Normacy PDF Pipeline — API Reference

## Overview

The PDF Pipeline API is a REST API hosted on GCP API Gateway. It provides:

- **Upload** — request a signed URL to upload a CTD Module 3 PDF or supporting document directly to GCS
- **Status** — poll document and job status to track curation pipeline progress
- **Output** — once curation is complete, retrieve the GCS path to download chunks, entities, and a Neo4j-ready Cypher script

All requests must include an API key in the `x-api-key` header.

---

## Base URL

```
https://<GATEWAY_HOSTNAME>
```

The gateway hostname is output by Terraform:

```bash
cd backend/pdf-pipeline/terraform
terraform output api_gateway_url
```

---

## Authentication

All endpoints require an API key passed in the request header:

```
x-api-key: YOUR_API_KEY
```

API keys are managed in GCP API Gateway. To create one:

```bash
gcloud services enable apikeys.googleapis.com
gcloud alpha services api-keys create \
  --display-name="Normacy PDF Pipeline Key" \
  --api-target=service=normacy-pdf-pipeline.apigateway.<PROJECT_ID>.cloud.goog
```

---

## Endpoints

### POST /documents/signed-url

Request a signed GCS upload URL.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `fileName` | string | Yes | File name including `.pdf` extension |
| `contentType` | string | Yes | Must be `application/pdf` |
| `documentType` | string | Yes | `ctd_module3` or `supporting` |
| `ctdSection` | string | If `supporting` | CTD section this doc supports, e.g. `3.2.S.4.1` |

**Example**

```bash
curl -X POST https://<GATEWAY_HOSTNAME>/documents/signed-url \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "module3-ibuprofen.pdf",
    "contentType": "application/pdf",
    "documentType": "ctd_module3"
  }'
```

**Response `201`**

```json
{
  "signedUrl": "https://storage.googleapis.com/...",
  "gcsPath": "uploads/abc-123/module3-ibuprofen.pdf",
  "documentUploadId": "abc-123"
}
```

**Upload the file**

Use the returned `signedUrl` with a `PUT` request:

```bash
curl -X PUT "<signedUrl>" \
  -H "Content-Type: application/pdf" \
  --data-binary @module3-ibuprofen.pdf
```

The curation pipeline starts automatically once the file lands in GCS.

---

### GET /documents

List all document uploads for the account, newest first.

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number |
| `limit` | integer | `50` | Results per page (max 100) |

**Example**

```bash
curl https://<GATEWAY_HOSTNAME>/documents?page=1&limit=20 \
  -H "x-api-key: YOUR_KEY"
```

**Response `200`**

```json
{
  "documents": [
    {
      "id": "abc-123",
      "fileName": "module3-ibuprofen.pdf",
      "documentType": "ctd_module3",
      "ctdSection": null,
      "status": "curated",
      "uploadedAt": "2026-04-10T12:00:00Z",
      "createdAt": "2026-04-10T12:00:00Z"
    }
  ],
  "page": 1,
  "limit": 20
}
```

**Document statuses**

| Status | Meaning |
|---|---|
| `uploaded` | File received, pipeline queued |
| `processing` | Curation pipeline is running |
| `curated` | Pipeline completed — output files available in GCS |
| `failed` | Pipeline failed — check the job for `errorMessage` |

---

### GET /documents/{documentId}/job

Get the latest processing job for a document. Use this to poll curation progress after upload.

**Example**

```bash
curl https://<GATEWAY_HOSTNAME>/documents/abc-123/job \
  -H "x-api-key: YOUR_KEY"
```

**Response `200`**

```json
{
  "job": {
    "id": "job-456",
    "documentUploadId": "abc-123",
    "status": "completed",
    "chunksCount": 42,
    "entitiesCount": 18,
    "outputGcsPath": "curated/abc-123",
    "startedAt": "2026-04-10T12:00:05Z",
    "completedAt": "2026-04-10T12:01:30Z",
    "errorMessage": null
  }
}
```

When `status` is `completed`, the following files are available in GCS under `outputGcsPath`:

| File | Description |
|---|---|
| `chunks.csv` | All paragraph chunks with CTD section codes and content type |
| `entities.csv` | Extracted pharmaceutical entities (substance, manufacturer, etc.) |
| `relationships.csv` | Entity-to-chunk relationships |
| `graph.cypher` | Neo4j import script — paste into Neo4j Browser or run with `cypher-shell` |
| `tables/*.csv` | Individual tables extracted from the PDF |

Download example:

```bash
gcloud storage cp -r gs://<CURATED_BUCKET>/curated/abc-123 ./output/
```

---

### GET /jobs/{jobId}

Get a processing job by its ID directly.

**Example**

```bash
curl https://<GATEWAY_HOSTNAME>/jobs/job-456 \
  -H "x-api-key: YOUR_KEY"
```

Response is identical to `GET /documents/{documentId}/job`.

---

## Error responses

All errors follow this shape:

```json
{
  "error": "Human-readable message",
  "code": "SCREAMING_SNAKE_CASE_CODE",
  "statusCode": 400
}
```

**Error codes**

| Code | Status | Description |
|---|---|---|
| `MISSING_REQUIRED_FIELDS` | 400 | `fileName`, `contentType`, or `documentType` missing |
| `INVALID_DOCUMENT_TYPE` | 400 | `documentType` is not `ctd_module3` or `supporting` |
| `MISSING_CTD_SECTION` | 400 | `ctdSection` required for supporting documents |
| `INVALID_CONTENT_TYPE` | 400 | File is not a PDF |
| `JOB_NOT_FOUND` | 404 | Job or document does not exist |
| `NOT_FOUND` | 404 | Route not found |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Output file formats

### chunks.csv

```csv
chunk_id,paragraph,ctd_section,data_type,value
abc123,Specification,3.2.S.4.1,text,"The drug substance shall conform to..."
abc123,Specification,3.2.S.4.1,table,abc123_Specification_table_01.csv
```

- `data_type` is `text` or `table`
- For `table` rows, `value` is the filename of the table CSV in the `tables/` subdirectory

### entities.csv

```csv
entity_id,entity_type,entity_name,chunk_id
e1f2g3,Substance,Ibuprofen,abc123
e4h5i6,TestMethod,HPLC,abc123
```

### relationships.csv

```csv
from_id,from_type,to_id,to_type,relationship
abc123,Chunk,e1f2g3,Substance,MENTIONS
abc123,Chunk,e4h5i6,TestMethod,MENTIONS
```

### graph.cypher

Ready to import into Neo4j. Run with:

```bash
cypher-shell -u neo4j -p password < graph.cypher
# or paste directly into Neo4j Browser
```

Graph schema:

```
(Document)-[:HAS_SECTION]->(Section)
(Section)-[:CONTAINS]->(Chunk)
(Chunk)-[:MENTIONS]->(Substance)
(Chunk)-[:MENTIONS]->(Manufacturer)
(Chunk)-[:MENTIONS]->(TestMethod)
(Chunk)-[:DEFINES]->(Specification)
(Chunk)-[:REFERENCES_BATCH]->(BatchNumber)
(Chunk)-[:CITES]->(Regulation)
(Document)-[:SUPPORTS]->(Section)   ← supporting documents only
```
