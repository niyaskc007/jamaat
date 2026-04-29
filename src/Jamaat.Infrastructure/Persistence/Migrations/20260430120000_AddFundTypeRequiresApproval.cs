using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFundTypeRequiresApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // When set, receipts on this fund land in Draft state pending approval rather than
            // auto-confirming + posting. The approval action allocates the number, posts the GL,
            // and applies any commitment/QH allocations the receipt carries.
            migrationBuilder.AddColumn<bool>(
                name: "RequiresApproval",
                schema: "cfg",
                table: "FundType",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RequiresApproval",
                schema: "cfg",
                table: "FundType");
        }
    }
}
