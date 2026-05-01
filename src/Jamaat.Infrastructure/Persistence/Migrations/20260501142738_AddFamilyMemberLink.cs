using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFamilyMemberLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FamilyMemberLink",
                schema: "dbo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FamilyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Role = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FamilyMemberLink", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FamilyMemberLink_Family_FamilyId",
                        column: x => x.FamilyId,
                        principalSchema: "dbo",
                        principalTable: "Family",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FamilyMemberLink_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FamilyMemberLink_FamilyId",
                schema: "dbo",
                table: "FamilyMemberLink",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_FamilyMemberLink_MemberId",
                schema: "dbo",
                table: "FamilyMemberLink",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_FamilyMemberLink_TenantId_FamilyId",
                schema: "dbo",
                table: "FamilyMemberLink",
                columns: new[] { "TenantId", "FamilyId" });

            migrationBuilder.CreateIndex(
                name: "IX_FamilyMemberLink_TenantId_FamilyId_MemberId",
                schema: "dbo",
                table: "FamilyMemberLink",
                columns: new[] { "TenantId", "FamilyId", "MemberId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FamilyMemberLink_TenantId_MemberId",
                schema: "dbo",
                table: "FamilyMemberLink",
                columns: new[] { "TenantId", "MemberId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FamilyMemberLink",
                schema: "dbo");
        }
    }
}
