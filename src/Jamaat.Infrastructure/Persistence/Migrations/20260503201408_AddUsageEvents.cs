using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUsageEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UsageEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Kind = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Path = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Module = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Action = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    HttpMethod = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    StatusCode = table.Column<int>(type: "int", nullable: true),
                    DurationMs = table.Column<int>(type: "int", nullable: true),
                    IpAddress = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    UserAgent = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UsageEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UsageEvents_Kind_Module_OccurredAtUtc",
                table: "UsageEvents",
                columns: new[] { "Kind", "Module", "OccurredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_UsageEvents_TenantId_OccurredAtUtc",
                table: "UsageEvents",
                columns: new[] { "TenantId", "OccurredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_UsageEvents_UserId_OccurredAtUtc",
                table: "UsageEvents",
                columns: new[] { "UserId", "OccurredAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UsageEvents");
        }
    }
}
