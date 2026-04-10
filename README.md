# Normacy PDF Pipeline

A self-contained GCP pipeline that ingests CTD Module 3 PDFs, extracts structured pharmaceutical data using Claude (Vertex AI), and outputs Neo4j-ready graph artefacts.

## Architecture

```
Browser / Frontend
      │
      │  POST /documents/signed-url
      ▼
 API Gateway  ──────────────────────►  Cloud Function: api
      │                                  (HTTP-triggered)
      │                                  ├── requests signed URL from GCS
      │                                  ├── writes document_upload to PostgreSQL
      │                                  └── returns signedUrl to client
      │
      │  PUT <signedUrl> (PDF file, direct from browser)
      ▼
 GCS: RAW_PDFs bucket
      │
      │  Eventarc: object.finalized
      ▼
 Cloud Function: process-pdf
      (GCS-triggered)
      ├── downloads PDF
      ├── extracts text (pdf-parse)
      ├── calls Claude on Vertex AI → structured JSON
      │     chunks: [{paragraph, ctdSection, content}]
      │     entities: [Substance, Manufacturer, TestMethod, ...]
      ├── builds CSVs + graph.cypher
      └── uploads artefacts to GCS: curated bucket
            curated/{documentUploadId}/
              chunks.csv
              entities.csv
              relationships.csv
              graph.cypher          ◄──── import into Neo4j
              tables/*.csv
```

## Directory structure

```
pdf-pipeline/
  terraform/              GCP infrastructure (API Gateway, Cloud Functions, GCS, IAM)
  cloud-functions/
    api/                  HTTP Cloud Function — serves the REST API
    process-pdf/          GCS-triggered Cloud Function — runs the curation pipeline
  db/
    knexfile.ts           Knex configuration for running migrations
    migrations/           PostgreSQL schema migrations
  api-spec/
    openapi.yaml.tpl      API Gateway spec template (function URL injected by Terraform)
  docs/
    api.md                Full API reference
```

---

## Prerequisites

| Tool | Version |
|---|---|
| [Terraform](https://developer.hashicorp.com/terraform/install) | >= 1.7 |
| [gcloud CLI](https://cloud.google.com/sdk/docs/install) | latest |
| [Node.js](https://nodejs.org) | >= 20 |

You also need:
- A GCP project with billing enabled
- A PostgreSQL database reachable from GCP (Cloud SQL recommended — see step 3)
- `gcloud auth application-default login` run locally

---

## Deployment

### 1. Authenticate gcloud

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Store the database connection string as a Secret

The Cloud Functions read `DATABASE_URL` from Secret Manager.

```bash
# Cloud SQL socket format (recommended for production):
# postgresql://USER:PASSWORD@/DB?host=/cloudsql/PROJECT:REGION:INSTANCE
#
# For a local/external PostgreSQL during development:
# postgres://USER:PASSWORD@HOST:5432/DB

echo -n "YOUR_DATABASE_URL" | gcloud secrets create normacy-db-url \
  --replication-policy=automatic \
  --data-file=-
```

Grant Secret Manager access to the function service accounts (Terraform handles this
for the final deploy, but you need the secret to exist first).

### 3. Run database migrations

```bash
cd db
npm install

DATABASE_URL="YOUR_DATABASE_URL" npm run migrate
```

### 4. Deploy infrastructure with Terraform

```bash
cd terraform
terraform init
terraform plan -var="project_id=YOUR_PROJECT_ID"
terraform apply -var="project_id=YOUR_PROJECT_ID"
```

Terraform will:
- Enable required GCP APIs
- Create GCS buckets (RAW_PDFs, curated-data, function-source)
- Create service accounts with least-privilege IAM
- Deploy the `api` and `process-pdf` Cloud Functions
- Create the API Gateway with API key authentication

Note the outputs:

```
api_gateway_url = "https://normacy-pdf-pipeline-gw-xxxx.ew.gateway.dev"
raw_pdfs_bucket = "YOUR_PROJECT_ID-normacy-raw-pdfs"
curated_data_bucket = "YOUR_PROJECT_ID-normacy-curated-data"
api_sa_email = "normacy-pdf-api@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

### 5. Create an API key

```bash
gcloud services enable apikeys.googleapis.com

gcloud alpha services api-keys create \
  --display-name="Normacy PDF Pipeline Key" \
  --api-target=service=normacy-pdf-pipeline.apigateway.YOUR_PROJECT_ID.cloud.goog
```

Copy the generated key string — you will use it as `x-api-key` in all API requests and in the frontend configuration.

### 6. Configure the frontend

Set the API Gateway URL and key as environment variables in the frontend:

```
VITE_API_GATEWAY_URL=https://normacy-pdf-pipeline-gw-xxxx.ew.gateway.dev
VITE_API_KEY=YOUR_API_KEY
```

---

## Local development

You can run the API Cloud Function locally using the Functions Framework.

```bash
cd cloud-functions/api
npm install

# Set required environment variables
export DATABASE_URL="postgres://localhost:5432/normacy_dev"
export GCS_RAW_PDFS_BUCKET="YOUR_PROJECT_ID-normacy-raw-pdfs"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/normacy-pdf-api-key.json"

npm run build
npm run start:local
# API now running at http://localhost:8080
```

To download the service account key for local use:

```bash
# Get the SA email from Terraform output
SA_EMAIL=$(cd terraform && terraform output -raw api_sa_email)

gcloud iam service-accounts keys create ./sa-key.json \
  --iam-account="$SA_EMAIL"
```

The `process-pdf` function cannot easily be run locally because it requires an Eventarc trigger. To test it, deploy to GCP and upload a test PDF via the API.

---

## Updating the pipeline

After any code changes to a Cloud Function:

```bash
cd terraform
terraform apply -var="project_id=YOUR_PROJECT_ID"
```

Terraform detects the new source zip (content-hashed filename) and redeploys only the changed function.

After changes to the API Gateway spec (`api-spec/openapi.yaml.tpl`):

```bash
cd terraform
terraform apply -var="project_id=YOUR_PROJECT_ID"
```

A new API config version is created and the gateway is updated (zero downtime).

---

## Neo4j — importing the graph

After a document is curated (`status: completed`):

```bash
# Download the curated output
DOCUMENT_ID="abc-123"
BUCKET=$(cd terraform && terraform output -raw curated_data_bucket)

gcloud storage cp -r gs://$BUCKET/curated/$DOCUMENT_ID ./output/$DOCUMENT_ID/
```

Import into Neo4j:

```bash
# Option A: Neo4j Browser — paste the contents of graph.cypher

# Option B: cypher-shell
cypher-shell -u neo4j -p YOUR_PASSWORD \
  --file ./output/$DOCUMENT_ID/graph.cypher
```

---

## API documentation

See [docs/api.md](docs/api.md) for the full API reference.
