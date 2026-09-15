-- AlterTable
ALTER TABLE "email_candidates" ADD CONSTRAINT "email_candidates_rule_id_external_message_id_key" UNIQUE ("rule_id", "external_message_id");
