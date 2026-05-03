using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSystemAuditLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SystemAuditLog",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ActionKey = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    TargetRef = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    DetailJson = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UserName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    CorrelationId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    IpAddress = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    UserAgent = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    AtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemAuditLog", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SystemAuditLog_ActionKey_AtUtc",
                table: "SystemAuditLog",
                columns: new[] { "ActionKey", "AtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_SystemAuditLog_AtUtc",
                table: "SystemAuditLog",
                column: "AtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SystemAuditLog_UserId_AtUtc",
                table: "SystemAuditLog",
                columns: new[] { "UserId", "AtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SystemAuditLog");
        }
    }
}
