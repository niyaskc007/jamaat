using System.Text.Json;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Infrastructure.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Jamaat.Infrastructure.Persistence.Interceptors;

/// Captures before/after snapshots for all mutations and writes to audit.AuditLog.
/// Also fills in CreatedAt/UpdatedAt audit columns automatically.
public sealed class AuditInterceptor : SaveChangesInterceptor
{
    private readonly ICurrentUser _currentUser;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;
    private readonly ICorrelationContext _correlation;

    public AuditInterceptor(
        ICurrentUser currentUser,
        ITenantContext tenant,
        IClock clock,
        ICorrelationContext correlation)
    {
        _currentUser = currentUser;
        _tenant = tenant;
        _clock = clock;
        _correlation = correlation;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is null) return base.SavingChangesAsync(eventData, result, cancellationToken);
        WriteAudit(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void WriteAudit(DbContext context)
    {
        var now = _clock.UtcNow;
        var userId = _currentUser.UserId;
        var userName = _currentUser.UserName ?? "system";
        var correlationId = _correlation.CorrelationId;
        var entries = context.ChangeTracker.Entries().ToList();

        var auditEntries = new List<AuditLog>();

        foreach (var entry in entries)
        {
            if (entry.Entity is AuditLog) continue; // never audit the audit table
            if (entry.State is EntityState.Unchanged or EntityState.Detached) continue;

            SetAuditColumns(entry, now, userId);

            var action = entry.State switch
            {
                EntityState.Added => "Create",
                EntityState.Modified => "Update",
                EntityState.Deleted => "Delete",
                _ => "Unknown"
            };

            var tenantId = entry.Entity is ITenantScoped ts ? ts.TenantId : _tenant.IsResolved ? _tenant.TenantId : (Guid?)null;

            auditEntries.Add(new AuditLog(
                tenantId: tenantId,
                userId: userId,
                userName: userName,
                correlationId: correlationId,
                action: action,
                entityName: entry.Entity.GetType().Name,
                entityId: ExtractKey(entry),
                screen: null,
                beforeJson: action == "Create" ? null : SerializeOriginal(entry),
                afterJson: action == "Delete" ? null : SerializeCurrent(entry),
                ipAddress: _correlation.IpAddress,
                userAgent: _correlation.UserAgent,
                atUtc: now));
        }

        if (auditEntries.Count > 0)
            context.Set<AuditLog>().AddRange(auditEntries);
    }

    private static void SetAuditColumns(EntityEntry entry, DateTimeOffset now, Guid? userId)
    {
        if (entry.Entity is not IAuditable) return;
        if (entry.State == EntityState.Added)
        {
            entry.Property("CreatedAtUtc").CurrentValue = now;
            entry.Property("CreatedByUserId").CurrentValue = userId;
        }
        if (entry.State is EntityState.Modified or EntityState.Added)
        {
            entry.Property("UpdatedAtUtc").CurrentValue = now;
            entry.Property("UpdatedByUserId").CurrentValue = userId;
        }
    }

    private static string ExtractKey(EntityEntry entry)
    {
        var keyProps = entry.Metadata.FindPrimaryKey()?.Properties;
        if (keyProps is null || keyProps.Count == 0) return string.Empty;
        var keyProp = keyProps[0];
        var val = entry.Property(keyProp.Name).CurrentValue;
        return val?.ToString() ?? string.Empty;
    }

    private static string SerializeCurrent(EntityEntry entry)
    {
        var dict = entry.Properties
            .Where(p => !p.Metadata.IsShadowProperty())
            .ToDictionary(p => p.Metadata.Name, p => p.CurrentValue);
        return JsonSerializer.Serialize(dict, SerializerOptions);
    }

    private static string SerializeOriginal(EntityEntry entry)
    {
        var dict = entry.Properties
            .Where(p => !p.Metadata.IsShadowProperty())
            .ToDictionary(p => p.Metadata.Name, p => p.OriginalValue);
        return JsonSerializer.Serialize(dict, SerializerOptions);
    }

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false
    };
}
