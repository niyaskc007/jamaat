using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCommitmentAgreementAcceptanceProof : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AgreementAcceptanceMethod",
                schema: "txn",
                table: "Commitment",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AgreementAcceptedIpAddress",
                schema: "txn",
                table: "Commitment",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AgreementAcceptedUserAgent",
                schema: "txn",
                table: "Commitment",
                type: "nvarchar(1024)",
                maxLength: 1024,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AgreementAcceptanceMethod",
                schema: "txn",
                table: "Commitment");

            migrationBuilder.DropColumn(
                name: "AgreementAcceptedIpAddress",
                schema: "txn",
                table: "Commitment");

            migrationBuilder.DropColumn(
                name: "AgreementAcceptedUserAgent",
                schema: "txn",
                table: "Commitment");
        }
    }
}
