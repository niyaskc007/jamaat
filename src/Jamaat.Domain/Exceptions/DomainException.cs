namespace Jamaat.Domain.Exceptions;

public abstract class DomainException : Exception
{
    public string Code { get; }

    protected DomainException(string code, string message) : base(message) => Code = code;
}

public sealed class BusinessRuleException : DomainException
{
    public BusinessRuleException(string code, string message) : base(code, message) { }
}

public sealed class DomainNotFoundException : DomainException
{
    public DomainNotFoundException(string code, string message) : base(code, message) { }
}
