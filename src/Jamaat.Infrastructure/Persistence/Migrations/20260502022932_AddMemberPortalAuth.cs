using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberPortalAuth : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsLoginAllowed",
                schema: "dbo",
                table: "User",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastPasswordChangedAtUtc",
                schema: "dbo",
                table: "User",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "MustChangePassword",
                schema: "dbo",
                table: "User",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "NotificationChannel",
                schema: "dbo",
                table: "User",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhoneE164",
                schema: "dbo",
                table: "User",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TemporaryPasswordExpiresAtUtc",
                schema: "dbo",
                table: "User",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TemporaryPasswordPlaintext",
                schema: "dbo",
                table: "User",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "LoginAttempts",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Identifier = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    AttemptedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Success = table.Column<bool>(type: "bit", nullable: false),
                    FailureReason = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    IpAddress = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    UserAgent = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    GeoCountry = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    GeoCity = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoginAttempts", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LoginAttempts_TenantId_AttemptedAtUtc",
                table: "LoginAttempts",
                columns: new[] { "TenantId", "AttemptedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_LoginAttempts_TenantId_UserId_AttemptedAtUtc",
                table: "LoginAttempts",
                columns: new[] { "TenantId", "UserId", "AttemptedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LoginAttempts");

            migrationBuilder.DropColumn(
                name: "IsLoginAllowed",
                schema: "dbo",
                table: "User");

            migrationBuilder.DropColumn(
                name: "LastPasswordChangedAtUtc",
                schema: "dbo",
                table: "User");

            migrationBuilder.DropColumn(
                name: "MustChangePassword",
                schema: "dbo",
                table: "User");

            migrationBuilder.DropColumn(
                name: "NotificationChannel",
                schema: "dbo",
                table: "User");

            migrationBuilder.DropColumn(
                name: "PhoneE164",
                schema: "dbo",
                table: "User");

            migrationBuilder.DropColumn(
                name: "TemporaryPasswordExpiresAtUtc",
                schema: "dbo",
                table: "User");

            migrationBuilder.DropColumn(
                name: "TemporaryPasswordPlaintext",
                schema: "dbo",
                table: "User");
        }
    }
}
