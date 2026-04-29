using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFundTypeCustomFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CustomFieldsJson",
                schema: "txn",
                table: "Receipt",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "FundTypeCustomField",
                schema: "cfg",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FundTypeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FieldKey = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    HelpText = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    FieldType = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    OptionsCsv = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    DefaultValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FundTypeCustomField", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FundTypeCustomField_TenantId_FundTypeId_FieldKey",
                schema: "cfg",
                table: "FundTypeCustomField",
                columns: new[] { "TenantId", "FundTypeId", "FieldKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FundTypeCustomField_TenantId_FundTypeId_SortOrder",
                schema: "cfg",
                table: "FundTypeCustomField",
                columns: new[] { "TenantId", "FundTypeId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FundTypeCustomField",
                schema: "cfg");

            migrationBuilder.DropColumn(
                name: "CustomFieldsJson",
                schema: "txn",
                table: "Receipt");
        }
    }
}
