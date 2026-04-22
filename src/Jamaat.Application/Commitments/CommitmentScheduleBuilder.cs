using Jamaat.Contracts.Commitments;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;

namespace Jamaat.Application.Commitments;

/// <summary>
/// Builds an installment schedule from (total, installments, frequency, start) —
/// last installment absorbs rounding so the sum matches the total exactly.
/// </summary>
public static class CommitmentScheduleBuilder
{
    public static IReadOnlyList<CommitmentScheduleLineDto> Preview(
        decimal totalAmount, int numberOfInstallments, CommitmentFrequency frequency, DateOnly startDate)
    {
        if (numberOfInstallments <= 0) return [];
        if (totalAmount <= 0) return [];

        var baseAmount = Math.Round(totalAmount / numberOfInstallments, 2, MidpointRounding.AwayFromZero);
        var running = 0m;
        var lines = new List<CommitmentScheduleLineDto>(numberOfInstallments);
        for (int i = 0; i < numberOfInstallments; i++)
        {
            var due = NextDue(startDate, frequency, i);
            var amount = (i == numberOfInstallments - 1) ? totalAmount - running : baseAmount;
            running += amount;
            lines.Add(new CommitmentScheduleLineDto(i + 1, due, amount));
        }
        return lines;
    }

    public static IReadOnlyList<CommitmentInstallment> BuildFromSchedule(IEnumerable<CommitmentScheduleLineDto> lines)
        => lines.Select(l => new CommitmentInstallment(Guid.NewGuid(), l.InstallmentNo, l.DueDate, l.ScheduledAmount))
                .ToList();

    public static IReadOnlyList<CommitmentInstallment> BuildFromOverrides(IEnumerable<CreateInstallmentOverrideDto> overrides)
        => overrides.OrderBy(o => o.InstallmentNo)
                    .Select(o => new CommitmentInstallment(Guid.NewGuid(), o.InstallmentNo, o.DueDate, o.ScheduledAmount))
                    .ToList();

    private static DateOnly NextDue(DateOnly start, CommitmentFrequency freq, int index) => freq switch
    {
        CommitmentFrequency.OneTime    => start,
        CommitmentFrequency.Weekly     => start.AddDays(7 * index),
        CommitmentFrequency.BiWeekly   => start.AddDays(14 * index),
        CommitmentFrequency.Monthly    => start.AddMonths(index),
        CommitmentFrequency.Quarterly  => start.AddMonths(3 * index),
        CommitmentFrequency.HalfYearly => start.AddMonths(6 * index),
        CommitmentFrequency.Yearly     => start.AddYears(index),
        CommitmentFrequency.Custom     => start.AddMonths(index),
        _                              => start.AddMonths(index),
    };
}
