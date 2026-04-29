using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCommitmentIntention : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Default-Permanent intention on the commitment itself, mirroring Receipt.Intention.
            // Lets a pledge be marked as Returnable up-front so reports can separate "loans
            // pledged to QH" from "donations pledged to a fund". Existing rows backfill to 1.
            migrationBuilder.AddColumn<int>(
                name: "Intention",
                schema: "txn",
                table: "Commitment",
                type: "int",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Intention",
                schema: "txn",
                table: "Commitment");
        }
    }
}
