namespace Jamaat.Domain.Enums;

/// <summary>
/// Data type for an admin-defined custom field on a fund type. Drives the input control
/// rendered on the receipt form and how the value is parsed/stored.
/// </summary>
public enum CustomFieldType
{
    Text = 1,
    LongText = 2,
    Number = 3,
    Date = 4,
    Boolean = 5,
    /// <summary>Free-form choice from the comma-separated <c>OptionsCsv</c> on the field definition.</summary>
    Dropdown = 6,
}
