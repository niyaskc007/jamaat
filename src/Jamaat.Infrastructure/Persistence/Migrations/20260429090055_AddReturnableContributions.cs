using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReturnableContributions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AgreementReference",
                schema: "txn",
                table: "Receipt",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AmountReturned",
                schema: "txn",
                table: "Receipt",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "Intention",
                schema: "txn",
                table: "Receipt",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<DateOnly>(
                name: "MaturityDate",
                schema: "txn",
                table: "Receipt",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NiyyathNote",
                schema: "txn",
                table: "Receipt",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_TenantId_Intention",
                schema: "txn",
                table: "Receipt",
                columns: new[] { "TenantId", "Intention" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Receipt_TenantId_Intention",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "AgreementReference",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "AmountReturned",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "Intention",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "MaturityDate",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "NiyyathNote",
                schema: "txn",
                table: "Receipt");
        }
    }
}
