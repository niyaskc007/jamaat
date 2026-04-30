using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddQhStructuredFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GoldHeldAt",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "GoldPurityKarat",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "GoldWeightGrams",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "decimal(10,3)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IncomeSources",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MonthlyExistingEmis",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MonthlyExpenses",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MonthlyIncome",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "decimal(18,2)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GoldHeldAt",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "GoldPurityKarat",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "GoldWeightGrams",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "IncomeSources",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "MonthlyExistingEmis",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "MonthlyExpenses",
                schema: "txn",
                table: "QarzanHasanaLoan");

            migrationBuilder.DropColumn(
                name: "MonthlyIncome",
                schema: "txn",
                table: "QarzanHasanaLoan");
        }
    }
}
