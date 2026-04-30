# Member profile overhaul plan

Started 2026-04-30.

User asked for 12 items. **Item 12 is incomplete** ("In family" with nothing after it). Flagged below; proceeding on the rest with sensible defaults that I'll call out so you can object before I implement anything sensitive.

Survey (already done) of what exists today:
- Gender IS captured: enum Unknown/Male/Female on Member
- Age IS computed on the fly via `ComputeAge()`; `AgeSnapshot` is a fallback when DOB is unknown
- Contact: 3 scalar fields (Phone, WhatsApp, Email) - no multi-contact
- Address: structured (Building/Street/Area/City/State/Pincode) + Housing/TypeOfHouse enums - **no bedrooms / bathrooms / area details**
- Education: single `Qualification` enum + CSV languages/hunars - **no multi-education**
- Religious: QuranSanad / Qadambosi / Karbala / Ashara count - **no Hajj / Umrah**
- Identity: HusbandName/HusbandPrefix exist as if borrower is always female - **not gender-aware**
- ITS for Father/Mother/Spouse exist but no auto-populate from a linked member
- Sector/SubSector ARE master-driven (FK). Category/Idara/Vatan/Nationality/Jamaat/Jamiaat are **free text strings**
- No social links anywhere
- No wealth/property/asset disclosure
- Members table: only the Name column is clickable
- No `/me/profile` self-edit endpoint

## Items I will deliver (with defaults flagged)

### Phase A - Quick + low-risk wins
1. **Member rows clickable** - the whole row navigates to the profile (Name link stays for accessibility).
9. **Age auto-computed**, never editable. AgeSnapshot stays as the legacy fallback for imported rows where DOB isn't known; UI shows computed age when DOB is set, otherwise the snapshot. No field to edit "Age".
10. **Gender surface on profile** - already captured; ensure it renders in the personal section header so it's at-a-glance.
7. **Social links** - LinkedIn / Facebook / Instagram / Twitter / Website added to the Contact tab. Optional URLs, basic format validation.
8. **Hajj + Umrah** - extend the Religious tab. Hajj: enum (NotPerformed / Performed / MultipleTimes) + optional HajjYear. Umrah: count (int).
11. **Identity overhaul**:
   - Rename `HusbandName` / `HusbandPrefix` to `SpouseName` / `SpousePrefix` everywhere (DTOs, UI). Migration preserves data.
   - When the linked spouse exists in our system (looked up by SpouseItsNumber), auto-populate name + prefix and **make those fields read-only** with a "from linked member" pill. Same pattern for Father (FatherItsNumber) and Mother (MotherItsNumber).
   - The ITS pickers become searchable - typing in "FatherItsNumber" surfaces matching members, click to select, profile fields populate. If no match, free-text fallback (we still need to capture relatives who aren't in our roll).

### Phase B - Master-driven dropdowns + multi-row entities
5. **Master-driven Jamaat & Sector dropdowns** - convert Category / Idara / Vatan / Nationality / Jamaat / Jamiaat from free text to dropdowns sourced from the existing `Lookup` master entity (it already exists as generic key-value master data). Categories seeded; admins can add to master from the Master Data screen. Free-text fallback while seed data is sparse.
4. **Address property details** - extend the address with optional structured fields:
   - NumBedrooms, NumBathrooms, NumKitchens, NumLivingRooms (int?)
   - NumStories (int?)
   - BuiltUpAreaSqft, LandAreaSqft (decimal?)
   - NumACs (int?)
   - HasElevator, HasParking, HasGarden (bool?)
   - PropertyAgeYears (int?)
   - EstimatedMarketValue (decimal?), Currency (existing)
   - Notes (free text)
   All optional. The fields surface progressively in the form so it isn't intimidating.
6. **Multi-education** - new `MemberEducation` entity. Each row: Level (HighSchool/Bachelor/Master/PhD/Diploma/Other) + Degree + Institution + Year + Specialization + IsHighest. Existing single `Qualification` enum stays as the "highest" snapshot for back-compat; UI pulls from the multi-row table.

### Phase C - Sensitive (need your nod first - see Critical questions)
2. **Multi-contact + primary + self-update** - new `MemberContact` entity. Each row: Type (Mobile/Landline/Email/WhatsApp/Telegram/Other) + Value + IsPrimary (one per type) + Notes. Self-update endpoint at `/api/v1/me/profile/contacts` gated by a NEW permission `member.self.update`. The existing scalar Phone/WhatsApp/Email fields remain as the "primary of each type" snapshot for back-compat.
3. **Wealth declaration** - new `MemberAsset` entity. Each row: Kind (RealEstate/Vehicle/Investment/ShareMarket/Business/Jewellery/Other) + Description + EstimatedValue + Currency + Notes + optional document upload. Self-declared, optional. **Visibility policy needs your decision** - see Critical questions below.

### Phase D - E2E + commit + push
6 specs covering: clickable rows, profile loads, social links, Hajj/Umrah, age computed, identity gender-aware spouse, ITS auto-populate, multi-contact list, multi-education list, property detail fields, master dropdowns, wealth declaration list.

---

## Critical questions for you (won't proceed on these without confirmation)

### 1. Item #12 was incomplete

You wrote "12- In family" with no rest. What family-level changes are you after? Common candidates:
- Make family relationships richer (spouse/children/siblings as a graph?)
- Family-level wealth / household income aggregation
- Surface family-tree visualization
- Allow head-of-family to edit dependent members' profiles
- Other?

### 2. Wealth declaration visibility (item 3)

Wealth disclosures are sensitive. My proposed default: same gates as the reliability profile -
- **member.wealth.view** seeded to: admins, QH approvers (it informs the loan decision), counters/accountants on a need-to-know basis.
- Each member can always see their own.
- Bottom-line: NOT visible to peers, NOT in any aggregate dashboard, NOT exported in bulk reports.

Object to this default and I'll change it.

### 3. Self-update policy (items 2, and beyond)

Members updating their own profile is a meaningful permission shift. My proposed default:
- New permission `member.self.update` seeded to **everyone with a login** by default (it's their own data).
- A new `/me/profile` page that lets them edit ONLY: contacts, social links, address-property details (the optional ones - not the address itself), languages, hunars, photo. Plus declare wealth (member.self.update covers this too).
- They can NOT edit: full name, ITS, gender, DOB, family links, sector, religious credentials, verification status. Those stay admin-controlled because they affect approvals + accounting.

Object to this default and I'll restrict.

---

## Defaults I'm baking in (call out if you disagree)

- Existing scalar contact fields (Phone/WhatsApp/Email) stay populated as the "primary contact of each type" snapshot, kept in sync with MemberContact rows. This means existing receipts/PDF templates that read `Phone` keep working.
- `Qualification` enum stays as the "highest education achieved" snapshot, computed from MemberEducation rows.
- ITS auto-populate is **read-only when linked**, **free text when not linked** - so you can still record a father whose ITS isn't on our system.
- Master data for Category/Idara/etc. uses the generic `Lookup` entity (already exists). Seeded with sensible starter values; admins extend from Master Data.
- Multi-row entities (contacts, education, assets) get a soft-delete column rather than hard delete, for audit.

---

## Out of scope

- Real-time messaging between members
- Family-tree graph visualization (item 12 placeholder - depends on your answer)
- Document upload for property deeds + vehicle registration certificates (could be added with the existing storage abstraction; deferred)
- Verification workflow on self-declared wealth ("verified by appraiser" etc.) - sensitive, separate feature

---

## Progress log
- 2026-04-30: Plan written. Asked user about item #12, wealth visibility, self-update policy. Beginning Phase A while waiting.
