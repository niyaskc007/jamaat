using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPdcMultiSourceAndPendingClearance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PendingPostDatedChequeId",
                schema: "txn",
                table: "Voucher",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PendingPostDatedChequeId",
                schema: "txn",
                table: "Receipt",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "MemberId",
                schema: "txn",
                table: "PostDatedCheque",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "CommitmentId",
                schema: "txn",
                table: "PostDatedCheque",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            // PostDatedChequeSource.Commitment = 1. Pre-existing PDC rows are all commitment-
            // linked (only path that could create them before this migration), so backfill 1.
            // Future inserts always set Source explicitly via the entity factories.
            migrationBuilder.AddColumn<int>(
                name: "Source",
                schema: "txn",
                table: "PostDatedCheque",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceReceiptId",
                schema: "txn",
                table: "PostDatedCheque",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceVoucherId",
                schema: "txn",
                table: "PostDatedCheque",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Voucher_PendingPostDatedChequeId",
                schema: "txn",
                table: "Voucher",
                column: "PendingPostDatedChequeId",
                filter: "[PendingPostDatedChequeId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_PendingPostDatedChequeId",
                schema: "txn",
                table: "Receipt",
                column: "PendingPostDatedChequeId",
                filter: "[PendingPostDatedChequeId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PostDatedCheque_SourceReceiptId",
                schema: "txn",
                table: "PostDatedCheque",
                column: "SourceReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_PostDatedCheque_SourceVoucherId",
                schema: "txn",
                table: "PostDatedCheque",
                column: "SourceVoucherId");

            migrationBuilder.CreateIndex(
                name: "IX_PostDatedCheque_TenantId_Source",
                schema: "txn",
                table: "PostDatedCheque",
                columns: new[] { "TenantId", "Source" });

            migrationBuilder.CreateIndex(
                name: "IX_PostDatedCheque_TenantId_SourceReceiptId",
                schema: "txn",
                table: "PostDatedCheque",
                columns: new[] { "TenantId", "SourceReceiptId" });

            migrationBuilder.CreateIndex(
                name: "IX_PostDatedCheque_TenantId_SourceVoucherId",
                schema: "txn",
                table: "PostDatedCheque",
                columns: new[] { "TenantId", "SourceVoucherId" });

            migrationBuilder.AddForeignKey(
                name: "FK_PostDatedCheque_Receipt_SourceReceiptId",
                schema: "txn",
                table: "PostDatedCheque",
                column: "SourceReceiptId",
                principalSchema: "txn",
                principalTable: "Receipt",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PostDatedCheque_Voucher_SourceVoucherId",
                schema: "txn",
                table: "PostDatedCheque",
                column: "SourceVoucherId",
                principalSchema: "txn",
                principalTable: "Voucher",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PostDatedCheque_Receipt_SourceReceiptId",
                schema: "txn",
                table: "PostDatedCheque");

            migrationBuilder.DropForeignKey(
                name: "FK_PostDatedCheque_Voucher_SourceVoucherId",
                schema: "txn",
                table: "PostDatedCheque");

            migrationBuilder.DropIndex(
                name: "IX_Voucher_PendingPostDatedChequeId",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropIndex(
                name: "IX_Receipt_PendingPostDatedChequeId",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropIndex(
                name: "IX_PostDatedCheque_SourceReceiptId",
                schema: "txn",
                table: "PostDatedCheque");

            migrationBuilder.DropIndex(
                name: "IX_PostDatedCheque_SourceVoucherId",
                schema: "txn",
                table: "PostDatedCheque");

            migrationBuilder.DropIndex(
                name: "IX_PostDatedCheque_TenantId_Source",
                schema: "txn",
                table: "PostDatedCheque");

            migrationBuilder.DropIndex(
                name: "IX_PostDatedCheque_TenantId_SourceReceiptId",
                schema: "txn",
                table: "PostDatedCheque");

            migrationBuilder.DropIndex(
                name: "IX_PostDatedCheque_TenantId_SourceVoucherId",
                schema: "txn",
                table: "PostDatedCheque");

            migrationBuilder.DropColumn(
                name: "PendingPostDatedChequeId",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropColumn(
                name: "PendingPostDatedChequeId",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "Source",
                schema: "txn",
                table: "PostDatedCheque");

            migrationBuilder.DropColumn(
                name: "SourceReceiptId",
                schema: "txn",
                table: "PostDatedCheque");

            migrationBuilder.DropColumn(
                name: "SourceVoucherId",
                schema: "txn",
                table: "PostDatedCheque");

            migrationBuilder.AlterColumn<Guid>(
                name: "MemberId",
                schema: "txn",
                table: "PostDatedCheque",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "CommitmentId",
                schema: "txn",
                table: "PostDatedCheque",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }
    }
}
