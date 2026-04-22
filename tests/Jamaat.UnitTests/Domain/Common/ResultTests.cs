using FluentAssertions;
using Jamaat.Domain.Common;

namespace Jamaat.UnitTests.Domain.Common;

public class ResultTests
{
    [Fact]
    public void Success_CarriesValue()
    {
        var r = Result.Success(42);
        r.IsSuccess.Should().BeTrue();
        r.Value.Should().Be(42);
    }

    [Fact]
    public void Failure_ExposesError()
    {
        var err = Error.Validation("its.invalid", "Bad ITS");
        var r = Result.Failure<int>(err);
        r.IsFailure.Should().BeTrue();
        r.Error.Should().Be(err);
    }

    [Fact]
    public void AccessingValueOnFailure_Throws()
    {
        var r = Result.Failure<int>(Error.NotFound("x", "y"));
        var act = () => _ = r.Value;
        act.Should().Throw<InvalidOperationException>();
    }
}
