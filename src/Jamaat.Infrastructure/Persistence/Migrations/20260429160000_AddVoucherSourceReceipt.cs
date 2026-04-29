using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddVoucherSourceReceipt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SourceReceiptId",
                schema: "txn",
                table: "Voucher",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Voucher_SourceReceiptId",
                schema: "txn",
                table: "Voucher",
                column: "SourceReceiptId",
                filter: "[SourceReceiptId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_Voucher_Receipt_SourceReceiptId",
                schema: "txn",
                table: "Voucher",
                column: "SourceReceiptId",
                principalSchema: "txn",
                principalTable: "Receipt",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Voucher_Receipt_SourceReceiptId",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropIndex(
                name: "IX_Voucher_SourceReceiptId",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropColumn(
                name: "SourceReceiptId",
                schema: "txn",
                table: "Voucher");
        }
    }
}
