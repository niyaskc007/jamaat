using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class EventConfiguration : IEntityTypeConfiguration<Event>
{
    public void Configure(EntityTypeBuilder<Event> b)
    {
        b.ToTable("Event", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Slug).HasMaxLength(100).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.NameArabic).HasMaxLength(200);
        b.Property(x => x.Tagline).HasMaxLength(300);
        b.Property(x => x.Description).HasColumnType("nvarchar(max)");
        b.Property(x => x.Category).HasConversion<int>();
        b.Property(x => x.EventDateHijri).HasMaxLength(64);
        b.Property(x => x.Place).HasMaxLength(200);
        b.Property(x => x.VenueAddress).HasMaxLength(500);
        b.Property(x => x.VenueLatitude).HasColumnType("decimal(9,6)");
        b.Property(x => x.VenueLongitude).HasColumnType("decimal(9,6)");
        b.Property(x => x.CoverImageUrl).HasMaxLength(500);
        b.Property(x => x.LogoUrl).HasMaxLength(500);
        b.Property(x => x.PrimaryColor).HasMaxLength(9);
        b.Property(x => x.AccentColor).HasMaxLength(9);
        b.Property(x => x.ShareTitle).HasMaxLength(200);
        b.Property(x => x.ShareDescription).HasMaxLength(500);
        b.Property(x => x.ShareImageUrl).HasMaxLength(500);
        b.Property(x => x.ContactPhone).HasMaxLength(32);
        b.Property(x => x.ContactEmail).HasMaxLength(200);
        b.Property(x => x.Notes).HasMaxLength(1000);

        b.HasIndex(x => new { x.TenantId, x.Slug }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.EventDate });
        b.HasIndex(x => new { x.TenantId, x.Category });

        b.OwnsMany(x => x.Agenda, a =>
        {
            a.ToTable("EventAgendaItem", "dbo");
            a.WithOwner().HasForeignKey(x => x.EventId);
            a.HasKey(x => x.Id);
            a.Property(x => x.Title).HasMaxLength(200).IsRequired();
            a.Property(x => x.Speaker).HasMaxLength(200);
            a.Property(x => x.Location).HasMaxLength(200);
            a.Property(x => x.Description).HasMaxLength(1000);
            a.HasIndex(x => new { x.EventId, x.SortOrder });
        });
    }
}

public sealed class EventScanConfiguration : IEntityTypeConfiguration<EventScan>
{
    public void Configure(EntityTypeBuilder<EventScan> b)
    {
        b.ToTable("EventScan", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Location).HasMaxLength(200);

        b.HasIndex(x => new { x.TenantId, x.EventId, x.MemberId }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.MemberId });

        b.HasOne<Event>().WithMany().HasForeignKey(x => x.EventId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class EventRegistrationConfiguration : IEntityTypeConfiguration<EventRegistration>
{
    public void Configure(EntityTypeBuilder<EventRegistration> b)
    {
        b.ToTable("EventRegistration", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.RegistrationCode).HasMaxLength(32).IsRequired();
        b.Property(x => x.AttendeeName).HasMaxLength(200).IsRequired();
        b.Property(x => x.AttendeeEmail).HasMaxLength(200);
        b.Property(x => x.AttendeePhone).HasMaxLength(32);
        b.Property(x => x.AttendeeItsNumber).HasMaxLength(8);
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.CancellationReason).HasMaxLength(500);
        b.Property(x => x.SpecialRequests).HasMaxLength(1000);
        b.Property(x => x.DietaryNotes).HasMaxLength(500);

        b.HasIndex(x => new { x.TenantId, x.RegistrationCode }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.EventId, x.Status });
        b.HasIndex(x => new { x.TenantId, x.EventId, x.MemberId })
            .HasFilter("[MemberId] IS NOT NULL");
        b.HasIndex(x => new { x.TenantId, x.EventId, x.AttendeeEmail })
            .HasFilter("[AttendeeEmail] IS NOT NULL");

        b.HasOne<Event>().WithMany().HasForeignKey(x => x.EventId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.NoAction);

        b.OwnsMany(x => x.Guests, g =>
        {
            g.ToTable("EventGuest", "dbo");
            g.WithOwner().HasForeignKey(x => x.EventRegistrationId);
            g.HasKey(x => x.Id);
            g.Property(x => x.Name).HasMaxLength(200).IsRequired();
            g.Property(x => x.AgeBand).HasConversion<int>();
            g.Property(x => x.Relationship).HasMaxLength(100);
            g.Property(x => x.Phone).HasMaxLength(32);
            g.Property(x => x.Email).HasMaxLength(200);
            g.HasIndex(x => x.EventRegistrationId);
        });
    }
}

public sealed class EventPageSectionConfiguration : IEntityTypeConfiguration<EventPageSection>
{
    public void Configure(EntityTypeBuilder<EventPageSection> b)
    {
        b.ToTable("EventPageSection", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Type).HasConversion<int>();
        b.Property(x => x.ContentJson).HasColumnType("nvarchar(max)").IsRequired();

        b.HasIndex(x => new { x.TenantId, x.EventId, x.SortOrder });
        b.HasIndex(x => new { x.TenantId, x.EventId, x.IsVisible });

        b.HasOne<Event>().WithMany().HasForeignKey(x => x.EventId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class EventCommunicationConfiguration : IEntityTypeConfiguration<EventCommunication>
{
    public void Configure(EntityTypeBuilder<EventCommunication> b)
    {
        b.ToTable("EventCommunication", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();
        b.Property(x => x.Channel).HasConversion<int>();
        b.Property(x => x.RecipientFilter).HasConversion<int>();
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.Subject).HasMaxLength(300).IsRequired();
        b.Property(x => x.Body).HasColumnType("nvarchar(max)").IsRequired();
        b.Property(x => x.LastError).HasMaxLength(1000);

        b.HasIndex(x => new { x.TenantId, x.EventId, x.Status });

        b.HasOne<Event>().WithMany().HasForeignKey(x => x.EventId).OnDelete(DeleteBehavior.Cascade);
    }
}
