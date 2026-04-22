using FluentValidation;
using Jamaat.Contracts.Members;

namespace Jamaat.Application.Members;

public sealed class CreateMemberValidator : AbstractValidator<CreateMemberDto>
{
    public CreateMemberValidator()
    {
        RuleFor(x => x.ItsNumber)
            .NotEmpty().WithMessage("ITS number is required.")
            .Matches(@"^\d{8}$").WithMessage("ITS number must be exactly 8 digits.");
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.FullNameArabic).MaximumLength(200);
        RuleFor(x => x.FullNameHindi).MaximumLength(200);
        RuleFor(x => x.FullNameUrdu).MaximumLength(200);
        RuleFor(x => x.Phone).MaximumLength(32);
        RuleFor(x => x.Email).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).MaximumLength(200);
        RuleFor(x => x.Address).MaximumLength(500);
    }
}

public sealed class UpdateMemberValidator : AbstractValidator<UpdateMemberDto>
{
    public UpdateMemberValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.FullNameArabic).MaximumLength(200);
        RuleFor(x => x.FullNameHindi).MaximumLength(200);
        RuleFor(x => x.FullNameUrdu).MaximumLength(200);
        RuleFor(x => x.Phone).MaximumLength(32);
        RuleFor(x => x.Email).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).MaximumLength(200);
        RuleFor(x => x.Address).MaximumLength(500);
        RuleFor(x => x.Status).IsInEnum();
    }
}
