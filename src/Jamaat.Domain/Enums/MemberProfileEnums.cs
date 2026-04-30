namespace Jamaat.Domain.Enums;

public enum Gender { Unknown = 0, Male = 1, Female = 2 }

public enum MaritalStatus { Unknown = 0, Unmarried = 1, Married = 2, Divorced = 3, Widowed = 4 }

public enum BloodGroup
{
    Unknown = 0,
    APositive = 1, ANegative = 2,
    BPositive = 3, BNegative = 4,
    ABPositive = 5, ABNegative = 6,
    OPositive = 7, ONegative = 8,
}

public enum WarakatulTarkhisStatus { NotObtained = 0, Green = 1, Red = 2, Expired = 3 }

public enum MisaqStatus { NotDone = 0, Done = 1 }

public enum Qualification
{
    Unknown = 0,
    None = 1,
    Primary = 2,
    Secondary = 3,
    Diploma = 4,
    Graduate = 5,
    Postgraduate = 6,
    Doctorate = 7,
    Other = 99,
}

public enum HousingOwnership
{
    Unknown = 0,
    Ownership = 1,
    Rented = 2,
    CompanyProvided = 3,
    FamilyProvided = 4,
    Other = 99,
}

public enum TypeOfHouse
{
    Unknown = 0,
    Flat = 1,
    Apartment = 2,
    Villa = 3,
    IndependentHouse = 4,
    SharedAccommodation = 5,
    Other = 99,
}

public enum VerificationStatus { NotStarted = 0, Pending = 1, Verified = 2, Rejected = 3 }

/// <summary>
/// Performance of the Hajj pilgrimage. Most members will be NotPerformed; those who have
/// done Hajj at least once choose Performed (single year captured) or MultipleTimes.
/// </summary>
public enum HajjStatus { NotPerformed = 0, Performed = 1, MultipleTimes = 2 }

public enum MemberChangeRequestStatus { Pending = 1, Approved = 2, Rejected = 3 }
