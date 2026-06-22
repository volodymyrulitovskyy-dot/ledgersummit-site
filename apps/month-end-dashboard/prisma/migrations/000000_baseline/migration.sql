-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "med2";

-- CreateTable
CREATE TABLE "med2"."bs_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "snapshot_id" UUID NOT NULL,
    "section" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bs_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med2"."bs_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'qbo',
    "pulled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pulled_by_user_id" UUID,
    "raw_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bs_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med2"."close_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_user_id" UUID,
    "owner_name" TEXT,
    "due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "computed_due_date" DATE,
    "due_type" TEXT NOT NULL DEFAULT 'fixed',
    "due_workday_n" INTEGER,
    "due_workday_anchor" TEXT,
    "due_offset_days" INTEGER NOT NULL DEFAULT 0,
    "range_from_date" DATE,
    "range_to_date" DATE,

    CONSTRAINT "close_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med2"."exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "account_name" TEXT,
    "account_number" TEXT,
    "balance" DECIMAL,
    "owner_name" TEXT,
    "owner_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med2"."org_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med2"."orgs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med2"."periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med2"."qbo_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "realm_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qbo_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med2"."rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rule_type" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'tb_account',
    "account_match" TEXT,
    "threshold_abs" DECIMAL,
    "threshold_pos" DECIMAL,
    "threshold_neg" DECIMAL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "owner_name" TEXT,
    "owner_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med2"."tb_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "snapshot_id" UUID NOT NULL,
    "account_number" TEXT,
    "account_name" TEXT NOT NULL,
    "account_type" TEXT,
    "debit" DECIMAL,
    "credit" DECIMAL,
    "balance" DECIMAL NOT NULL,
    "currency" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med2"."tb_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "range_from_date" DATE NOT NULL,
    "range_to_date" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual_csv',
    "imported_by_user_id" UUID,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bs_lines_section_idx" ON "med2"."bs_lines"("section");

-- CreateIndex
CREATE INDEX "bs_lines_snapshot_id_idx" ON "med2"."bs_lines"("snapshot_id");

-- CreateIndex
CREATE INDEX "bs_snapshots_org_id_as_of_date_idx" ON "med2"."bs_snapshots"("org_id", "as_of_date");

-- CreateIndex
CREATE INDEX "bs_snapshots_org_id_source_idx" ON "med2"."bs_snapshots"("org_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "bs_snapshots_org_id_as_of_date_source_key" ON "med2"."bs_snapshots"("org_id", "as_of_date", "source");

-- CreateIndex
CREATE INDEX "close_tasks_computed_due_date_idx" ON "med2"."close_tasks"("computed_due_date");

-- CreateIndex
CREATE INDEX "close_tasks_org_period_idx" ON "med2"."close_tasks"("org_id", "period_id");

-- CreateIndex
CREATE INDEX "close_tasks_period_status_idx" ON "med2"."close_tasks"("period_id", "status");

-- CreateIndex
CREATE INDEX "idx_close_tasks_computed_due_date" ON "med2"."close_tasks"("computed_due_date");

-- CreateIndex
CREATE INDEX "idx_close_tasks_org_period" ON "med2"."close_tasks"("org_id", "period_id");

-- CreateIndex
CREATE INDEX "idx_close_tasks_org_range" ON "med2"."close_tasks"("org_id", "range_from_date", "range_to_date");

-- CreateIndex
CREATE INDEX "idx_close_tasks_owner" ON "med2"."close_tasks"("owner_user_id");

-- CreateIndex
CREATE INDEX "idx_close_tasks_period_status" ON "med2"."close_tasks"("period_id", "status");

-- CreateIndex
CREATE INDEX "idx_exceptions_org_snapshot" ON "med2"."exceptions"("org_id", "snapshot_id");

-- CreateIndex
CREATE INDEX "idx_exceptions_rule_id" ON "med2"."exceptions"("rule_id");

-- CreateIndex
CREATE INDEX "idx_exceptions_severity" ON "med2"."exceptions"("severity");

-- CreateIndex
CREATE INDEX "idx_exceptions_snapshot_status" ON "med2"."exceptions"("snapshot_id", "status");

-- CreateIndex
CREATE INDEX "org_members_org_id_idx" ON "med2"."org_members"("org_id");

-- CreateIndex
CREATE INDEX "org_members_user_id_idx" ON "med2"."org_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_org_id_user_id_key" ON "med2"."org_members"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "periods_org_id_idx" ON "med2"."periods"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "periods_org_id_year_month_key" ON "med2"."periods"("org_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_connections_org_id_key" ON "med2"."qbo_connections"("org_id");

-- CreateIndex
CREATE INDEX "idx_qbo_connections_expires_at" ON "med2"."qbo_connections"("expires_at");

-- CreateIndex
CREATE INDEX "idx_qbo_connections_org_id" ON "med2"."qbo_connections"("org_id");

-- CreateIndex
CREATE INDEX "idx_rules_org_id" ON "med2"."rules"("org_id");

-- CreateIndex
CREATE INDEX "idx_tb_lines_account_name" ON "med2"."tb_lines"("account_name");

-- CreateIndex
CREATE INDEX "idx_tb_lines_balance" ON "med2"."tb_lines"("balance");

-- CreateIndex
CREATE INDEX "idx_tb_lines_snapshot_id" ON "med2"."tb_lines"("snapshot_id");

-- CreateIndex
CREATE INDEX "idx_tb_snapshots_imported_at" ON "med2"."tb_snapshots"("imported_at" DESC);

-- CreateIndex
CREATE INDEX "idx_tb_snapshots_org_range" ON "med2"."tb_snapshots"("org_id", "range_from_date", "range_to_date");

-- CreateIndex
CREATE UNIQUE INDEX "unique_org_range_source" ON "med2"."tb_snapshots"("org_id", "range_from_date", "range_to_date", "source");

-- AddForeignKey
ALTER TABLE "med2"."bs_lines" ADD CONSTRAINT "bs_lines_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "med2"."bs_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med2"."bs_snapshots" ADD CONSTRAINT "bs_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "med2"."orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med2"."close_tasks" ADD CONSTRAINT "close_tasks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "med2"."orgs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "med2"."close_tasks" ADD CONSTRAINT "close_tasks_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "med2"."periods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "med2"."exceptions" ADD CONSTRAINT "exceptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "med2"."orgs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "med2"."exceptions" ADD CONSTRAINT "exceptions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "med2"."rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "med2"."exceptions" ADD CONSTRAINT "exceptions_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "med2"."tb_snapshots"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "med2"."org_members" ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "med2"."orgs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "med2"."periods" ADD CONSTRAINT "periods_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "med2"."orgs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "med2"."qbo_connections" ADD CONSTRAINT "qbo_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "med2"."orgs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "med2"."rules" ADD CONSTRAINT "rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "med2"."orgs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "med2"."tb_lines" ADD CONSTRAINT "tb_lines_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "med2"."tb_snapshots"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "med2"."tb_snapshots" ADD CONSTRAINT "tb_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "med2"."orgs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

