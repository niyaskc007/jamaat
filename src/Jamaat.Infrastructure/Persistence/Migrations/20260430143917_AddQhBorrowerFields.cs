using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddQhBorrowerFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "GuarantorsAcknowledged",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "GuarantorsAcknowledgedAtUtc",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GuarantorsAcknowledgedByUserName",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OtherObligations",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Purpose",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RepaymentPlan",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceOfIncome",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GuarantorsAcknowledged",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "GuarantorsAcknowledgedAtUtc",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "GuarantorsAcknowledgedByUserName",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "OtherObligations",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "Purpose",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "RepaymentPlan",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "SourceOfIncome",
                schema: "txn",
                table: "QarzanHasanaLoan");
        }
    }
}
