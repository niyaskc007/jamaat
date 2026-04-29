namespace Jamaat.Domain.Enums;

/// How a commitment's agreement was accepted. Today every acceptance is `Admin` because
/// Phase-1 is web-only and only staff have logins; once a self-service member portal lands
/// the value will diverge and we can audit who actually clicked Accept.
public enum AgreementAcceptanceMethod
{
    Admin = 1,
    Self = 2,
}
