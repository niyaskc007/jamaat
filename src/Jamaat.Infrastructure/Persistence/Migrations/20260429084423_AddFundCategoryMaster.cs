using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFundCategoryMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "FundCategoryId",
                schema: "cfg",
                table: "FundType",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FundSubCategoryId",
                schema: "cfg",
                table: "FundType",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsReturnable",
                schema: "cfg",
                table: "FundType",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresAgreement",
                schema: "cfg",
                table: "FundType",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresMaturityTracking",
                schema: "cfg",
                table: "FundType",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresNiyyath",
                schema: "cfg",
                table: "FundType",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "FundCategory",
                schema: "cfg",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FundCategory", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FundSubCategory",
                schema: "cfg",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FundCategoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FundSubCategory", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FundType_TenantId_FundCategoryId",
                schema: "cfg",
                table: "FundType",
                columns: new[] { "TenantId", "FundCategoryId" });

            migrationBuilder.CreateIndex(
                name: "IX_FundCategory_TenantId_Code",
                schema: "cfg",
                table: "FundCategory",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FundCategory_TenantId_Kind",
                schema: "cfg",
                table: "FundCategory",
                columns: new[] { "TenantId", "Kind" });

            migrationBuilder.CreateIndex(
                name: "IX_FundSubCategory_TenantId_FundCategoryId",
                schema: "cfg",
                table: "FundSubCategory",
                columns: new[] { "TenantId", "FundCategoryId" });

            migrationBuilder.CreateIndex(
                name: "IX_FundSubCategory_TenantId_FundCategoryId_Code",
                schema: "cfg",
                table: "FundSubCategory",
                columns: new[] { "TenantId", "FundCategoryId", "Code" },
                unique: true);

            // Seed five default FundCategory rows per tenant, then backfill FundType.FundCategoryId
            // from the legacy Category enum so the new master is fully populated for existing data.
            // We use NEWID() per (tenant, kind) — each tenant gets its own master row.
            migrationBuilder.Sql(@"
DECLARE @now DATETIMEOFFSET = SYSDATETIMEOFFSET();

-- Seed default categories per tenant
INSERT INTO [cfg].[FundCategory] (Id, TenantId, Code, Name, Kind, Description, SortOrder, IsActive, CreatedAtUtc)
SELECT NEWID(), t.Id, 'PERM_INCOME', 'Permanent Income', 1,
       'Permanent contributions — receipts post to income; no return obligation. (Mohammedi-style schemes belong here.)', 10, 1, @now
FROM [dbo].[Tenant] t;

INSERT INTO [cfg].[FundCategory] (Id, TenantId, Code, Name, Kind, Description, SortOrder, IsActive, CreatedAtUtc)
SELECT NEWID(), t.Id, 'TEMP_INCOME', 'Temporary Income', 2,
       'Returnable contributions — receipts create a return obligation; not income. (Hussaini-style schemes belong here.)', 20, 1, @now
FROM [dbo].[Tenant] t;

INSERT INTO [cfg].[FundCategory] (Id, TenantId, Code, Name, Kind, Description, SortOrder, IsActive, CreatedAtUtc)
SELECT NEWID(), t.Id, 'LOAN_FUND', 'Loan Fund', 3,
       'Funds that issue loans (e.g. Qarzan Hasana). Same fund may also receive returnable + permanent contributions.', 30, 1, @now
FROM [dbo].[Tenant] t;

INSERT INTO [cfg].[FundCategory] (Id, TenantId, Code, Name, Kind, Description, SortOrder, IsActive, CreatedAtUtc)
SELECT NEWID(), t.Id, 'COMMIT_SCHEME', 'Commitment Scheme', 4,
       'Schemes structured as commitments / pledges with instalment schedules.', 40, 1, @now
FROM [dbo].[Tenant] t;

INSERT INTO [cfg].[FundCategory] (Id, TenantId, Code, Name, Kind, Description, SortOrder, IsActive, CreatedAtUtc)
SELECT NEWID(), t.Id, 'FUNCTION', 'Function-based Fund', 5,
       'Contributions tied to a specific event / majlis / program.', 50, 1, @now
FROM [dbo].[Tenant] t;

-- Backfill FundType.FundCategoryId based on the legacy Category enum.
-- Category mapping:
--   1 Donation → PERM_INCOME      (default — most existing donations are permanent)
--   2 Loan     → LOAN_FUND
--   3 Charity  → PERM_INCOME      (charity is also permanent income from this view)
--   4 CommunitySupport → PERM_INCOME
--   99 Other   → leave NULL (admin will categorise manually)
UPDATE ft SET ft.FundCategoryId = fc.Id
FROM [cfg].[FundType] ft
JOIN [cfg].[FundCategory] fc ON fc.TenantId = ft.TenantId AND fc.Code = 'LOAN_FUND'
WHERE ft.Category = 2 AND ft.FundCategoryId IS NULL;

UPDATE ft SET ft.FundCategoryId = fc.Id
FROM [cfg].[FundType] ft
JOIN [cfg].[FundCategory] fc ON fc.TenantId = ft.TenantId AND fc.Code = 'PERM_INCOME'
WHERE ft.Category IN (1, 3, 4) AND ft.FundCategoryId IS NULL;

-- Qarzan Hasana is the canonical example of a fund that takes returnable money.
-- Pre-flag it so the new behaviour is on by default; admins can adjust per-tenant.
UPDATE [cfg].[FundType]
SET IsReturnable = 1, RequiresAgreement = 1, RequiresMaturityTracking = 1, RequiresNiyyath = 1
WHERE Code = 'QARZAN';
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FundCategory",
                schema: "cfg");

            migrationBuilder.DropTable(
                name: "FundSubCategory",
                schema: "cfg");

            migrationBuilder.DropIndex(
                name: "IX_FundType_TenantId_FundCategoryId",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "FundCategoryId",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "FundSubCategoryId",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "IsReturnable",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "RequiresAgreement",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "RequiresMaturityTracking",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "RequiresNiyyath",
                schema: "cfg",
                table: "FundType");
        }
    }
}
