using System.Linq.Expressions;

namespace Jamaat.Application.Common;

public static class QueryableExtensions
{
    public static IQueryable<T> OrderByProperty<T>(this IQueryable<T> source, string? propertyName, SortDirection direction)
    {
        if (string.IsNullOrWhiteSpace(propertyName)) return source;
        var param = Expression.Parameter(typeof(T), "x");
        var member = typeof(T).GetProperty(propertyName, System.Reflection.BindingFlags.IgnoreCase
            | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
        if (member is null) return source;
        var access = Expression.MakeMemberAccess(param, member);
        var lambda = Expression.Lambda(access, param);
        var methodName = direction == SortDirection.Desc ? "OrderByDescending" : "OrderBy";
        var result = typeof(Queryable).GetMethods()
            .First(m => m.Name == methodName && m.GetParameters().Length == 2)
            .MakeGenericMethod(typeof(T), member.PropertyType)
            .Invoke(null, [source, lambda]);
        return (IQueryable<T>)result!;
    }
}
