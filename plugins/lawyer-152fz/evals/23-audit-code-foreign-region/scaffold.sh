#!/usr/bin/env bash
# Учебный проект для кейса: создаётся в рабочей папке прогона.
set -euo pipefail
mkdir -p "$(dirname 'infra/database.tf')"
cat > 'infra/database.tf' <<'FILE'
provider "aws" {
  region = "eu-central-1"
}

resource "aws_db_instance" "customers" {
  identifier     = "customers"
  engine         = "postgres"
  instance_class = "db.t4g.micro"
}
FILE
mkdir -p "$(dirname 'src/db.ts')"
cat > 'src/db.ts' <<'FILE'
export const DATABASE_URL = 'postgres://app@customers.abc123.eu-central-1.rds.amazonaws.com:5432/customers';
FILE
