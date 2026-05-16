using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddIdentityAndTransactionDeleteSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "admin");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "txn",
                table: "Voucher",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "txn",
                table: "Voucher",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "txn",
                table: "Voucher",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "txn",
                table: "Voucher",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "txn",
                table: "Receipt",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "txn",
                table: "Receipt",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "txn",
                table: "Receipt",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "txn",
                table: "Receipt",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "dbo",
                table: "Family",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "dbo",
                table: "Family",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "dbo",
                table: "Family",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "Family",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TransactionDeletionRequest",
                schema: "admin",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TargetType = table.Column<int>(type: "int", nullable: false),
                    TargetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TargetCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    RequesterUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RequesterUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RequestedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ApproverUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApproverUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ApprovedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DecisionNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TransactionDeletionRequest", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TransactionDeletionRequest_ExpiresAtUtc",
                schema: "admin",
                table: "TransactionDeletionRequest",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_TransactionDeletionRequest_TenantId_Status",
                schema: "admin",
                table: "TransactionDeletionRequest",
                columns: new[] { "TenantId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_TransactionDeletionRequest_TenantId_TargetType_TargetId_Status",
                schema: "admin",
                table: "TransactionDeletionRequest",
                columns: new[] { "TenantId", "TargetType", "TargetId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TransactionDeletionRequest",
                schema: "admin");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "txn",
                table: "Voucher");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "Family");
        }
    }
}
