using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddQhGuarantorConsent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "QarzanHasanaGuarantorConsent",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LoanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GuarantorMemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Token = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    RespondedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ResponderIpAddress = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ResponderUserAgent = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NotificationSentAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QarzanHasanaGuarantorConsent", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QarzanHasanaGuarantorConsent_Member_GuarantorMemberId",
                        column: x => x.GuarantorMemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_QarzanHasanaGuarantorConsent_QarzanHasanaLoan_LoanId",
                        column: x => x.LoanId,
                        principalSchema: "txn",
                        principalTable: "QarzanHasanaLoan",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaGuarantorConsent_GuarantorMemberId",
                schema: "txn",
                table: "QarzanHasanaGuarantorConsent",
                column: "GuarantorMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaGuarantorConsent_LoanId_GuarantorMemberId",
                schema: "txn",
                table: "QarzanHasanaGuarantorConsent",
                columns: new[] { "LoanId", "GuarantorMemberId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaGuarantorConsent_Status",
                schema: "txn",
                table: "QarzanHasanaGuarantorConsent",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaGuarantorConsent_Token",
                schema: "txn",
                table: "QarzanHasanaGuarantorConsent",
                column: "Token",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QarzanHasanaGuarantorConsent",
                schema: "txn");
        }
    }
}
