using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPostingRouting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Per-fund liability account so returnable contributions can be split across QH-returnable,
            // scheme-temporary, and other-returnable buckets in the GL instead of all collapsing to 3500.
            migrationBuilder.AddColumn<Guid>(
                name: "LiabilityAccountId",
                schema: "cfg",
                table: "FundType",
                type: "uniqueidentifier",
                nullable: true);

            // Voucher back-link for QH loan disbursements - posting reads this and routes the debit
            // to the QH Receivable asset account instead of an ExpenseType account.
            migrationBuilder.AddColumn<Guid>(
                name: "SourceQarzanHasanaLoanId",
                schema: "txn",
                table: "Voucher",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Voucher_SourceQarzanHasanaLoanId",
                schema: "txn",
                table: "Voucher",
                column: "SourceQarzanHasanaLoanId",
                filter: "[SourceQarzanHasanaLoanId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_Voucher_QarzanHasanaLoan_SourceQarzanHasanaLoanId",
                schema: "txn",
                table: "Voucher",
                column: "SourceQarzanHasanaLoanId",
                principalSchema: "txn",
                principalTable: "QarzanHasanaLoan",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Voucher_QarzanHasanaLoan_SourceQarzanHasanaLoanId",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropIndex(
                name: "IX_Voucher_SourceQarzanHasanaLoanId",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropColumn(
                name: "SourceQarzanHasanaLoanId",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropColumn(
                name: "LiabilityAccountId",
                schema: "cfg",
                table: "FundType");
        }
    }
}
