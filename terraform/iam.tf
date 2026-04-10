# ── Service Accounts ──────────────────────────────────────────────────────────

# SA for the HTTP API Cloud Function
resource "google_service_account" "api_sa" {
  account_id   = "normacy-pdf-api"
  display_name = "Normacy PDF Pipeline — API Function"
  project      = var.project_id
}

# SA for the GCS-triggered process-pdf Cloud Function
resource "google_service_account" "process_pdf_sa" {
  account_id   = "normacy-process-pdf"
  display_name = "Normacy PDF Pipeline — Process PDF Function"
  project      = var.project_id
}

# SA used by Eventarc to invoke the process-pdf function
resource "google_service_account" "eventarc_sa" {
  account_id   = "normacy-eventarc"
  display_name = "Normacy PDF Pipeline — Eventarc Trigger"
  project      = var.project_id
}

# ── API SA permissions ────────────────────────────────────────────────────────

# Full object control on the RAW_PDFs bucket — needed to sign upload URLs
resource "google_storage_bucket_iam_member" "api_sa_raw_pdfs_admin" {
  bucket = google_storage_bucket.raw_pdfs.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api_sa.email}"
}

# Allows the SA to sign bytes for V4 signed URLs
resource "google_service_account_iam_member" "api_sa_token_creator" {
  service_account_id = google_service_account.api_sa.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.api_sa.email}"
}

# ── Process PDF SA permissions ────────────────────────────────────────────────

resource "google_storage_bucket_iam_member" "process_pdf_raw_pdfs_reader" {
  bucket = google_storage_bucket.raw_pdfs.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.process_pdf_sa.email}"
}

resource "google_storage_bucket_iam_member" "process_pdf_curated_writer" {
  bucket = google_storage_bucket.curated_data.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.process_pdf_sa.email}"
}

resource "google_project_iam_member" "process_pdf_vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.process_pdf_sa.email}"
}

# ── Eventarc SA permissions ───────────────────────────────────────────────────

resource "google_project_iam_member" "eventarc_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.eventarc_sa.email}"
}

resource "google_project_iam_member" "eventarc_event_receiver" {
  project = var.project_id
  role    = "roles/eventarc.eventReceiver"
  member  = "serviceAccount:${google_service_account.eventarc_sa.email}"
}

# GCS needs to publish to Pub/Sub to fire Eventarc triggers
data "google_storage_project_service_account" "gcs_sa" {
  project = var.project_id
}

resource "google_project_iam_member" "gcs_pubsub_publisher" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${data.google_storage_project_service_account.gcs_sa.email_address}"
}

# ── API Gateway → API function invocation ─────────────────────────────────────
# The API Gateway service agent must be able to call the API Cloud Run service.
resource "google_cloud_run_service_iam_member" "api_gateway_invoker" {
  project  = var.project_id
  location = var.region
  service  = google_cloudfunctions2_function.api.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-apigateway.iam.gserviceaccount.com"

  depends_on = [google_cloudfunctions2_function.api]
}
