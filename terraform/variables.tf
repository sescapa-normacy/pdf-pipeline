variable "project_id" {
  description = "GCP project ID"
  type        = string
  # Set via TF_VAR_project_id or terraform.tfvars
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "europe-west1"
}

variable "vertex_ai_model" {
  description = "Claude model ID on Vertex AI"
  type        = string
  default     = "claude-3-5-sonnet-v2@20241022"
}
