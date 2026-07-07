output "app_url" {
  description = "Public DocuLens demo URL served by the Application Load Balancer."
  value       = "http://${aws_lb.app.dns_name}"
}

output "alb_url" {
  description = "Alias for the public ALB URL."
  value       = "http://${aws_lb.app.dns_name}"
}

output "health_url" {
  description = "ALB health endpoint smoke-test URL."
  value       = "http://${aws_lb.app.dns_name}/health"
}

output "database_endpoint" {
  description = "RDS PostgreSQL endpoint for operator-created DATABASE_URL secret value."
  value       = aws_db_instance.app.address
}

output "secret_arns" {
  description = "Secrets Manager containers or external ARNs used by the ECS task; populate values outside Terraform."
  sensitive   = true
  value = {
    database_url = local.database_url_secret_arn
    jwt_secret   = local.jwt_secret_arn
    minimax_key  = local.minimax_secret_arn
  }
}
