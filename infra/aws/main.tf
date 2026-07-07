data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  app_port                = 3000
  vpc_cidr                = "10.42.0.0/16"
  public_subnet_cidrs     = ["10.42.0.0/24", "10.42.1.0/24"]
  database_url_secret_arn = coalesce(var.database_url_secret_arn, aws_secretsmanager_secret.database.arn)
  jwt_secret_arn          = coalesce(var.jwt_secret_arn, aws_secretsmanager_secret.jwt.arn)
  minimax_secret_arn      = coalesce(var.minimax_api_key_secret_arn, aws_secretsmanager_secret.minimax.arn)
  common_tags = {
    Project = "DocuLens AI"
    Stack   = "demo"
  }
}

resource "aws_vpc" "app" {
  cidr_block           = local.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-vpc" })
}

resource "aws_internet_gateway" "app" {
  vpc_id = aws_vpc.app.id

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-igw" })
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.app.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-public-${count.index + 1}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.app.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.app.id
  }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-public" })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb"
  description = "Allow public HTTP to the demo ALB"
  vpc_id      = aws_vpc.app.id

  ingress {
    description = "HTTP from reviewers"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-alb" })
}

resource "aws_security_group" "app" {
  name        = "${var.name_prefix}-app"
  description = "Allow ALB traffic to the DocuLens app task"
  vpc_id      = aws_vpc.app.id

  ingress {
    description     = "App traffic from ALB"
    from_port       = local.app_port
    to_port         = local.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-app" })
}

resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db"
  description = "Allow PostgreSQL only from the app service"
  vpc_id      = aws_vpc.app.id

  ingress {
    description     = "PostgreSQL from app tasks only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-db" })
}

resource "aws_lb" "app" {
  name               = "${var.name_prefix}-alb"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = local.common_tags
}

resource "aws_lb_target_group" "app" {
  name        = "${var.name_prefix}-tg"
  port        = local.app_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.app.id

  health_check {
    enabled             = true
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_db_subnet_group" "app" {
  name       = "${var.name_prefix}-db"
  subnet_ids = aws_subnet.public[*].id

  tags = local.common_tags
}

resource "aws_db_instance" "app" {
  identifier                   = "${var.name_prefix}-postgres"
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = var.db_instance_class
  allocated_storage            = var.db_allocated_storage
  db_name                      = var.database_name
  username                     = var.database_username
  manage_master_user_password  = true
  db_subnet_group_name         = aws_db_subnet_group.app.name
  vpc_security_group_ids       = [aws_security_group.db.id]
  publicly_accessible          = false
  multi_az                     = false
  deletion_protection          = false
  skip_final_snapshot          = true
  backup_retention_period      = 0
  performance_insights_enabled = false

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "jwt" {
  name        = "${var.name_prefix}/jwt-secret"
  description = "Externally populated JWT secret for the DocuLens demo ECS task."

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "database" {
  name        = "${var.name_prefix}/database-url"
  description = "Externally populated DATABASE_URL for the DocuLens demo ECS task."

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "minimax" {
  name        = "${var.name_prefix}/minimax-api-key"
  description = "Externally populated MiniMax API key for the DocuLens demo ECS task."

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.name_prefix}"
  retention_in_days = 7

  tags = local.common_tags
}

data "aws_iam_policy_document" "ecs_tasks_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.name_prefix}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "task_execution_secrets" {
  statement {
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      local.database_url_secret_arn,
      local.jwt_secret_arn,
      local.minimax_secret_arn,
    ]
  }
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name   = "${var.name_prefix}-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_secrets.json
}

resource "aws_ecs_cluster" "app" {
  name = var.name_prefix

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "app" {
  family                   = var.name_prefix
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = "doculens-ai"
      image     = var.image_uri
      essential = true
      portMappings = [
        {
          containerPort = local.app_port
          hostPort      = local.app_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "AI_PROVIDER", value = "minimax" },
        { name = "HOST", value = "0.0.0.0" },
        { name = "PORT", value = tostring(local.app_port) },
        { name = "MINIMAX_BASE_URL", value = "https://api.minimax.io/v1" },
        { name = "MINIMAX_MODEL", value = "MiniMax-M3" }
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = local.database_url_secret_arn },
        { name = "JWT_SECRET", valueFrom = local.jwt_secret_arn },
        { name = "MINIMAX_API_KEY", valueFrom = local.minimax_secret_arn }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "app"
        }
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "app" {
  name            = var.name_prefix
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "doculens-ai"
    container_port   = local.app_port
  }

  depends_on = [aws_lb_listener.http]

  tags = local.common_tags
}
