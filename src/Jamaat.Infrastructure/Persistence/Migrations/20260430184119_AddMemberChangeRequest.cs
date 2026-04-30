using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberChangeRequest : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MemberChangeRequest",
                schema: "audit",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Section = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    PayloadJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    RequestedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestedByUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RequestedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReviewedByUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ReviewedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReviewerNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MemberChangeRequest", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MemberChangeRequest_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MemberChangeRequest_MemberId",
                schema: "audit",
                table: "MemberChangeRequest",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_MemberChangeRequest_TenantId_MemberId_Status",
                schema: "audit",
                table: "MemberChangeRequest",
                columns: new[] { "TenantId", "MemberId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_MemberChangeRequest_TenantId_Status_RequestedAtUtc",
                schema: "audit",
                table: "MemberChangeRequest",
                columns: new[] { "TenantId", "Status", "RequestedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MemberChangeRequest",
                schema: "audit");
        }
    }
}
