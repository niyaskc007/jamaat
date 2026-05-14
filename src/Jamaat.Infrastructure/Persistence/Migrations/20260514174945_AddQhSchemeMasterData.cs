using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddQhSchemeMasterData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SchemeId",
                schema: "txn",
                table: "QarzanHasanaLoan",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "QhScheme",
                schema: "cfg",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ParentSchemeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RequiresGoldCollateral = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    LegacySchemeValue = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QhScheme", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QhScheme_QhScheme_ParentSchemeId",
                        column: x => x.ParentSchemeId,
                        principalSchema: "cfg",
                        principalTable: "QhScheme",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QhScheme_ParentSchemeId",
                schema: "cfg",
                table: "QhScheme",
                column: "ParentSchemeId");

            migrationBuilder.CreateIndex(
                name: "IX_QhScheme_TenantId_IsActive_SortOrder",
                schema: "cfg",
                table: "QhScheme",
                columns: new[] { "TenantId", "IsActive", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_QhScheme_TenantId_ParentSchemeId_Code",
                schema: "cfg",
                table: "QhScheme",
                columns: new[] { "TenantId", "ParentSchemeId", "Code" },
                unique: true,
                filter: "[ParentSchemeId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QhScheme",
                schema: "cfg");

            migrationBuilder.DropColumn(
                name: "SchemeId",
                schema: "txn",
                table: "QarzanHasanaLoan");
        }
    }
}
