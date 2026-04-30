using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberEducation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MemberEducation",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Level = table.Column<int>(type: "int", nullable: false),
                    Degree = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Institution = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    YearCompleted = table.Column<int>(type: "int", nullable: true),
                    Specialization = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    IsHighest = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MemberEducation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MemberEducation_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MemberEducation_MemberId",
                table: "MemberEducation",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_MemberEducation_TenantId_MemberId",
                table: "MemberEducation",
                columns: new[] { "TenantId", "MemberId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MemberEducation");
        }
    }
}
