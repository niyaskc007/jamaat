using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptAgreementDocument : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // URL pointer to the uploaded agreement file (PDF or image). Returnable contributors
            // can attach the signed agreement so the audit trail carries proof of the terms,
            // not just the free-text AgreementReference.
            migrationBuilder.AddColumn<string>(
                name: "AgreementDocumentUrl",
                schema: "txn",
                table: "Receipt",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AgreementDocumentUrl",
                schema: "txn",
                table: "Receipt");
        }
    }
}
