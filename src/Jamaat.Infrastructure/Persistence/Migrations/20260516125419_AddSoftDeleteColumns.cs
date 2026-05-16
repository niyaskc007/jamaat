using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSoftDeleteColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "dbo",
                table: "SubSector",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "dbo",
                table: "SubSector",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "dbo",
                table: "SubSector",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "SubSector",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "dbo",
                table: "Sector",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "dbo",
                table: "Sector",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "dbo",
                table: "Sector",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "Sector",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "QhScheme",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "QhScheme",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "cfg",
                table: "QhScheme",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "QhScheme",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "dbo",
                table: "Organisation",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "dbo",
                table: "Organisation",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "dbo",
                table: "Organisation",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "Organisation",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "NumberingSeries",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "NumberingSeries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "cfg",
                table: "NumberingSeries",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "NumberingSeries",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "dbo",
                table: "MemberOrganisationMembership",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "dbo",
                table: "MemberOrganisationMembership",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "dbo",
                table: "MemberOrganisationMembership",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "MemberOrganisationMembership",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "Member",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "Lookup",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "Lookup",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "cfg",
                table: "Lookup",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "Lookup",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "FundType",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "FundType",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "cfg",
                table: "FundType",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "FundType",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "FundSubCategory",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "FundSubCategory",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "cfg",
                table: "FundSubCategory",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "FundSubCategory",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "FundCategory",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "FundCategory",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "cfg",
                table: "FundCategory",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "FundCategory",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "ExpenseType",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "ExpenseType",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "cfg",
                table: "ExpenseType",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "ExpenseType",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "CommitmentAgreementTemplate",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "CommitmentAgreementTemplate",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "cfg",
                table: "CommitmentAgreementTemplate",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "CommitmentAgreementTemplate",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "BankAccount",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "BankAccount",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletionReason",
                schema: "cfg",
                table: "BankAccount",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "BankAccount",
                type: "datetimeoffset",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "dbo",
                table: "SubSector");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "dbo",
                table: "SubSector");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "dbo",
                table: "SubSector");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "SubSector");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "dbo",
                table: "Sector");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "dbo",
                table: "Sector");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "dbo",
                table: "Sector");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "Sector");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "QhScheme");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "QhScheme");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "cfg",
                table: "QhScheme");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "QhScheme");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "dbo",
                table: "Organisation");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "dbo",
                table: "Organisation");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "dbo",
                table: "Organisation");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "Organisation");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "NumberingSeries");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "NumberingSeries");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "cfg",
                table: "NumberingSeries");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "NumberingSeries");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "dbo",
                table: "MemberOrganisationMembership");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "dbo",
                table: "MemberOrganisationMembership");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "dbo",
                table: "MemberOrganisationMembership");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "MemberOrganisationMembership");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "Lookup");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "Lookup");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "cfg",
                table: "Lookup");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "Lookup");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "FundSubCategory");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "FundSubCategory");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "cfg",
                table: "FundSubCategory");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "FundSubCategory");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "FundCategory");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "FundCategory");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "cfg",
                table: "FundCategory");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "FundCategory");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "ExpenseType");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "ExpenseType");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "cfg",
                table: "ExpenseType");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "ExpenseType");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "CommitmentAgreementTemplate");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "CommitmentAgreementTemplate");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "cfg",
                table: "CommitmentAgreementTemplate");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "CommitmentAgreementTemplate");

            migrationBuilder.DropColumn(
                name: "DeletedAtUtc",
                schema: "cfg",
                table: "BankAccount");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                schema: "cfg",
                table: "BankAccount");

            migrationBuilder.DropColumn(
                name: "DeletionReason",
                schema: "cfg",
                table: "BankAccount");

            migrationBuilder.DropColumn(
                name: "RetentionUntilUtc",
                schema: "cfg",
                table: "BankAccount");
        }
    }
}
