-- Hold reports until paid: who let a report out with money still due, and why.
ALTER TABLE "Visit" ADD COLUMN "releasedUnpaidAt" TIMESTAMP(3);
ALTER TABLE "Visit" ADD COLUMN "releasedUnpaidById" TEXT;
ALTER TABLE "Visit" ADD COLUMN "releasedUnpaidReason" TEXT;

-- The permission to do that, for the Owner and Admin roles every lab already
-- has. Other roles get it only if the owner grants it in Roles.
INSERT INTO "Permission" ("id", "code", "label")
SELECT 'perm_report_release_unpaid', 'report.releaseUnpaid', 'Release reports with money due'
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'report.releaseUnpaid');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE p."code" = 'report.releaseUnpaid' AND r."name" IN ('Owner', 'Admin')
ON CONFLICT DO NOTHING;
