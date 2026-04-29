using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptMaturityState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Stored maturity-state snapshot for returnable receipts. Computed by
            // Receipt.RefreshMaturityState() at write time so reports can filter without
            // recomputing from intention/maturity-date/amount-returned per row.
            // 0 = NotApplicable (default for permanent receipts).
            migrationBuilder.AddColumn<int>(
                name: "MaturityState",
                schema: "txn",
                table: "Receipt",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_TenantId_MaturityState",
                schema: "txn",
                table: "Receipt",
                columns: new[] { "TenantId", "MaturityState" });

            // Backfill: every existing returnable receipt gets a state computed from its
            // current intention/maturity-date/amount-returned. Matches Receipt.RefreshMaturityState
            // semantics so the column reads consistently from day one.
            //   0 NotApplicable - permanent (default, unchanged for non-Returnable rows)
            //   1 NotMatured    - returnable, no returns, today < maturity date
            //   2 Matured       - returnable, no returns, today >= maturity date (or no date)
            //   3 PartiallyReturned - some returns processed but balance > 0
            //   4 FullyReturned - amountReturned >= amountTotal
            migrationBuilder.Sql(@"
UPDATE [txn].[Receipt]
SET MaturityState = CASE
    WHEN Intention <> 2 THEN 0
    WHEN AmountReturned >= AmountTotal THEN 4
    WHEN AmountReturned > 0 THEN 3
    WHEN MaturityDate IS NULL OR CAST(GETUTCDATE() AS date) >= MaturityDate THEN 2
    ELSE 1
END
WHERE Intention = 2;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Receipt_TenantId_MaturityState",
                schema: "txn",
                table: "Receipt");

            migrationBuilder.DropColumn(
                name: "MaturityState",
                schema: "txn",
                table: "Receipt");
        }
    }
}
