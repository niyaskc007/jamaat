using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MakeReceiptAndVoucherNumbersNullable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Voucher_TenantId_VoucherNumber",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropIndex(
                name: "IX_Receipt_TenantId_ReceiptNumber",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.AlterColumn<string>(
                name: "VoucherNumber",
                schema: "txn",
                table: "Voucher",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(32)",
                oldMaxLength: 32);

            migrationBuilder.AlterColumn<string>(
                name: "ReceiptNumber",
                schema: "txn",
                table: "Receipt",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(32)",
                oldMaxLength: 32);

            migrationBuilder.CreateIndex(
                name: "IX_Voucher_TenantId_VoucherNumber",
                schema: "txn",
                table: "Voucher",
                columns: new[] { "TenantId", "VoucherNumber" },
                unique: true,
                filter: "[VoucherNumber] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_TenantId_ReceiptNumber",
                schema: "txn",
                table: "Receipt",
                columns: new[] { "TenantId", "ReceiptNumber" },
                unique: true,
                filter: "[ReceiptNumber] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "VoucherNumber",
                schema: "txn",
                table: "Voucher",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ReceiptNumber",
                schema: "txn",
                table: "Receipt",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(32)",
                oldMaxLength: 32,
                oldNullable: true);
        }
    }
}
