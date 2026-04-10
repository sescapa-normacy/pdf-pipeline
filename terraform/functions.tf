# ── API Cloud Function (HTTP-triggered, behind API Gateway) ───────────────────
resource "google_cloudfunctions2_function" "api" {
  name     = "normacy-pdf-pipeline-api"
  location = var.region
  project  = var.project_id

  build_config {
    runtime     = "nodejs20"
    entry_point = "api"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source.name
        object = google_storage_bucket_object.api_source.name
      }
    }
  }

  service_config {
    min_instance_count    = 0
    max_instance_count    = 10
    available_memory      = "512Mi"
    timeout_seconds       = 30
    service_account_email = google_service_account.api_sa.email

    environment_variables = {
      GCP_PROJECT_ID   = var.project_id
      GCS_RAW_PDFS_BUCKET = google_storage_bucket.raw_pdfs.name
    }

    # DATABASE_URL is stored as a Secret Manager secret.
    # Create it first: gcloud secrets create normacy-db-url --data-file=-
    secret_environment_variables {
      key        = "DATABASE_URL"
      project_id = var.project_id
      secret     = "normacy-db-url"
      version    = "latest"
    }
  }

  depends_on = [
    google_project_service.apis,
    google_storage_bucket_object.api_source,
    google_storage_bucket_iam_member.api_sa_raw_pdfs_admin,
  ]
}

# ── Process PDF Cloud Function (GCS-triggered) ────────────────────────────────
resource "google_cloudfunctions2_function" "process_pdf" {
  name     = "normacy-process-pdf"
  location = var.region
  project  = var.project_id

  build_config {
    runtime     = "nodejs20"
    entry_point = "processPdf"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source.name
        object = google_storage_bucket_object.process_pdf_source.name
      }
    }
  }

  service_config {
    min_instance_count    = 0
    max_instance_count    = 10
    available_memory      = "1Gi"
    timeout_seconds       = 540
    service_account_email = google_service_account.process_pdf_sa.email

    environment_variables = {
      GCP_PROJECT_ID   = var.project_id
      GCP_REGION       = var.region
      RAW_PDFS_BUCKET  = google_storage_bucket.raw_pdfs.name
      CURATED_BUCKET   = google_storage_bucket.curated_data.name
      VERTEX_AI_REGION = var.region
      VERTEX_AI_MODEL  = var.vertex_ai_model
    }

    secret_environment_variables {
      key        = "DATABASE_URL"
      project_id = var.project_id
      secret     = "normacy-db-url"
      version    = "latest"
    }
  }

  event_trigger {
    trigger_region        = var.region
    event_type            = "google.cloud.storage.object.v1.finalized"
    service_account_email = google_service_account.eventarc_sa.email
    retry_policy          = "RETRY_POLICY_RETRY"

    event_filters {
      attribute = "bucket"
      value     = google_storage_bucket.raw_pdfs.name
    }
  }

  depends_on = [
    google_project_service.apis,
    google_storage_bucket_object.process_pdf_source,
    google_project_iam_member.process_pdf_vertex_ai_user,
    google_project_iam_member.eventarc_run_invoker,
    google_project_iam_member.gcs_pubsub_publisher,
  ]
}
