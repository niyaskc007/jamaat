using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPostDatedCheques : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PostDatedCheque",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CommitmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CommitmentInstallmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChequeNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ChequeDate = table.Column<DateOnly>(type: "date", nullable: false),
                    DrawnOnBank = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    DepositedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    ClearedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    ClearedReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    BouncedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    BounceReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ReplacedByChequeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CancelledOn = table.Column<DateOnly>(type: "date", nullable: true),
                    CancellationReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PostDatedCheque", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PostDatedCheque_Commitment_CommitmentId",
                        column: x => x.CommitmentId,
                        principalSchema: "txn",
                        principalTable: "Commitment",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PostDatedCheque_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PostDatedCheque_CommitmentId",
                schema: "txn",
                table: "PostDatedCheque",
                column: "CommitmentId");

            migrationBuilder.CreateIndex(
                name: "IX_PostDatedCheque_MemberId",
                schema: "txn",
                table: "PostDatedCheque",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_PostDatedCheque_TenantId_CommitmentId",
                schema: "txn",
                table: "PostDatedCheque",
                columns: new[] { "TenantId", "CommitmentId" });

            migrationBuilder.CreateIndex(
                name: "IX_PostDatedCheque_TenantId_MemberId",
                schema: "txn",
                table: "PostDatedCheque",
                columns: new[] { "TenantId", "MemberId" });

            migrationBuilder.CreateIndex(
                name: "IX_PostDatedCheque_TenantId_Status_ChequeDate",
                schema: "txn",
                table: "PostDatedCheque",
                columns: new[] { "TenantId", "Status", "ChequeDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PostDatedCheque",
                schema: "txn");
        }
    }
}
