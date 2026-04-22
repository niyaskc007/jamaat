using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFundCategoryAndGlobalTanzeemFileNo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Add Category column with default=Donation (1)
            migrationBuilder.AddColumn<int>(
                name: "Category",
                schema: "cfg",
                table: "FundType",
                type: "int",
                nullable: false,
                defaultValue: 1 /* FundCategory.Donation */);

            // 2. Backfill Category=Loan (2) for previously-flagged loan rows so no data is lost
            migrationBuilder.Sql(
                "UPDATE [cfg].[FundType] SET [Category] = 2 WHERE [IsLoan] = 1;");

            // 3. Now safe to drop the old bool
            migrationBuilder.DropColumn(
                name: "IsLoan",
                schema: "cfg",
                table: "FundType");

            // 4. Swap the TanzeemFileNo uniqueness from (TenantId, TanzeemFileNo) to global TanzeemFileNo
            migrationBuilder.DropIndex(
                name: "IX_Family_TenantId_TanzeemFileNo",
                schema: "dbo",
                table: "Family");

            migrationBuilder.CreateIndex(
                name: "IX_FundType_TenantId_Category",
                schema: "cfg",
                table: "FundType",
                columns: new[] { "TenantId", "Category" });

            migrationBuilder.CreateIndex(
                name: "IX_Family_TanzeemFileNo",
                schema: "dbo",
                table: "Family",
                column: "TanzeemFileNo",
                unique: true,
                filter: "[TanzeemFileNo] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FundType_TenantId_Category",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropIndex(
                name: "IX_Family_TanzeemFileNo",
                schema: "dbo",
                table: "Family");

            migrationBuilder.AddColumn<bool>(
                name: "IsLoan",
                schema: "cfg",
                table: "FundType",
                type: "bit",
                nullable: false,
                defaultValue: false);

            // Restore IsLoan from Category before dropping Category
            migrationBuilder.Sql(
                "UPDATE [cfg].[FundType] SET [IsLoan] = 1 WHERE [Category] = 2;");

            migrationBuilder.DropColumn(
                name: "Category",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.CreateIndex(
                name: "IX_Family_TenantId_TanzeemFileNo",
                schema: "dbo",
                table: "Family",
                columns: new[] { "TenantId", "TanzeemFileNo" },
                unique: true,
                filter: "[TanzeemFileNo] IS NOT NULL");
        }
    }
}
