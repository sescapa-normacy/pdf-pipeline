# ── RAW PDFs bucket ───────────────────────────────────────────────────────────
resource "google_storage_bucket" "raw_pdfs" {
  name          = "${var.project_id}-normacy-raw-pdfs"
  location      = var.region
  force_destroy = false

  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
    condition {
      age = 90
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Curated data bucket ────────────────────────────────────────────────────────
resource "google_storage_bucket" "curated_data" {
  name          = "${var.project_id}-normacy-curated-data"
  location      = var.region
  force_destroy = false

  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  depends_on = [google_project_service.apis]
}

# ── Cloud Function source bucket ──────────────────────────────────────────────
resource "google_storage_bucket" "function_source" {
  name          = "${var.project_id}-normacy-function-source"
  location      = var.region
  force_destroy = true

  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  depends_on = [google_project_service.apis]
}

# ── API function source zip ────────────────────────────────────────────────────
data "archive_file" "api_source" {
  type        = "zip"
  source_dir  = "${path.module}/../cloud-functions/api"
  output_path = "${path.module}/tmp/api.zip"
  excludes    = ["node_modules", "dist"]
}

resource "google_storage_bucket_object" "api_source" {
  name   = "api-${data.archive_file.api_source.output_md5}.zip"
  bucket = google_storage_bucket.function_source.name
  source = data.archive_file.api_source.output_path
}

# ── Process PDF function source zip ───────────────────────────────────────────
data "archive_file" "process_pdf_source" {
  type        = "zip"
  source_dir  = "${path.module}/../cloud-functions/process-pdf"
  output_path = "${path.module}/tmp/process-pdf.zip"
  excludes    = ["node_modules", "dist"]
}

resource "google_storage_bucket_object" "process_pdf_source" {
  name   = "process-pdf-${data.archive_file.process_pdf_source.output_md5}.zip"
  bucket = google_storage_bucket.function_source.name
  source = data.archive_file.process_pdf_source.output_path
}
