using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberBehaviorSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "behavior");

            migrationBuilder.CreateTable(
                name: "MemberBehaviorSnapshot",
                schema: "behavior",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Grade = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    TotalScore = table.Column<decimal>(type: "decimal(5,2)", nullable: false),
                    DimensionsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LapsesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LoanReady = table.Column<bool>(type: "bit", nullable: false),
                    LoanReadyReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ComputedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MemberBehaviorSnapshot", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MemberBehaviorSnapshot_ComputedAtUtc",
                schema: "behavior",
                table: "MemberBehaviorSnapshot",
                column: "ComputedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_MemberBehaviorSnapshot_Grade",
                schema: "behavior",
                table: "MemberBehaviorSnapshot",
                column: "Grade");

            migrationBuilder.CreateIndex(
                name: "IX_MemberBehaviorSnapshot_TenantId_MemberId",
                schema: "behavior",
                table: "MemberBehaviorSnapshot",
                columns: new[] { "TenantId", "MemberId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MemberBehaviorSnapshot",
                schema: "behavior");
        }
    }
}
