using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberSocialHajjSpouseRename : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "HusbandPrefix",
                schema: "dbo",
                table: "Member",
                newName: "SpousePrefix");

            migrationBuilder.RenameColumn(
                name: "HusbandName",
                schema: "dbo",
                table: "Member",
                newName: "SpouseName");

            migrationBuilder.AddColumn<string>(
                name: "FacebookUrl",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HajjStatus",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "HajjYear",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InstagramUrl",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LinkedInUrl",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TwitterUrl",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "UmrahCount",
                schema: "dbo",
                table: "Member",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "WebsiteUrl",
                schema: "dbo",
                table: "Member",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FacebookUrl",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "HajjStatus",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "HajjYear",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "InstagramUrl",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "LinkedInUrl",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "TwitterUrl",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "UmrahCount",
                schema: "dbo",
                table: "Member");

            migrationBuilder.DropColumn(
                name: "WebsiteUrl",
                schema: "dbo",
                table: "Member");

            migrationBuilder.RenameColumn(
                name: "SpousePrefix",
                schema: "dbo",
                table: "Member",
                newName: "HusbandPrefix");

            migrationBuilder.RenameColumn(
                name: "SpouseName",
                schema: "dbo",
                table: "Member",
                newName: "HusbandName");
        }
    }
}
