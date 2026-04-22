namespace Jamaat.Application.Common;

public abstract record PagedQuery
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 25;
    public string? SortBy { get; init; }
    public SortDirection SortDir { get; init; } = SortDirection.Asc;
    public string? Search { get; init; }

    public int Skip => Math.Max(0, (Page - 1) * PageSize);
    public int Take => PageSize is > 0 and <= 500 ? PageSize : 25;
}

public enum SortDirection { Asc, Desc }

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize)
{
    public static PagedResult<T> Empty(int page, int pageSize) => new([], 0, page, pageSize);
}
