using System.Globalization;

namespace Jamaat.Infrastructure.Pdf;

internal static class PdfFormatting
{
    public static string Money(decimal amount, string currency)
    {
        var loc = currency switch
        {
            "AED" => "en-AE",
            "SAR" => "ar-SA",
            "QAR" => "ar-QA",
            "OMR" => "ar-OM",
            "KWD" => "ar-KW",
            "BHD" => "ar-BH",
            "INR" => "en-IN",
            "PKR" => "en-PK",
            "USD" => "en-US",
            "EUR" => "en-IE",
            "GBP" => "en-GB",
            _ => "en-US",
        };
        var decimals = currency is "KWD" or "BHD" or "OMR" ? 3 : 2;
        try
        {
            return amount.ToString("C", new CultureInfo(loc) { NumberFormat = { CurrencyDecimalDigits = decimals } });
        }
        catch
        {
            return $"{currency} {amount.ToString($"N{decimals}", CultureInfo.InvariantCulture)}";
        }
    }
}
