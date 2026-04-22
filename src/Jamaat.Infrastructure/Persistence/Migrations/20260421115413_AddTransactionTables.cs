using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jamaat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTransactionTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "txn");

            migrationBuilder.CreateTable(
                name: "ExpenseType",
                schema: "cfg",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    DebitAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RequiresApproval = table.Column<bool>(type: "bit", nullable: false),
                    ApprovalThreshold = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpenseType", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExpenseType_Account_DebitAccountId",
                        column: x => x.DebitAccountId,
                        principalSchema: "acc",
                        principalTable: "Account",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FinancialPeriod",
                schema: "acc",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ClosedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ClosedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ClosedByUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinancialPeriod", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ReprintLog",
                schema: "audit",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SourceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceReference = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    AtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReprintLog", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LedgerEntry",
                schema: "acc",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PostingDate = table.Column<DateOnly>(type: "date", nullable: false),
                    FinancialPeriodId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceType = table.Column<int>(type: "int", nullable: false),
                    SourceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceReference = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    LineNo = table.Column<int>(type: "int", nullable: false),
                    AccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FundTypeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Debit = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Credit = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Narration = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ReversalOfEntryId = table.Column<long>(type: "bigint", nullable: true),
                    PostedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PostedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LedgerEntry", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LedgerEntry_Account_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "acc",
                        principalTable: "Account",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LedgerEntry_FinancialPeriod_FinancialPeriodId",
                        column: x => x.FinancialPeriodId,
                        principalSchema: "acc",
                        principalTable: "FinancialPeriod",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LedgerEntry_FundType_FundTypeId",
                        column: x => x.FundTypeId,
                        principalSchema: "cfg",
                        principalTable: "FundType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Receipt",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReceiptNumber = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ReceiptDate = table.Column<DateOnly>(type: "date", nullable: false),
                    MemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ItsNumberSnapshot = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    MemberNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    AmountTotal = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    PaymentMode = table.Column<int>(type: "int", nullable: false),
                    ChequeNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ChequeDate = table.Column<DateOnly>(type: "date", nullable: true),
                    BankAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PaymentReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ConfirmedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ConfirmedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ConfirmedByUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CancelledAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CancellationReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ReversedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReversalReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    FinancialPeriodId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    NumberingSeriesId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Receipt", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Receipt_BankAccount_BankAccountId",
                        column: x => x.BankAccountId,
                        principalSchema: "cfg",
                        principalTable: "BankAccount",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Receipt_FinancialPeriod_FinancialPeriodId",
                        column: x => x.FinancialPeriodId,
                        principalSchema: "acc",
                        principalTable: "FinancialPeriod",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Receipt_Member_MemberId",
                        column: x => x.MemberId,
                        principalSchema: "dbo",
                        principalTable: "Member",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Receipt_NumberingSeries_NumberingSeriesId",
                        column: x => x.NumberingSeriesId,
                        principalSchema: "cfg",
                        principalTable: "NumberingSeries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Voucher",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VoucherNumber = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    VoucherDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PayTo = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PayeeItsNumber = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    Purpose = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    AmountTotal = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    PaymentMode = table.Column<int>(type: "int", nullable: false),
                    ChequeNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ChequeDate = table.Column<DateOnly>(type: "date", nullable: true),
                    DrawnOnBank = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    BankAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PaymentDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedByUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ApprovedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    PaidByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PaidByUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    PaidAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancellationReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ReversedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReversalReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    FinancialPeriodId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    NumberingSeriesId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Voucher", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Voucher_BankAccount_BankAccountId",
                        column: x => x.BankAccountId,
                        principalSchema: "cfg",
                        principalTable: "BankAccount",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Voucher_FinancialPeriod_FinancialPeriodId",
                        column: x => x.FinancialPeriodId,
                        principalSchema: "acc",
                        principalTable: "FinancialPeriod",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Voucher_NumberingSeries_NumberingSeriesId",
                        column: x => x.NumberingSeriesId,
                        principalSchema: "cfg",
                        principalTable: "NumberingSeries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ReceiptLine",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNo = table.Column<int>(type: "int", nullable: false),
                    FundTypeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Purpose = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    PeriodReference = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReceiptLine", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReceiptLine_FundType_FundTypeId",
                        column: x => x.FundTypeId,
                        principalSchema: "cfg",
                        principalTable: "FundType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReceiptLine_Receipt_ReceiptId",
                        column: x => x.ReceiptId,
                        principalSchema: "txn",
                        principalTable: "Receipt",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VoucherLine",
                schema: "txn",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VoucherId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNo = table.Column<int>(type: "int", nullable: false),
                    ExpenseTypeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Narration = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VoucherLine", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VoucherLine_ExpenseType_ExpenseTypeId",
                        column: x => x.ExpenseTypeId,
                        principalSchema: "cfg",
                        principalTable: "ExpenseType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VoucherLine_Voucher_VoucherId",
                        column: x => x.VoucherId,
                        principalSchema: "txn",
                        principalTable: "Voucher",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ExpenseType_DebitAccountId",
                schema: "cfg",
                table: "ExpenseType",
                column: "DebitAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_ExpenseType_TenantId_Code",
                schema: "cfg",
                table: "ExpenseType",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FinancialPeriod_TenantId_Name",
                schema: "acc",
                table: "FinancialPeriod",
                columns: new[] { "TenantId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FinancialPeriod_TenantId_StartDate_EndDate",
                schema: "acc",
                table: "FinancialPeriod",
                columns: new[] { "TenantId", "StartDate", "EndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_LedgerEntry_AccountId",
                schema: "acc",
                table: "LedgerEntry",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_LedgerEntry_FinancialPeriodId",
                schema: "acc",
                table: "LedgerEntry",
                column: "FinancialPeriodId");

            migrationBuilder.CreateIndex(
                name: "IX_LedgerEntry_FundTypeId",
                schema: "acc",
                table: "LedgerEntry",
                column: "FundTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_LedgerEntry_SourceType_SourceId",
                schema: "acc",
                table: "LedgerEntry",
                columns: new[] { "SourceType", "SourceId" });

            migrationBuilder.CreateIndex(
                name: "IX_LedgerEntry_TenantId_AccountId_PostingDate",
                schema: "acc",
                table: "LedgerEntry",
                columns: new[] { "TenantId", "AccountId", "PostingDate" });

            migrationBuilder.CreateIndex(
                name: "IX_LedgerEntry_TenantId_FundTypeId_PostingDate",
                schema: "acc",
                table: "LedgerEntry",
                columns: new[] { "TenantId", "FundTypeId", "PostingDate" });

            migrationBuilder.CreateIndex(
                name: "IX_LedgerEntry_TenantId_PostingDate",
                schema: "acc",
                table: "LedgerEntry",
                columns: new[] { "TenantId", "PostingDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_BankAccountId",
                schema: "txn",
                table: "Receipt",
                column: "BankAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_FinancialPeriodId",
                schema: "txn",
                table: "Receipt",
                column: "FinancialPeriodId");

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_MemberId",
                schema: "txn",
                table: "Receipt",
                column: "MemberId");

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_NumberingSeriesId",
                schema: "txn",
                table: "Receipt",
                column: "NumberingSeriesId");

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_TenantId_MemberId_ReceiptDate",
                schema: "txn",
                table: "Receipt",
                columns: new[] { "TenantId", "MemberId", "ReceiptDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_TenantId_ReceiptDate",
                schema: "txn",
                table: "Receipt",
                columns: new[] { "TenantId", "ReceiptDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_TenantId_ReceiptNumber",
                schema: "txn",
                table: "Receipt",
                columns: new[] { "TenantId", "ReceiptNumber" },
                unique: true,
                filter: "[ReceiptNumber] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Receipt_TenantId_Status",
                schema: "txn",
                table: "Receipt",
                columns: new[] { "TenantId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptLine_FundTypeId",
                schema: "txn",
                table: "ReceiptLine",
                column: "FundTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptLine_ReceiptId_LineNo",
                schema: "txn",
                table: "ReceiptLine",
                columns: new[] { "ReceiptId", "LineNo" });

            migrationBuilder.CreateIndex(
                name: "IX_ReprintLog_SourceType_SourceId",
                schema: "audit",
                table: "ReprintLog",
                columns: new[] { "SourceType", "SourceId" });

            migrationBuilder.CreateIndex(
                name: "IX_ReprintLog_TenantId_AtUtc",
                schema: "audit",
                table: "ReprintLog",
                columns: new[] { "TenantId", "AtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Voucher_BankAccountId",
                schema: "txn",
                table: "Voucher",
                column: "BankAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Voucher_FinancialPeriodId",
                schema: "txn",
                table: "Voucher",
                column: "FinancialPeriodId");

            migrationBuilder.CreateIndex(
                name: "IX_Voucher_NumberingSeriesId",
                schema: "txn",
                table: "Voucher",
                column: "NumberingSeriesId");

            migrationBuilder.CreateIndex(
                name: "IX_Voucher_TenantId_Status",
                schema: "txn",
                table: "Voucher",
                columns: new[] { "TenantId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Voucher_TenantId_VoucherDate",
                schema: "txn",
                table: "Voucher",
                columns: new[] { "TenantId", "VoucherDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Voucher_TenantId_VoucherNumber",
                schema: "txn",
                table: "Voucher",
                columns: new[] { "TenantId", "VoucherNumber" },
                unique: true,
                filter: "[VoucherNumber] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_VoucherLine_ExpenseTypeId",
                schema: "txn",
                table: "VoucherLine",
                column: "ExpenseTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_VoucherLine_VoucherId_LineNo",
                schema: "txn",
                table: "VoucherLine",
                columns: new[] { "VoucherId", "LineNo" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LedgerEntry",
                schema: "acc");

            migrationBuilder.DropTable(
                name: "ReceiptLine",
                schema: "txn");

            migrationBuilder.DropTable(
                name: "ReprintLog",
                schema: "audit");

            migrationBuilder.DropTable(
                name: "VoucherLine",
                schema: "txn");

            migrationBuilder.DropTable(
                name: "Receipt",
                schema: "txn");

            migrationBuilder.DropTable(
                name: "ExpenseType",
                schema: "cfg");

            migrationBuilder.DropTable(
                name: "Voucher",
                schema: "txn");

            migrationBuilder.DropTable(
                name: "FinancialPeriod",
                schema: "acc");
        }
    }
}
