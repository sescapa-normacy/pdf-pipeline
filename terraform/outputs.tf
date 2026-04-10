output "api_gateway_url" {
  description = "Base URL of the API Gateway — set as VITE_API_GATEWAY_URL in the frontend"
  value       = "https://${google_api_gateway_gateway.pdf_pipeline.default_hostname}"
}

output "raw_pdfs_bucket" {
  description = "Name of the RAW PDFs GCS bucket"
  value       = google_storage_bucket.raw_pdfs.name
}

output "curated_data_bucket" {
  description = "Name of the curated data GCS bucket"
  value       = google_storage_bucket.curated_data.name
}

output "api_function_url" {
  description = "Direct URL of the API Cloud Function (access via API Gateway, not this URL directly)"
  value       = google_cloudfunctions2_function.api.service_config[0].uri
  sensitive   = true
}

output "api_sa_email" {
  description = "API function service account — download its key JSON for local development"
  value       = google_service_account.api_sa.email
}
