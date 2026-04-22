namespace Jamaat.Domain.Enums;

public enum ErrorSource
{
    Api = 1,
    Web = 2,
    Mobile = 3,
    Job = 4,
    Integration = 5,
}

public enum ErrorSeverity
{
    Info = 1,
    Warning = 2,
    Error = 3,
    Fatal = 4,
}

public enum ErrorStatus
{
    Reported = 1,
    Reviewed = 2,
    Resolved = 3,
    Ignored = 4,
}
