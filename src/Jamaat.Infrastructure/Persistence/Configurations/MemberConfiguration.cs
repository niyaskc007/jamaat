using Jamaat.Domain.Entities;
using Jamaat.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Jamaat.Infrastructure.Persistence.Configurations;

public sealed class MemberConfiguration : IEntityTypeConfiguration<Member>
{
    public void Configure(EntityTypeBuilder<Member> b)
    {
        b.ToTable("Member", "dbo");
        b.HasKey(x => x.Id);
        b.Property(x => x.TenantId).IsRequired();

        b.Property(x => x.ItsNumber)
            .HasConversion(v => v.Value, s => ItsNumber.Create(s))
            .HasMaxLength(8)
            .IsRequired();

        // Name composition
        b.Property(x => x.FullName).HasMaxLength(200).IsRequired();
        b.Property(x => x.FullNameArabic).HasMaxLength(200);
        b.Property(x => x.FullNameHindi).HasMaxLength(200);
        b.Property(x => x.FullNameUrdu).HasMaxLength(200);
        b.Property(x => x.FirstPrefix).HasMaxLength(32);
        b.Property(x => x.FirstName).HasMaxLength(100);
        b.Property(x => x.FatherPrefix).HasMaxLength(32);
        b.Property(x => x.FatherName).HasMaxLength(100);
        b.Property(x => x.FatherSurname).HasMaxLength(100);
        b.Property(x => x.SpousePrefix).HasMaxLength(32);
        b.Property(x => x.SpouseName).HasMaxLength(100);
        b.Property(x => x.Surname).HasMaxLength(100);
        b.Property(x => x.Title).HasMaxLength(32);

        // Biological relationships
        b.Property(x => x.FatherItsNumber).HasMaxLength(8);
        b.Property(x => x.MotherItsNumber).HasMaxLength(8);
        b.Property(x => x.SpouseItsNumber).HasMaxLength(8);

        // Personal
        b.Property(x => x.Gender).HasConversion<int>();
        b.Property(x => x.MaritalStatus).HasConversion<int>();
        b.Property(x => x.BloodGroup).HasConversion<int>();
        b.Property(x => x.WarakatulTarkhisStatus).HasConversion<int>();
        b.Property(x => x.MisaqStatus).HasConversion<int>();
        b.Property(x => x.DateOfNikahHijri).HasMaxLength(64);

        // Contact
        b.Property(x => x.Phone).HasMaxLength(32);
        b.Property(x => x.WhatsAppNo).HasMaxLength(32);
        b.Property(x => x.Email).HasMaxLength(200);
        // Social profiles (URLs - 500 chars to fit Mini-URLs without trimming).
        b.Property(x => x.LinkedInUrl).HasMaxLength(500);
        b.Property(x => x.FacebookUrl).HasMaxLength(500);
        b.Property(x => x.InstagramUrl).HasMaxLength(500);
        b.Property(x => x.TwitterUrl).HasMaxLength(500);
        b.Property(x => x.WebsiteUrl).HasMaxLength(500);

        // Address
        b.Property(x => x.AddressLine).HasMaxLength(500);
        b.Property(x => x.Building).HasMaxLength(200);
        b.Property(x => x.Street).HasMaxLength(200);
        b.Property(x => x.Area).HasMaxLength(200);
        b.Property(x => x.City).HasMaxLength(100);
        b.Property(x => x.State).HasMaxLength(100);
        b.Property(x => x.Pincode).HasMaxLength(16);
        b.Property(x => x.HousingOwnership).HasConversion<int>();
        b.Property(x => x.TypeOfHouse).HasConversion<int>();

        // Community / origin
        b.Property(x => x.Category).HasMaxLength(100);
        b.Property(x => x.Idara).HasMaxLength(100);
        b.Property(x => x.Vatan).HasMaxLength(100);
        b.Property(x => x.Nationality).HasMaxLength(100);
        b.Property(x => x.Jamaat).HasMaxLength(100);
        b.Property(x => x.Jamiaat).HasMaxLength(100);

        // Education / work
        b.Property(x => x.Qualification).HasConversion<int>();
        b.Property(x => x.LanguagesCsv).HasMaxLength(300);
        b.Property(x => x.HunarsCsv).HasMaxLength(500);
        b.Property(x => x.Occupation).HasMaxLength(100);
        b.Property(x => x.SubOccupation).HasMaxLength(100);
        b.Property(x => x.SubOccupation2).HasMaxLength(100);

        // Religious
        b.Property(x => x.QuranSanad).HasMaxLength(100);
        b.Property(x => x.HajjStatus).HasConversion<int>();

        // Verification
        b.Property(x => x.DataVerificationStatus).HasConversion<int>();
        b.Property(x => x.PhotoVerificationStatus).HasConversion<int>();
        b.Property(x => x.PhotoUrl).HasMaxLength(500);

        // Event scan snapshot
        b.Property(x => x.LastScannedEventName).HasMaxLength(200);
        b.Property(x => x.LastScannedPlace).HasMaxLength(200);

        // Registry / status
        b.Property(x => x.TanzeemFileNo).HasMaxLength(32);
        b.Property(x => x.Status).HasConversion<int>();
        b.Property(x => x.InactiveReason).HasMaxLength(500);
        b.Property(x => x.ExternalUserId).HasMaxLength(100);
        b.Property(x => x.FamilyRole).HasConversion<int>();

        // Indexes
        b.HasIndex(x => new { x.TenantId, x.ItsNumber }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.FullName });
        b.HasIndex(x => new { x.TenantId, x.Status });
        b.HasIndex(x => new { x.TenantId, x.TanzeemFileNo })
            .HasFilter("[TanzeemFileNo] IS NOT NULL");
        b.HasIndex(x => new { x.TenantId, x.SectorId });
        b.HasIndex(x => new { x.TenantId, x.SubSectorId });
        b.HasIndex(x => new { x.TenantId, x.FatherItsNumber });
        b.HasIndex(x => new { x.TenantId, x.MotherItsNumber });
        b.HasIndex(x => new { x.TenantId, x.SpouseItsNumber });

        // Foreign keys (no-action delete; sectors/subsectors keep a member orphaned but alive)
        b.HasOne<Family>().WithMany().HasForeignKey(x => x.FamilyId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Sector>().WithMany().HasForeignKey(x => x.SectorId).OnDelete(DeleteBehavior.NoAction);
        b.HasOne<SubSector>().WithMany().HasForeignKey(x => x.SubSectorId).OnDelete(DeleteBehavior.NoAction);
        b.HasOne<Event>().WithMany().HasForeignKey(x => x.LastScannedEventId).OnDelete(DeleteBehavior.NoAction);
    }
}
