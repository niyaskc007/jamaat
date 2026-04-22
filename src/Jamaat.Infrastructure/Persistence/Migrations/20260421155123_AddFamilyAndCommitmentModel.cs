using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFamilyAndCommitmentModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CommitmentId",
                schema: "txn",
                table: "ReceiptLine",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CommitmentInstallmentId",
                schema: "txn",
                table: "ReceiptLine",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FamilyId",
                schema: "txn",
                table: "Receipt",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FamilyNameSnapshot",
                schema: "txn",
                table: "Receipt",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OnBehalfOfMemberIdsJson",
                schema: "txn",
                table: "Receipt",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FamilyRole",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Address",
                schema: "dbo",
                table: "Family",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Code",
                schema: "dbo",
                table: "Family",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ContactEmail",
                schema: "dbo",
                table: "Family",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactPhone",
                schema: "dbo",
                table: "Family",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "HeadMemberId",
                schema: "dbo",
                table: "Family",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                schema: "dbo",
                table: "Family",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                schema: "dbo",
                table: "Family",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CommitmentAgreementTemplate",
                schema: "cfg",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    FundTypeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Language = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    BodyMarkdown = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsDefault = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommitmentAgreementTemplate", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CommitmentAgreementTemplate_FundType_FundTypeId",
                        column: x => x.FundTypeId,
                        principalSchema: "cfg",
                        principalTable: "FundType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Commitment",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PartyType = table.Column<int>(type: "int", nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FamilyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PartyNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    FundTypeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FundNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    PaidAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Frequency = table.Column<int>(type: "int", nullable: false),
                    NumberOfInstallments = table.Column<int>(type: "int", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    AllowPartialPayments = table.Column<bool>(type: "bit", nullable: false),
                    AllowAutoAdvance = table.Column<bool>(type: "bit", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    AgreementTemplateId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AgreementTemplateVersion = table.Column<int>(type: "int", nullable: true),
                    AgreementText = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AgreementAcceptedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    AgreementAcceptedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AgreementAcceptedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CancelledAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancellationReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Commitment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Commitment_CommitmentAgreementTemplate_AgreementTemplateId",
                        column: x => x.AgreementTemplateId,
                        principalSchema: "cfg",
                        principalTable: "CommitmentAgreementTemplate",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Commitment_Family_FamilyId",
                        column: x => x.FamilyId,
                        principalSchema: "dbo",
                        principalTable: "Family",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Commitment_FundType_FundTypeId",
                        column: x => x.FundTypeId,
                        principalSchema: "cfg",
                        principalTable: "FundType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Commitment_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CommitmentInstallment",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CommitmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InstallmentNo = table.Column<int>(type: "int", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ScheduledAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    PaidAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    LastPaymentDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    WaivedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    WaivedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    WaivedByUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    WaiverReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommitmentInstallment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CommitmentInstallment_Commitment_CommitmentId",
                        column: x => x.CommitmentId,
                        principalSchema: "txn",
                        principalTable: "Commitment",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptLine_CommitmentId",
                schema: "txn",
                table: "ReceiptLine",
                column: "CommitmentId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptLine_CommitmentInstallmentId",
                schema: "txn",
                table: "ReceiptLine",
                column: "CommitmentInstallmentId");

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_FamilyId",
                schema: "txn",
                table: "Receipt",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_TenantId_FamilyId",
                schema: "txn",
                table: "Receipt",
                columns: new[] { "TenantId", "FamilyId" });

            migrationBuilder.CreateIndex(
                name: "IX_Family_TenantId_Code",
                schema: "dbo",
                table: "Family",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Commitment_AgreementTemplateId",
                schema: "txn",
                table: "Commitment",
                column: "AgreementTemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_Commitment_FamilyId",
                schema: "txn",
                table: "Commitment",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_Commitment_FundTypeId",
                schema: "txn",
                table: "Commitment",
                column: "FundTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_Commitment_MemberId",
                schema: "txn",
                table: "Commitment",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_Commitment_TenantId_Code",
                schema: "txn",
                table: "Commitment",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Commitment_TenantId_FamilyId",
                schema: "txn",
                table: "Commitment",
                columns: new[] { "TenantId", "FamilyId" });

            migrationBuilder.CreateIndex(
                name: "IX_Commitment_TenantId_FundTypeId",
                schema: "txn",
                table: "Commitment",
                columns: new[] { "TenantId", "FundTypeId" });

            migrationBuilder.CreateIndex(
                name: "IX_Commitment_TenantId_MemberId",
                schema: "txn",
                table: "Commitment",
                columns: new[] { "TenantId", "MemberId" });

            migrationBuilder.CreateIndex(
                name: "IX_Commitment_TenantId_Status",
                schema: "txn",
                table: "Commitment",
                columns: new[] { "TenantId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_CommitmentAgreementTemplate_FundTypeId",
                schema: "cfg",
                table: "CommitmentAgreementTemplate",
                column: "FundTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_CommitmentAgreementTemplate_TenantId_Code",
                schema: "cfg",
                table: "CommitmentAgreementTemplate",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CommitmentAgreementTemplate_TenantId_FundTypeId",
                schema: "cfg",
                table: "CommitmentAgreementTemplate",
                columns: new[] { "TenantId", "FundTypeId" });

            migrationBuilder.CreateIndex(
                name: "IX_CommitmentInstallment_CommitmentId_InstallmentNo",
                schema: "txn",
                table: "CommitmentInstallment",
                columns: new[] { "CommitmentId", "InstallmentNo" });

            migrationBuilder.CreateIndex(
                name: "IX_CommitmentInstallment_DueDate",
                schema: "txn",
                table: "CommitmentInstallment",
                column: "DueDate");

            migrationBuilder.CreateIndex(
                name: "IX_CommitmentInstallment_Status",
                schema: "txn",
                table: "CommitmentInstallment",
                column: "Status");

            migrationBuilder.AddForeignKey(
                name: "FK_Receipt_Family_FamilyId",
                schema: "txn",
                table: "Receipt",
                column: "FamilyId",
                principalSchema: "dbo",
                principalTable: "Family",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ReceiptLine_Commitment_CommitmentId",
                schema: "txn",
                table: "ReceiptLine",
                column: "CommitmentId",
                principalSchema: "txn",
                principalTable: "Commitment",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Receipt_Family_FamilyId",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropForeignKey(
                name: "FK_ReceiptLine_Commitment_CommitmentId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropTable(
                name: "CommitmentInstallment",
                schema: "txn");

            migrationBuilder.DropTable(
                name: "Commitment",
                schema: "txn");

            migrationBuilder.DropTable(
                name: "CommitmentAgreementTemplate",
                schema: "cfg");

            migrationBuilder.DropIndex(
                name: "IX_ReceiptLine_CommitmentId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropIndex(
                name: "IX_ReceiptLine_CommitmentInstallmentId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropIndex(
                name: "IX_Receipt_FamilyId",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropIndex(
                name: "IX_Receipt_TenantId_FamilyId",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropIndex(
                name: "IX_Family_TenantId_Code",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "CommitmentId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropColumn(
                name: "CommitmentInstallmentId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropColumn(
                name: "FamilyId",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "FamilyNameSnapshot",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "OnBehalfOfMemberIdsJson",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "FamilyRole",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Address",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "Code",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "ContactEmail",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "ContactPhone",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "HeadMemberId",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "IsActive",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "Notes",
                schema: "dbo",
                table: "Family");
        }
    }
}
