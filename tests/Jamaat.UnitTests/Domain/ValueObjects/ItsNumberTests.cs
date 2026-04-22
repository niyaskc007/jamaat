using FluentAssertions;
using Jamaat.Domain.ValueObjects;

namespace Jamaat.UnitTests.Domain.ValueObjects;

public class ItsNumberTests
{
    [Theory]
    [InlineData("12345678")]
    [InlineData("00000001")]
    [InlineData("99999999")]
    public void TryCreate_ValidEightDigits_Succeeds(string input)
    {
        var ok = ItsNumber.TryCreate(input, out var its);
        ok.Should().BeTrue();
        its.Value.Should().Be(input);
    }

    [Theory]
    [InlineData("1234567")]      // too short
    [InlineData("123456789")]    // too long
    [InlineData("abcdefgh")]     // non-numeric
    [InlineData("1234-5678")]    // punctuation
    [InlineData("")]
    [InlineData(null)]
    public void TryCreate_Invalid_Fails(string? input)
    {
        var ok = ItsNumber.TryCreate(input, out _);
        ok.Should().BeFalse();
    }

    [Fact]
    public void Create_Invalid_Throws()
    {
        var act = () => ItsNumber.Create("bad");
        act.Should().Throw<ArgumentException>();
    }
}
