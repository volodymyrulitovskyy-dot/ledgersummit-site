-- CreateTable
CREATE TABLE "explanations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "period_end" DATE NOT NULL,
    "account_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "text" TEXT NOT NULL,

    CONSTRAINT "explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "explanation_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "explanation_id" UUID NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "explanation_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "explanations_org_id_period_end_account_id_idx" ON "explanations"("org_id", "period_end", "account_id");

-- CreateIndex
CREATE INDEX "explanations_org_id_period_end_idx" ON "explanations"("org_id", "period_end");

-- CreateIndex
CREATE INDEX "explanations_rule_id_idx" ON "explanations"("rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "explanations_org_id_period_end_account_id_rule_id_key" ON "explanations"("org_id", "period_end", "account_id", "rule_id");

-- CreateIndex
CREATE INDEX "explanation_comments_explanation_id_idx" ON "explanation_comments"("explanation_id");

-- AddForeignKey
ALTER TABLE "explanation_comments" ADD CONSTRAINT "explanation_comments_explanation_id_fkey" FOREIGN KEY ("explanation_id") REFERENCES "explanations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
