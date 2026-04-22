using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEventPortal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccentColor",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(9)",
                maxLength: 9,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "AllowGuests",
                schema: "dbo",
                table: "Event",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "Capacity",
                schema: "dbo",
                table: "Event",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactEmail",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactPhone",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverImageUrl",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EndsAtUtc",
                schema: "dbo",
                table: "Event",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LogoUrl",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxGuestsPerRegistration",
                schema: "dbo",
                table: "Event",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "OpenToNonMembers",
                schema: "dbo",
                table: "Event",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PrimaryColor",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(9)",
                maxLength: 9,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RegistrationClosesAtUtc",
                schema: "dbo",
                table: "Event",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RegistrationOpensAtUtc",
                schema: "dbo",
                table: "Event",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RegistrationsEnabled",
                schema: "dbo",
                table: "Event",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresApproval",
                schema: "dbo",
                table: "Event",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Slug",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StartsAtUtc",
                schema: "dbo",
                table: "Event",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Tagline",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VenueAddress",
                schema: "dbo",
                table: "Event",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VenueLatitude",
                schema: "dbo",
                table: "Event",
                type: "decimal(9,6)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VenueLongitude",
                schema: "dbo",
                table: "Event",
                type: "decimal(9,6)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EventAgendaItem",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time", nullable: true),
                    EndTime = table.Column<TimeOnly>(type: "time", nullable: true),
                    Speaker = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Location = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventAgendaItem", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventAgendaItem_Event_EventId",
                        column: x => x.EventId,
                        principalSchema: "dbo",
                        principalTable: "Event",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EventCommunication",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Channel = table.Column<int>(type: "int", nullable: false),
                    RecipientFilter = table.Column<int>(type: "int", nullable: false),
                    Subject = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Body = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ScheduledForUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    SentAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    SentByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TargetedCount = table.Column<int>(type: "int", nullable: false),
                    SentCount = table.Column<int>(type: "int", nullable: false),
                    FailedCount = table.Column<int>(type: "int", nullable: false),
                    LastError = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventCommunication", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventCommunication_Event_EventId",
                        column: x => x.EventId,
                        principalSchema: "dbo",
                        principalTable: "Event",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EventRegistration",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RegistrationCode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AttendeeName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AttendeeEmail = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    AttendeePhone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    AttendeeItsNumber = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    RegisteredAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ConfirmedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ConfirmedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CancelledAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancellationReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CheckedInAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CheckedInByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SpecialRequests = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    DietaryNotes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventRegistration", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventRegistration_Event_EventId",
                        column: x => x.EventId,
                        principalSchema: "dbo",
                        principalTable: "Event",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EventRegistration_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "EventGuest",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventRegistrationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AgeBand = table.Column<int>(type: "int", nullable: false),
                    Relationship = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Phone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    Email = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CheckedIn = table.Column<bool>(type: "bit", nullable: false),
                    CheckedInAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventGuest", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventGuest_EventRegistration_EventRegistrationId",
                        column: x => x.EventRegistrationId,
                        principalSchema: "dbo",
                        principalTable: "EventRegistration",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Backfill Slug for existing rows so the unique index doesn't fail.
            // Default slug: lowercase name with non-alphanumerics → '-', trimmed; suffix with short id to guarantee uniqueness.
            migrationBuilder.Sql(@"
                UPDATE [dbo].[Event]
                SET [Slug] = LOWER(
                    LEFT(
                        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                            REPLACE([Name], ' ', '-'),
                            ',', ''), '.', ''), '/', ''), '\', ''), '''', ''), '""', ''), '(', ''), ')', ''),
                    80)) + '-' + LEFT(REPLACE(CAST([Id] AS NVARCHAR(40)), '-', ''), 8)
                WHERE [Slug] IS NULL OR [Slug] = '';
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Event_TenantId_Slug",
                schema: "dbo",
                table: "Event",
                columns: new[] { "TenantId", "Slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EventAgendaItem_EventId_SortOrder",
                schema: "dbo",
                table: "EventAgendaItem",
                columns: new[] { "EventId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EventCommunication_EventId",
                schema: "dbo",
                table: "EventCommunication",
                column: "EventId");

            migrationBuilder.CreateIndex(
                name: "IX_EventCommunication_TenantId_EventId_Status",
                schema: "dbo",
                table: "EventCommunication",
                columns: new[] { "TenantId", "EventId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_EventGuest_EventRegistrationId",
                schema: "dbo",
                table: "EventGuest",
                column: "EventRegistrationId");

            migrationBuilder.CreateIndex(
                name: "IX_EventRegistration_EventId",
                schema: "dbo",
                table: "EventRegistration",
                column: "EventId");

            migrationBuilder.CreateIndex(
                name: "IX_EventRegistration_MemberId",
                schema: "dbo",
                table: "EventRegistration",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_EventRegistration_TenantId_EventId_AttendeeEmail",
                schema: "dbo",
                table: "EventRegistration",
                columns: new[] { "TenantId", "EventId", "AttendeeEmail" },
                filter: "[AttendeeEmail] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EventRegistration_TenantId_EventId_MemberId",
                schema: "dbo",
                table: "EventRegistration",
                columns: new[] { "TenantId", "EventId", "MemberId" },
                filter: "[MemberId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EventRegistration_TenantId_EventId_Status",
                schema: "dbo",
                table: "EventRegistration",
                columns: new[] { "TenantId", "EventId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_EventRegistration_TenantId_RegistrationCode",
                schema: "dbo",
                table: "EventRegistration",
                columns: new[] { "TenantId", "RegistrationCode" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EventAgendaItem",
                schema: "dbo");

            migrationBuilder.DropTable(
                name: "EventCommunication",
                schema: "dbo");

            migrationBuilder.DropTable(
                name: "EventGuest",
                schema: "dbo");

            migrationBuilder.DropTable(
                name: "EventRegistration",
                schema: "dbo");

            migrationBuilder.DropIndex(
                name: "IX_Event_TenantId_Slug",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "AccentColor",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "AllowGuests",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "Capacity",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "ContactEmail",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "ContactPhone",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "CoverImageUrl",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "Description",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "EndsAtUtc",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "LogoUrl",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "MaxGuestsPerRegistration",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "OpenToNonMembers",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "PrimaryColor",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "RegistrationClosesAtUtc",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "RegistrationOpensAtUtc",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "RegistrationsEnabled",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "RequiresApproval",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "Slug",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "StartsAtUtc",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "Tagline",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "VenueAddress",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "VenueLatitude",
                schema: "dbo",
                table: "Event");

            migrationBuilder.DropColumn(
                name: "VenueLongitude",
                schema: "dbo",
                table: "Event");
        }
    }
}
