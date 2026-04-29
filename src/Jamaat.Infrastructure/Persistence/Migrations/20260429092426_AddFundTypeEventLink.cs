using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFundTypeEventLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "EventId",
                schema: "cfg",
                table: "FundType",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_FundType_TenantId_EventId",
                schema: "cfg",
                table: "FundType",
                columns: new[] { "TenantId", "EventId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FundType_TenantId_EventId",
                schema: "cfg",
                table: "FundType");

            migrationBuilder.DropColumn(
                name: "EventId",
                schema: "cfg",
                table: "FundType");
        }
    }
}
