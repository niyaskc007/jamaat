namespace Jamaat.Domain.Enums;

[Flags]
public enum PaymentMode
{
    None = 0,
    Cash = 1 << 0,
    Cheque = 1 << 1,
    BankTransfer = 1 << 2,
    Card = 1 << 3,
    Online = 1 << 4,
    Upi = 1 << 5
}
