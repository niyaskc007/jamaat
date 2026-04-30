using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberPropertyDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BuiltUpAreaSqft",
                schema: "dbo",
                table: "Member",
                type: "decimal(10,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "EstimatedMarketValue",
                schema: "dbo",
                table: "Member",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HasElevator",
                schema: "dbo",
                table: "Member",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HasGarden",
                schema: "dbo",
                table: "Member",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HasParking",
                schema: "dbo",
                table: "Member",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LandAreaSqft",
                schema: "dbo",
                table: "Member",
                type: "decimal(10,2)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "NumAirConditioners",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "NumBathrooms",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "NumBedrooms",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "NumKitchens",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "NumLivingRooms",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "NumStories",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PropertyAgeYears",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PropertyNotes",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BuiltUpAreaSqft",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "EstimatedMarketValue",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "HasElevator",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "HasGarden",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "HasParking",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "LandAreaSqft",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "NumAirConditioners",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "NumBathrooms",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "NumBedrooms",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "NumKitchens",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "NumLivingRooms",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "NumStories",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "PropertyAgeYears",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "PropertyNotes",
                schema: "dbo",
                table: "Member");
        }
    }
}
