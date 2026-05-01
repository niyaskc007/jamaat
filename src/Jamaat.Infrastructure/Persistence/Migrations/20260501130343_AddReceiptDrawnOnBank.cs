using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptDrawnOnBank : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DrawnOnBank",
                schema: "txn",
                table: "Receipt",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DrawnOnBank",
                schema: "txn",
                table: "Receipt");
        }
    }
}
