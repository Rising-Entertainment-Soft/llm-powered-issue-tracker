-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "description" TEXT;

-- 既存データの originalText には「【要約】...【原文】...」フォーマットで
-- 要約と原文が混ざっている。description カラムへ要約を切り出し、
-- originalText は純粋な原文だけに整える。
-- 該当形式でない行はそのまま (description NULL のまま)。
UPDATE "Ticket"
SET
  "description" = TRIM(SUBSTR(
    "originalText",
    LENGTH('【要約】') + 1,
    INSTR("originalText", '【原文】') - LENGTH('【要約】') - 1
  )),
  "originalText" = TRIM(SUBSTR(
    "originalText",
    INSTR("originalText", '【原文】') + LENGTH('【原文】')
  ))
WHERE "originalText" LIKE '【要約】%【原文】%';
