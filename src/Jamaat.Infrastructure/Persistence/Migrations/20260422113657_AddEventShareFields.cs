using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEventShareFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ShareDescription",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShareImageUrl",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShareTitle",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ShareDescription",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "ShareImageUrl",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "ShareTitle",
                schema: "dbo",
                table: "Event");
        }
    }
}
