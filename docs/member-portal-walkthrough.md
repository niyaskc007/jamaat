# Member Portal Walkthrough

For members. Quick guide on what you can do at `/portal/me` and how to sign in.

---

## Signing in

1. Go to your Jamaat URL (your committee will share this).
2. Click **Sign in**.
3. In the email / username field, enter either:
   - Your **8-digit ITS number**, OR
   - Your **email address** if it's on file with the committee.
4. Enter your password. The first time, your committee will share a **temporary password** with you (over phone, SMS, or WhatsApp).
5. Click **Sign in**.

### First sign-in (with a temporary password)

The system will redirect you to a "Set your new password" screen. Choose a permanent password (at least 8 characters), confirm it, and click **Set password and sign in**.

You'll land on the **Member portal home** with tiles for each section.

> **Tip:** Your temporary password is valid for 7 days from the day it was issued. After that you'll need a new one — call your committee to re-issue.

---

## What you'll see

The portal sidebar has eight sections:

### 🏠 Home

A tile grid linking to every section. Quick access from any page via the sidebar.

### 👤 My profile

Your current details (name, ITS, email, phone) as we have them. The self-edit form is in the next portal release; for now, contact your committee to update contact info.

### 🎁 My contributions

Every receipt issued in your name — date, amount, fund, status. Sorted newest first. Useful for tracking what you've contributed across the year.

### ❤️ My commitments

Pledges you've made (Sabil, Niyaz, Wajebaat, etc.) with the total amount, what's paid so far, and which installment plan applies.

The **New commitment** button takes you to the standard commitment form, scoped to your ITS number — your committee will approve and activate it.

### 🏦 Qarzan Hasana

Your loan history — request date, requested vs approved vs disbursed amounts, repayment progress, current status (L1 pending, L2 pending, Active, Repaid, etc.).

The **Request a loan** button opens the new-loan wizard. Your application goes through the standard L1 → L2 → Disburse approval workflow, with guarantor consents collected from your nominated guarantors before disbursement.

### 👥 Guarantor inbox

Loans where someone else has nominated **you** as a guarantor. For each pending request you can:

- **Endorse** — confirms you stand as a guarantor for that loan. The application can advance to the next approval step *only* once all guarantors have endorsed.
- **Decline** — withdraws your name. The borrower will be asked to nominate someone else.

Past decisions stay in the list with the date you responded.

### 📅 Events

Events you've registered for, with confirmation + check-in timestamps. The **Browse upcoming events** button opens the public events portal where you can register for new ones.

### 🕐 Login history

Every sign-in attempt against your account — successful and failed — with the IP address, device type (Chrome / iPhone / Android), and country. Use this to spot logins you don't recognise.

> **If you see a session from a country / device you don't recognise:** change your password immediately (avatar menu → Change password).

---

## Changing your password

Two ways:

1. Avatar menu (top right) → **Change password**. Asks for your current password + new password + confirmation.
2. After the temp-password expires or your committee re-issues a new one, the next sign-in attempt will redirect you to **Set your new password** automatically.

Password rules: **at least 8 characters**, must be different from your current one.

---

## Privacy notes

- The system only ever shows **your own** data on the portal — even if a bug or a stolen session token tried to read someone else's contributions/loans/events, the server filters every query by your member id at the API layer.
- Your IP / location is recorded **for your own login history only**. Members never see other members' history.
- The temporary password your admin sees (in the Users panel) is wiped from the database the moment you set your permanent one — even an admin can't read your active password.

---

## Trouble signing in?

| Symptom | Likely cause | What to do |
|---|---|---|
| "Invalid credentials" | Wrong password | Try again carefully (capital letters matter). 5 tries gets logged. |
| "Your account is not enabled for self-service login" | Admin hasn't enabled login for you yet | Call your committee to enable it. |
| "Your temporary password has expired" | More than 7 days since issue | Committee re-issues a new temp password. |
| Can't remember your password | — | Committee re-issues a temp password; sign in with it; set a new permanent one. |
| Got the temp password but the change-password screen rejects the new one | New password is shorter than 8 chars or matches the temp | Pick something longer / different. |

For anything else, contact your committee.
