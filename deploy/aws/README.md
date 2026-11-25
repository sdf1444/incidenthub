# AWS deployment configuration (not a completed deployment)

This repository includes a containerized API, a sample ECS Fargate task definition, and a **manually triggered** GitHub Actions workflow that deploys a new API image to an **existing** ECS service. Nothing here provisions or deploys AWS infrastructure automatically.

## Required infrastructure (create before running the workflow)

1. An AWS account, VPC, private subnets, NAT or appropriate VPC endpoints, security groups, an ECS Fargate cluster and service, and an HTTPS Application Load Balancer routing to port 3001.
2. An RDS MySQL database in private subnets. Permit inbound port 3306 **only** from the ECS task security group. Create the `incidenthub` database/user and apply all SQL scripts in `database/init/` in numeric order through a controlled migration step before deploying. Docker initialization scripts do not run on RDS.
3. ECR repository named `incidenthub-api`, CloudWatch log group `/ecs/incidenthub-api`, ECS task execution role, and Secrets Manager secret containing the DB password. Restrict IAM permissions to the necessary resources.
4. Create an ECS task definition based on `ecs-task-definition.json`. Replace `ACCOUNT_ID`, `REGION`, `RDS_ENDPOINT`, frontend origin and secret ARN. Configure ECS service, health checks and scaling. The JSON is a **template** and will not work until values are replaced.
5. Host the frontend separately (e.g., static S3 + CloudFront) using `apps/web` build with `VITE_API_URL` set to the public HTTPS API URL. Configure `CORS_ORIGIN` to that frontend's HTTPS origin. Do not publish database credentials or webhook secrets to Vite.
6. Configure GitHub OIDC IAM role with narrowly scoped ECR push, ECS describe/register/update, and `iam:PassRole` permissions. Add repository secret `AWS_DEPLOY_ROLE_ARN` and variables `AWS_REGION`, `ECR_REGISTRY` (registry host only), `ECS_CLUSTER`, `ECS_SERVICE`.
7. Trigger **Deploy API to existing AWS ECS service** manually. Confirm `/api/health`, DB persistence after restart, logs and rollback procedure.

## Security and reliability caveats

This portfolio implementation has no authentication/RBAC, rate limiting, formal migration runner or secret rotation. The durable outbox has bounded retries, dead-letter handling and at-least-once semantics; consumers must deduplicate. Do not expose this API publicly with sensitive data until those controls are implemented. Use an allowlisted operator-configured webhook URL; never accept arbitrary user-supplied destinations. Restrict ingress, configure TLS and monitoring, and treat this as a deployment **starting point**, not production certification.

### Outbox worker on ECS
Deploy an additional ECS Fargate service using the same API image, overriding its command to `node dist/worker.js` and using the same MySQL connectivity and `INCIDENT_WEBHOOK_SECRET`. Set `OUTBOX_POLL_MS=2000`; no public load balancer is needed for the worker. Run the `database/init/002_outbox.sql` and `database/init/003_outbox_claim_index.sql` migrations against the existing database before deploying API/worker. Configure `INCIDENT_WEBHOOK_URL` on the API task to enqueue events. This repository provides the task-definition pattern, **not** a provisioned AWS service or verified deployment.

Build from the repository root using `docker build -f apps/api/Dockerfile -t incidenthub-api .`. The API deployment workflow updates only the API service; update the separate worker service to the same compatible image through your controlled deployment process. No worker rollout automation is claimed.
