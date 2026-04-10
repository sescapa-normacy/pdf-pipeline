# GCP API Gateway acts as the single entry point for the PDF Pipeline API.
# It enforces API key authentication and routes all traffic to the API Cloud Function.
#
# Note: API Gateway uses the google-beta provider and requires the
# apigateway.googleapis.com, servicemanagement.googleapis.com, and
# servicecontrol.googleapis.com APIs to be enabled (handled in main.tf).

resource "google_api_gateway_api" "pdf_pipeline" {
  provider = google-beta
  project  = var.project_id
  api_id   = "normacy-pdf-pipeline"

  depends_on = [google_project_service.apis]
}

resource "google_api_gateway_api_config" "pdf_pipeline" {
  provider             = google-beta
  project              = var.project_id
  api                  = google_api_gateway_api.pdf_pipeline.api_id
  api_config_id_prefix = "normacy-pdf-pipeline-v"

  openapi_documents {
    document {
      path = "openapi.yaml"
      # Inject the API function URL at plan time so the gateway routes correctly.
      contents = base64encode(templatefile(
        "${path.module}/../api-spec/openapi.yaml.tpl",
        { api_function_url = google_cloudfunctions2_function.api.service_config[0].uri }
      ))
    }
  }

  # API Gateway configs are immutable; always create a new version before destroying the old one.
  lifecycle {
    create_before_destroy = true
  }

  depends_on = [google_cloudfunctions2_function.api]
}

resource "google_api_gateway_gateway" "pdf_pipeline" {
  provider   = google-beta
  project    = var.project_id
  region     = var.region
  api_config = google_api_gateway_api_config.pdf_pipeline.id
  gateway_id = "normacy-pdf-pipeline-gw"

  depends_on = [google_api_gateway_api_config.pdf_pipeline]
}
