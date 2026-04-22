using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSectorOrganisationFundEnrollmentQHEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Address",
                schema: "dbo",
                table: "Member",
                newName: "PhotoUrl");

            migrationBuilder.AddColumn<string>(
                name: "JamiaatCode",
                schema: "dbo",
                table: "Tenant",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "JamiaatName",
                schema: "dbo",
                table: "Tenant",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FundEnrollmentId",
                schema: "txn",
                table: "ReceiptLine",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "QarzanHasanaInstallmentId",
                schema: "txn",
                table: "ReceiptLine",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "QarzanHasanaLoanId",
                schema: "txn",
                table: "ReceiptLine",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AddressLine",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AgeSnapshot",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Area",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AsharaMubarakaCount",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "BloodGroup",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Building",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Category",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DataVerificationStatus",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "DataVerifiedByUserId",
                schema: "dbo",
                table: "Member",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "DataVerifiedOn",
                schema: "dbo",
                table: "Member",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "DateOfBirth",
                schema: "dbo",
                table: "Member",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "DateOfNikah",
                schema: "dbo",
                table: "Member",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DateOfNikahHijri",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FatherItsNumber",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FatherName",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FatherPrefix",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FatherSurname",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FirstName",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FirstPrefix",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Gender",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "HousingOwnership",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "HunarsCsv",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HusbandName",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HusbandPrefix",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Idara",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InactiveReason",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Jamaat",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Jamiaat",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "KarbalaZiyarat",
                schema: "dbo",
                table: "Member",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "LanguagesCsv",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastScannedAtUtc",
                schema: "dbo",
                table: "Member",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LastScannedEventId",
                schema: "dbo",
                table: "Member",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastScannedEventName",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastScannedPlace",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaritalStatus",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateOnly>(
                name: "MisaqDate",
                schema: "dbo",
                table: "Member",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MisaqStatus",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "MotherItsNumber",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Nationality",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Occupation",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PhotoVerificationStatus",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "PhotoVerifiedByUserId",
                schema: "dbo",
                table: "Member",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "PhotoVerifiedOn",
                schema: "dbo",
                table: "Member",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Pincode",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PrefixYear",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "QadambosiSharaf",
                schema: "dbo",
                table: "Member",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "Qualification",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "QuranSanad",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RaudatTaheraZiyarat",
                schema: "dbo",
                table: "Member",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "SectorId",
                schema: "dbo",
                table: "Member",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SpouseItsNumber",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "State",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Street",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubOccupation",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubOccupation2",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SubSectorId",
                schema: "dbo",
                table: "Member",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Surname",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TanzeemFileNo",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Title",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TypeOfHouse",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Vatan",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "WarakatulTarkhisStatus",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "WhatsAppNo",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsLoan",
                schema: "cfg",
                table: "FundType",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "FamilyItsNumber",
                schema: "dbo",
                table: "Family",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TanzeemFileNo",
                schema: "dbo",
                table: "Family",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Event",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    NameArabic = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Category = table.Column<int>(type: "int", nullable: false),
                    EventDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EventDateHijri = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Place = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Event", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FundEnrollment",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FundTypeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FamilyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SubType = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Recurrence = table.Column<int>(type: "int", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedByUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ApprovedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FundEnrollment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FundEnrollment_Family_FamilyId",
                        column: x => x.FamilyId,
                        principalSchema: "dbo",
                        principalTable: "Family",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FundEnrollment_FundType_FundTypeId",
                        column: x => x.FundTypeId,
                        principalSchema: "cfg",
                        principalTable: "FundType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FundEnrollment_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Lookup",
                schema: "cfg",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    NameArabic = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Lookup", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Organisation",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    NameArabic = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Category = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Organisation", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QarzanHasanaLoan",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FamilyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Scheme = table.Column<int>(type: "int", nullable: false),
                    AmountRequested = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    AmountApproved = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    AmountDisbursed = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    AmountRepaid = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    InstalmentsRequested = table.Column<int>(type: "int", nullable: false),
                    InstalmentsApproved = table.Column<int>(type: "int", nullable: false),
                    GoldAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Guarantor1MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Guarantor2MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CashflowDocumentUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    GoldSlipDocumentUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Level1ApproverUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Level1ApproverName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Level1ApprovedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Level1Comments = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Level2ApproverUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Level2ApproverName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Level2ApprovedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Level2Comments = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    DisbursementVoucherId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DisbursedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    RejectionReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CancellationReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QarzanHasanaLoan", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QarzanHasanaLoan_Family_FamilyId",
                        column: x => x.FamilyId,
                        principalSchema: "dbo",
                        principalTable: "Family",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_QarzanHasanaLoan_Member_Guarantor1MemberId",
                        column: x => x.Guarantor1MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_QarzanHasanaLoan_Member_Guarantor2MemberId",
                        column: x => x.Guarantor2MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_QarzanHasanaLoan_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Sector",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    MaleInchargeMemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FemaleInchargeMemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sector", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sector_Member_FemaleInchargeMemberId",
                        column: x => x.FemaleInchargeMemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Sector_Member_MaleInchargeMemberId",
                        column: x => x.MaleInchargeMemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "EventScan",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ScannedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ScannedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Location = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventScan", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventScan_Event_EventId",
                        column: x => x.EventId,
                        principalSchema: "dbo",
                        principalTable: "Event",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EventScan_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MemberOrganisationMembership",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrganisationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Role = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MemberOrganisationMembership", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MemberOrganisationMembership_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MemberOrganisationMembership_Organisation_OrganisationId",
                        column: x => x.OrganisationId,
                        principalSchema: "dbo",
                        principalTable: "Organisation",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "QarzanHasanaInstallment",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QarzanHasanaLoanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InstallmentNo = table.Column<int>(type: "int", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ScheduledAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    PaidAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    LastPaymentDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    WaivedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    WaivedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    WaivedByUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    WaiverReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QarzanHasanaInstallment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QarzanHasanaInstallment_QarzanHasanaLoan_QarzanHasanaLoanId",
                        column: x => x.QarzanHasanaLoanId,
                        principalSchema: "txn",
                        principalTable: "QarzanHasanaLoan",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SubSector",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SectorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    MaleInchargeMemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FemaleInchargeMemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubSector", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubSector_Member_FemaleInchargeMemberId",
                        column: x => x.FemaleInchargeMemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SubSector_Member_MaleInchargeMemberId",
                        column: x => x.MaleInchargeMemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SubSector_Sector_SectorId",
                        column: x => x.SectorId,
                        principalSchema: "dbo",
                        principalTable: "Sector",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tenant_JamiaatCode",
                schema: "dbo",
                table: "Tenant",
                column: "JamiaatCode");

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptLine_FundEnrollmentId",
                schema: "txn",
                table: "ReceiptLine",
                column: "FundEnrollmentId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptLine_QarzanHasanaInstallmentId",
                schema: "txn",
                table: "ReceiptLine",
                column: "QarzanHasanaInstallmentId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptLine_QarzanHasanaLoanId",
                schema: "txn",
                table: "ReceiptLine",
                column: "QarzanHasanaLoanId");

            migrationBuilder.CreateIndex(
                name: "IX_Member_LastScannedEventId",
                schema: "dbo",
                table: "Member",
                column: "LastScannedEventId");

            migrationBuilder.CreateIndex(
                name: "IX_Member_SectorId",
                schema: "dbo",
                table: "Member",
                column: "SectorId");

            migrationBuilder.CreateIndex(
                name: "IX_Member_SubSectorId",
                schema: "dbo",
                table: "Member",
                column: "SubSectorId");

            migrationBuilder.CreateIndex(
                name: "IX_Member_TenantId_FatherItsNumber",
                schema: "dbo",
                table: "Member",
                columns: new[] { "TenantId", "FatherItsNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_Member_TenantId_MotherItsNumber",
                schema: "dbo",
                table: "Member",
                columns: new[] { "TenantId", "MotherItsNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_Member_TenantId_SectorId",
                schema: "dbo",
                table: "Member",
                columns: new[] { "TenantId", "SectorId" });

            migrationBuilder.CreateIndex(
                name: "IX_Member_TenantId_SpouseItsNumber",
                schema: "dbo",
                table: "Member",
                columns: new[] { "TenantId", "SpouseItsNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_Member_TenantId_SubSectorId",
                schema: "dbo",
                table: "Member",
                columns: new[] { "TenantId", "SubSectorId" });

            migrationBuilder.CreateIndex(
                name: "IX_Member_TenantId_TanzeemFileNo",
                schema: "dbo",
                table: "Member",
                columns: new[] { "TenantId", "TanzeemFileNo" },
                filter: "[TanzeemFileNo] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Family_TenantId_TanzeemFileNo",
                schema: "dbo",
                table: "Family",
                columns: new[] { "TenantId", "TanzeemFileNo" },
                unique: true,
                filter: "[TanzeemFileNo] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Event_TenantId_Category",
                schema: "dbo",
                table: "Event",
                columns: new[] { "TenantId", "Category" });

            migrationBuilder.CreateIndex(
                name: "IX_Event_TenantId_EventDate",
                schema: "dbo",
                table: "Event",
                columns: new[] { "TenantId", "EventDate" });

            migrationBuilder.CreateIndex(
                name: "IX_EventScan_EventId",
                schema: "dbo",
                table: "EventScan",
                column: "EventId");

            migrationBuilder.CreateIndex(
                name: "IX_EventScan_MemberId",
                schema: "dbo",
                table: "EventScan",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_EventScan_TenantId_EventId_MemberId",
                schema: "dbo",
                table: "EventScan",
                columns: new[] { "TenantId", "EventId", "MemberId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EventScan_TenantId_MemberId",
                schema: "dbo",
                table: "EventScan",
                columns: new[] { "TenantId", "MemberId" });

            migrationBuilder.CreateIndex(
                name: "IX_FundEnrollment_FamilyId",
                schema: "txn",
                table: "FundEnrollment",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_FundEnrollment_FundTypeId",
                schema: "txn",
                table: "FundEnrollment",
                column: "FundTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_FundEnrollment_MemberId",
                schema: "txn",
                table: "FundEnrollment",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_FundEnrollment_TenantId_Code",
                schema: "txn",
                table: "FundEnrollment",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FundEnrollment_TenantId_MemberId_FundTypeId",
                schema: "txn",
                table: "FundEnrollment",
                columns: new[] { "TenantId", "MemberId", "FundTypeId" });

            migrationBuilder.CreateIndex(
                name: "IX_FundEnrollment_TenantId_Status",
                schema: "txn",
                table: "FundEnrollment",
                columns: new[] { "TenantId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Lookup_TenantId_Category",
                schema: "cfg",
                table: "Lookup",
                columns: new[] { "TenantId", "Category" });

            migrationBuilder.CreateIndex(
                name: "IX_Lookup_TenantId_Category_Code",
                schema: "cfg",
                table: "Lookup",
                columns: new[] { "TenantId", "Category", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MemberOrganisationMembership_MemberId",
                schema: "dbo",
                table: "MemberOrganisationMembership",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_MemberOrganisationMembership_OrganisationId",
                schema: "dbo",
                table: "MemberOrganisationMembership",
                column: "OrganisationId");

            migrationBuilder.CreateIndex(
                name: "IX_MemberOrganisationMembership_TenantId_MemberId",
                schema: "dbo",
                table: "MemberOrganisationMembership",
                columns: new[] { "TenantId", "MemberId" });

            migrationBuilder.CreateIndex(
                name: "IX_MemberOrganisationMembership_TenantId_MemberId_OrganisationId_Role",
                schema: "dbo",
                table: "MemberOrganisationMembership",
                columns: new[] { "TenantId", "MemberId", "OrganisationId", "Role" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MemberOrganisationMembership_TenantId_OrganisationId",
                schema: "dbo",
                table: "MemberOrganisationMembership",
                columns: new[] { "TenantId", "OrganisationId" });

            migrationBuilder.CreateIndex(
                name: "IX_Organisation_TenantId_Code",
                schema: "dbo",
                table: "Organisation",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Organisation_TenantId_Name",
                schema: "dbo",
                table: "Organisation",
                columns: new[] { "TenantId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaInstallment_DueDate",
                schema: "txn",
                table: "QarzanHasanaInstallment",
                column: "DueDate");

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaInstallment_QarzanHasanaLoanId_InstallmentNo",
                schema: "txn",
                table: "QarzanHasanaInstallment",
                columns: new[] { "QarzanHasanaLoanId", "InstallmentNo" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaInstallment_Status",
                schema: "txn",
                table: "QarzanHasanaInstallment",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaLoan_FamilyId",
                schema: "txn",
                table: "QarzanHasanaLoan",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaLoan_Guarantor1MemberId",
                schema: "txn",
                table: "QarzanHasanaLoan",
                column: "Guarantor1MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaLoan_Guarantor2MemberId",
                schema: "txn",
                table: "QarzanHasanaLoan",
                column: "Guarantor2MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaLoan_MemberId",
                schema: "txn",
                table: "QarzanHasanaLoan",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaLoan_TenantId_Code",
                schema: "txn",
                table: "QarzanHasanaLoan",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaLoan_TenantId_MemberId",
                schema: "txn",
                table: "QarzanHasanaLoan",
                columns: new[] { "TenantId", "MemberId" });

            migrationBuilder.CreateIndex(
                name: "IX_QarzanHasanaLoan_TenantId_Status",
                schema: "txn",
                table: "QarzanHasanaLoan",
                columns: new[] { "TenantId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Sector_FemaleInchargeMemberId",
                schema: "dbo",
                table: "Sector",
                column: "FemaleInchargeMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_Sector_MaleInchargeMemberId",
                schema: "dbo",
                table: "Sector",
                column: "MaleInchargeMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_Sector_TenantId_Code",
                schema: "dbo",
                table: "Sector",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Sector_TenantId_Name",
                schema: "dbo",
                table: "Sector",
                columns: new[] { "TenantId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_SubSector_FemaleInchargeMemberId",
                schema: "dbo",
                table: "SubSector",
                column: "FemaleInchargeMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_SubSector_MaleInchargeMemberId",
                schema: "dbo",
                table: "SubSector",
                column: "MaleInchargeMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_SubSector_SectorId",
                schema: "dbo",
                table: "SubSector",
                column: "SectorId");

            migrationBuilder.CreateIndex(
                name: "IX_SubSector_TenantId_SectorId",
                schema: "dbo",
                table: "SubSector",
                columns: new[] { "TenantId", "SectorId" });

            migrationBuilder.CreateIndex(
                name: "IX_SubSector_TenantId_SectorId_Code",
                schema: "dbo",
                table: "SubSector",
                columns: new[] { "TenantId", "SectorId", "Code" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Member_Event_LastScannedEventId",
                schema: "dbo",
                table: "Member",
                column: "LastScannedEventId",
                principalSchema: "dbo",
                principalTable: "Event",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Member_Sector_SectorId",
                schema: "dbo",
                table: "Member",
                column: "SectorId",
                principalSchema: "dbo",
                principalTable: "Sector",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Member_SubSector_SubSectorId",
                schema: "dbo",
                table: "Member",
                column: "SubSectorId",
                principalSchema: "dbo",
                principalTable: "SubSector",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_ReceiptLine_FundEnrollment_FundEnrollmentId",
                schema: "txn",
                table: "ReceiptLine",
                column: "FundEnrollmentId",
                principalSchema: "txn",
                principalTable: "FundEnrollment",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ReceiptLine_QarzanHasanaLoan_QarzanHasanaLoanId",
                schema: "txn",
                table: "ReceiptLine",
                column: "QarzanHasanaLoanId",
                principalSchema: "txn",
                principalTable: "QarzanHasanaLoan",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Member_Event_LastScannedEventId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropForeignKey(
                name: "FK_Member_Sector_SectorId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropForeignKey(
                name: "FK_Member_SubSector_SubSectorId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropForeignKey(
                name: "FK_ReceiptLine_FundEnrollment_FundEnrollmentId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropForeignKey(
                name: "FK_ReceiptLine_QarzanHasanaLoan_QarzanHasanaLoanId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropTable(
                name: "EventScan",
                schema: "dbo");

            migrationBuilder.DropTable(
                name: "FundEnrollment",
                schema: "txn");

            migrationBuilder.DropTable(
                name: "Lookup",
                schema: "cfg");

            migrationBuilder.DropTable(
                name: "MemberOrganisationMembership",
                schema: "dbo");

            migrationBuilder.DropTable(
                name: "QarzanHasanaInstallment",
                schema: "txn");

            migrationBuilder.DropTable(
                name: "SubSector",
                schema: "dbo");

            migrationBuilder.DropTable(
                name: "Event",
                schema: "dbo");

            migrationBuilder.DropTable(
                name: "Organisation",
                schema: "dbo");

            migrationBuilder.DropTable(
                name: "QarzanHasanaLoan",
                schema: "txn");

            migrationBuilder.DropTable(
                name: "Sector",
                schema: "dbo");

            migrationBuilder.DropIndex(
                name: "IX_Tenant_JamiaatCode",
                schema: "dbo",
                table: "Tenant");

            migrationBuilder.DropIndex(
                name: "IX_ReceiptLine_FundEnrollmentId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropIndex(
                name: "IX_ReceiptLine_QarzanHasanaInstallmentId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropIndex(
                name: "IX_ReceiptLine_QarzanHasanaLoanId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropIndex(
                name: "IX_Member_LastScannedEventId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropIndex(
                name: "IX_Member_SectorId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropIndex(
                name: "IX_Member_SubSectorId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropIndex(
                name: "IX_Member_TenantId_FatherItsNumber",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropIndex(
                name: "IX_Member_TenantId_MotherItsNumber",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropIndex(
                name: "IX_Member_TenantId_SectorId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropIndex(
                name: "IX_Member_TenantId_SpouseItsNumber",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropIndex(
                name: "IX_Member_TenantId_SubSectorId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropIndex(
                name: "IX_Member_TenantId_TanzeemFileNo",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropIndex(
                name: "IX_Family_TenantId_TanzeemFileNo",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "JamiaatCode",
                schema: "dbo",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "JamiaatName",
                schema: "dbo",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "FundEnrollmentId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropColumn(
                name: "QarzanHasanaInstallmentId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropColumn(
                name: "QarzanHasanaLoanId",
                schema: "txn",
                table: "ReceiptLine");

            migrationBuilder.DropColumn(
                name: "AddressLine",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "AgeSnapshot",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Area",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "AsharaMubarakaCount",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "BloodGroup",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Building",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Category",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "City",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "DataVerificationStatus",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "DataVerifiedByUserId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "DataVerifiedOn",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "DateOfBirth",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "DateOfNikah",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "DateOfNikahHijri",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "FatherItsNumber",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "FatherName",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "FatherPrefix",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "FatherSurname",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "FirstName",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "FirstPrefix",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Gender",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "HousingOwnership",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "HunarsCsv",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "HusbandName",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "HusbandPrefix",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Idara",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "InactiveReason",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Jamaat",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Jamiaat",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "KarbalaZiyarat",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "LanguagesCsv",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "LastScannedAtUtc",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "LastScannedEventId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "LastScannedEventName",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "LastScannedPlace",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "MaritalStatus",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "MisaqDate",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "MisaqStatus",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "MotherItsNumber",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Nationality",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Occupation",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "PhotoVerificationStatus",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "PhotoVerifiedByUserId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "PhotoVerifiedOn",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Pincode",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "PrefixYear",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "QadambosiSharaf",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Qualification",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "QuranSanad",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "RaudatTaheraZiyarat",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "SectorId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "SpouseItsNumber",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "State",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Street",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "SubOccupation",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "SubOccupation2",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "SubSectorId",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Surname",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "TanzeemFileNo",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Title",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "TypeOfHouse",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "Vatan",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "WarakatulTarkhisStatus",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "WhatsAppNo",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "IsLoan",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "FamilyItsNumber",
                schema: "dbo",
                table: "Family");

            migrationBuilder.DropColumn(
                name: "TanzeemFileNo",
                schema: "dbo",
                table: "Family");

            migrationBuilder.RenameColumn(
                name: "PhotoUrl",
                schema: "dbo",
                table: "Member",
                newName: "Address");
        }
    }
}
