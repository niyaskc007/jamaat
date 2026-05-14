// End-to-end flow probe against the live staging deployment.
//
//   1. Sign in as admin (operator with all perms).
//   2. Create a TEST member + a user with the same ITS number so the
//      portal's user->member resolver (matching by ItsNumber) links them.
//   3. Sign in as that test user.
//   4. Walk each of the three flows the user said is broken and record
//      every HTTP status + response body so we can pinpoint where each
//      flow actually fails (instead of speculating).
//
// Output: writes c:/tmp/flow-report.json with one entry per probe.

import { writeFileSync } from 'node:fs';

const BASE   = 'https://homesetupstaging.azurewebsites.net';
const ADMIN  = { email: 'admin@ubrixy.com', password: 'Password100$' };

// Unique enough across runs to avoid collisions on retry. TEST prefix per user
// request so they are easy to identify + clean up later.
// Truly unique per-run identifiers using crypto + epoch nanos. Earlier
// attempts with Math.random hit collisions (Node's PRNG can repeat across
// short-lived processes), so we use crypto.randomUUID for the email and a
// nanosecond-based ITS.
import { randomUUID } from 'node:crypto';
const TAG    = randomUUID().split('-')[0]; // 8 hex chars, guaranteed unique
const ITS    = `99${process.hrtime.bigint().toString().slice(-6)}`; // 8-digit
const TEST   = {
  email: `TEST_member_${TAG}@ubrixy.com`,
  fullName: `TEST Member ${TAG}`,
  password: 'TestPass100$',
  its: ITS,
};
console.log(`Run identifiers: email=${TEST.email} its=${TEST.its}`);

const report = [];

function logProbe(name, res, body) {
  report.push({
    name, status: res?.status ?? 'n/a',
    ok: res?.ok ?? false,
    body: body && typeof body === 'string' ? body.slice(0, 2000) : body,
  });
  const summary = `${res?.ok ? 'OK ' : 'FAIL'} ${res?.status ?? '???'} ${name}`;
  console.log(summary);
  if (!res?.ok) console.log('  body:', typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body)?.slice(0, 300));
}

async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { res, body: parsed };
}

// ----------------------------------------------------------------------------

console.log('=== Login as admin ===');
const login = await call('POST', '/api/v1/auth/login', null, { email: ADMIN.email, password: ADMIN.password });
logProbe('admin login', login.res, login.body?.accessToken ? '(JWT received)' : login.body);
const adminToken = login.body?.accessToken;
if (!adminToken) { writeFileSync('c:/tmp/flow-report.json', JSON.stringify(report, null, 2)); process.exit(1); }

// ----------------------------------------------------------------------------

console.log('\n=== Bootstrap: create TEST member + user ===');
const member = await call('POST', '/api/v1/members', adminToken, {
  itsNumber: TEST.its, fullName: TEST.fullName, fullNameArabic: null, fullNameHindi: null, fullNameUrdu: null,
  familyId: null, phone: null, email: TEST.email, address: null,
});
logProbe('create member', member.res, member.body);
const memberId = member.body?.id;

// MemberService.CreateAsync auto-provisions an ApplicationUser via
// MemberLoginProvisioningService (best-effort, see MemberService.cs:84-88).
// So our user already exists - find it, then set a known password.
const userList = await call('GET', `/api/v1/users?search=${encodeURIComponent(TEST.email)}&pageSize=5`, adminToken);
logProbe('find auto-provisioned user', userList.res, Array.isArray(userList.body?.items) ? `${userList.body.items.length} hits` : userList.body);
const userId = userList.body?.items?.find(u => (u.email ?? u.userName)?.toLowerCase() === TEST.email.toLowerCase())?.id
  ?? userList.body?.items?.[0]?.id;
console.log(`  resolved userId: ${userId}`);
if (userId) {
  const reset = await call('POST', `/api/v1/users/${userId}/reset-password`, adminToken, { newPassword: TEST.password });
  logProbe('reset password to TestPass100$', reset.res, reset.body);
  // Member role grants portal.* perms; the provisioning service typically attaches it.
  // If not, the test's flow calls will fail with 403 - we'll see it in the report.
}

// Mark the user as a Member (portal-scoped) so JWT carries userType=Member.
if (userId) {
  const setType = await call('PUT', `/api/v1/users/${userId}/user-type`, adminToken, { userType: 'Member' });
  logProbe('set user-type=Member', setType.res, setType.body);

  // Member-type users default to IsLoginAllowed=false (the prior login attempt
  // told us "Your account is not enabled for self-service login"). The DTO
  // field is `allowed`, not `isLoginAllowed`.
  const allowLogin = await call('PUT', `/api/v1/users/${userId}/login-allowed`, adminToken, { allowed: true });
  logProbe('allow self-service login', allowLogin.res, allowLogin.body);
}

// ----------------------------------------------------------------------------

console.log('\n=== Login as TEST member ===');
let memberLogin = await call('POST', '/api/v1/auth/login', null, { email: TEST.email, password: TEST.password });
logProbe('member login (initial)', memberLogin.res, memberLogin.body?.accessToken ? '(JWT received)' : memberLogin.body);

// Reset-password leaves MustChangePassword=true; the login endpoint then
// returns a password-change-required response (no JWT). Run the
// complete-first-login dance to clear that flag and get a real token.
let memberToken = memberLogin.body?.accessToken;
if (!memberToken && memberLogin.body?.mustChangePassword) {
  const final = await call('POST', '/api/v1/auth/complete-first-login', null, {
    identifier: TEST.email, currentPassword: TEST.password, newPassword: TEST.password + 'a',
  });
  logProbe('complete first login', final.res, final.body?.accessToken ? '(JWT received)' : final.body);
  memberToken = final.body?.accessToken;
  TEST.password = TEST.password + 'a'; // record the new password
}
if (!memberToken) { writeFileSync('c:/tmp/flow-report.json', JSON.stringify(report, null, 2)); process.exit(1); }

// Sanity: ensure the resolver actually linked user.ITS -> member.ITS
const profile = await call('GET', '/api/v1/portal/me/profile', memberToken);
logProbe('portal profile (link sanity)', profile.res, profile.body);

// ============================================================================
// Flow A: Commitment - create draft -> preview agreement -> accept
// ============================================================================

console.log('\n=== FLOW A: Commitment ===');

// Members hit the portal-scoped fund-types endpoint, not the operator one.
const fundTypes = await call('GET', '/api/v1/portal/me/fund-types?category=donation', memberToken);
logProbe('list portal fund types', fundTypes.res, Array.isArray(fundTypes.body) ? `${fundTypes.body.length} rows` : fundTypes.body);
const aFund = Array.isArray(fundTypes.body) && fundTypes.body.length > 0 ? fundTypes.body[0] : null;
if (aFund) console.log(`  using fund: ${aFund.code ?? aFund.id}`);

if (aFund) {
  const commit = await call('POST', '/api/v1/portal/me/commitments', memberToken, {
    fundTypeId: aFund.id,
    currency: aFund.baseCurrency ?? 'INR',
    totalAmount: 12000,
    frequency: 2, // Monthly
    numberOfInstallments: 12,
    startDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    notes: 'TEST commitment for flow validation',
  });
  logProbe('create commitment (member portal)', commit.res, commit.body);
  const commitId = commit.body?.id;

  if (commitId) {
    const preview = await call('GET', `/api/v1/portal/me/commitments/${commitId}/agreement-preview`, memberToken);
    logProbe('agreement preview', preview.res, preview.body);

    const accept = await call('POST', `/api/v1/portal/me/commitments/${commitId}/accept-agreement`, memberToken);
    logProbe('accept agreement', accept.res, accept.body);

    const detail = await call('GET', `/api/v1/portal/me/commitments/${commitId}`, memberToken);
    logProbe('post-accept commitment status', detail.res, {
      status: detail.body?.commitment?.status,
      hasAcceptedAgreement: detail.body?.commitment?.hasAcceptedAgreement,
      agreementAcceptedAtUtc: detail.body?.commitment?.agreementAcceptedAtUtc,
    });
  }
}

// ============================================================================
// Flow B: Qarzan Hasana - apply -> needs 2 guarantors -> consent -> L1 -> L2
// ============================================================================

console.log('\n=== FLOW B: Qarzan Hasana ===');

// Need two extra members to be guarantors. Create them as admin.
const g1Its = `88${process.hrtime.bigint().toString().slice(-6)}`;
const g1 = await call('POST', '/api/v1/members', adminToken, {
  itsNumber: g1Its,
  fullName: `TEST Guarantor 1 ${TAG}`,
  fullNameArabic: null, fullNameHindi: null, fullNameUrdu: null,
  familyId: null, phone: null, email: `TEST_g1_${TAG}@ubrixy.com`, address: null,
});
logProbe('create guarantor 1 (member)', g1.res, g1.body);
const g2Its = `77${process.hrtime.bigint().toString().slice(-6)}`;
const g2 = await call('POST', '/api/v1/members', adminToken, {
  itsNumber: g2Its,
  fullName: `TEST Guarantor 2 ${TAG}`,
  fullNameArabic: null, fullNameHindi: null, fullNameUrdu: null,
  familyId: null, phone: null, email: `TEST_g2_${TAG}@ubrixy.com`, address: null,
});
logProbe('create guarantor 2 (member)', g2.res, g2.body);
const itsByMember = new Map([[g1.body?.id, g1Its], [g2.body?.id, g2Its]]);

const qhFund = aFund; // any active fund - QH doesn't actually use a fund picker but field-level discovery still needs one
const qh = await call('POST', '/api/v1/portal/me/qarzan-hasana', memberToken, {
  memberId: '00000000-0000-0000-0000-000000000000', // forced override server-side
  familyId: null,
  scheme: 2, // 1=Mohammadi (gold-backed), 2=Hussain (benevolent)
  amountRequested: 5000,
  instalmentsRequested: 10,
  currency: 'INR',
  startDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  guarantor1MemberId: g1.body?.id ?? '00000000-0000-0000-0000-000000000000',
  guarantor2MemberId: g2.body?.id ?? '00000000-0000-0000-0000-000000000000',
  purpose: 'TEST QH for flow validation',
  repaymentPlan: 'TEST monthly repayment from salary',
  guarantorsAcknowledged: false,
  monthlyIncome: 30000,
  monthlyExpenses: 10000,
  incomeSources: 'SALARY',
});
logProbe('create QH application (stays in Draft)', qh.res, qh.body && { id: qh.body?.id, status: qh.body?.status, code: qh.body?.code });

if (qh.body?.id) {
  // Walk the guarantor-consent flow: list consents, accept each, expect auto-promotion to PendingLevel1.
  const consents = await call('GET', `/api/v1/portal/me/qarzan-hasana/${qh.body.id}/guarantor-consents`, memberToken);
  logProbe('list guarantor consents', consents.res, Array.isArray(consents.body) ? `${consents.body.length} consents` : consents.body);

  // Tokens are on the operator-side consent rows (member can't see them); fetch them as admin.
  const consentRows = await call('GET', `/api/v1/qarzan-hasana/${qh.body.id}/guarantor-consents`, adminToken);
  logProbe('list consent tokens (admin)', consentRows.res, Array.isArray(consentRows.body) ? `${consentRows.body.length} rows` : consentRows.body);
  const rowsA = consentRows.body ?? [];

  for (let i = 0; i < rowsA.length; i++) {
    const r = rowsA[i];
    const its = itsByMember.get(r.guarantorMemberId) ?? '';
    const accept = await call('POST', `/api/v1/portal/qh-consent/${r.token}/accept`, null, {
      ipAddress: '127.0.0.1', userAgent: 'flow-smoke', itsNumberVerification: its,
    });
    logProbe(`guarantor ${i + 1} accepts consent`, accept.res, accept.body && { status: accept.body?.status });
  }

  const qhDetail = await call('GET', `/api/v1/portal/me/qarzan-hasana/${qh.body.id}`, memberToken);
  logProbe('QH detail after both consents accepted (expect status=2 PendingLevel1)', qhDetail.res, qhDetail.body && {
    status: qhDetail.body?.status, code: qhDetail.body?.code,
  });
}

// ============================================================================
// Flow C: Patronage / Fund-enrollment - apply -> admin approves
// ============================================================================

console.log('\n=== FLOW C: Patronage ===');

if (aFund) {
  const enroll = await call('POST', '/api/v1/portal/me/fund-enrollments', memberToken, {
    fundTypeId: aFund.id,
    subType: 'Sabil',
    recurrence: 1,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    notes: 'TEST patronage for flow validation',
  });
  logProbe('create fund enrollment (member portal)', enroll.res, enroll.body);
  const enrollId = enroll.body?.id;

  // Now switch back to admin token to approve
  if (enrollId) {
    const approve = await call('POST', `/api/v1/fund-enrollments/${enrollId}/approve`, adminToken);
    logProbe('admin approve fund enrollment', approve.res, approve.body);

    const enrollDetail = await call('GET', `/api/v1/portal/me/fund-enrollments/${enrollId}`, memberToken);
    logProbe('post-approve patronage detail', enrollDetail.res, enrollDetail.body);
  }
}

// ============================================================================
// PRIVACY + SECURITY PROBES — confirm whether a member token can see anyone
// else's data, whether operator endpoints are properly gated, and whether the
// guarantor-picker search endpoint works.
// ============================================================================

console.log('\n=== PRIVACY / SECURITY probes (member token) ===');

const operatorEndpoints = [
  '/api/v1/qarzan-hasana',
  '/api/v1/commitments',
  '/api/v1/fund-enrollments',
  '/api/v1/members',
  '/api/v1/receipts',
  '/api/v1/vouchers',
];
for (const ep of operatorEndpoints) {
  const r = await call('GET', ep, memberToken);
  logProbe(`operator endpoint ${ep} (member token, expect 403)`, r.res, r.res?.status);
}

// Guarantor picker — the SPA portal form is supposed to call this; confirm
// the endpoint exists and returns results for a member token.
const memberSearch = await call('GET', '/api/v1/portal/me/members/search?q=TEST&limit=10', memberToken);
logProbe('portal member-search (guarantor picker, expect 200 + rows)', memberSearch.res,
  Array.isArray(memberSearch.body) ? `${memberSearch.body.length} rows` : memberSearch.body);

// Cross-member privacy: try to read a commitment / QH / enrollment belonging to
// someone else. We'll grab IDs that the admin can see, then probe as the member.
const allCommits = await call('GET', '/api/v1/commitments?pageSize=5', adminToken);
const otherCommitId = allCommits.body?.items?.find(c => c.memberId !== memberLogin.body?.user?.id)?.id;
if (otherCommitId) {
  const probe = await call('GET', `/api/v1/portal/me/commitments/${otherCommitId}`, memberToken);
  logProbe(`portal-me commitment for someone else's id (expect 404)`, probe.res, probe.res?.status);
}

// ============================================================================
// GUARANTOR DECLINE: probe what happens to the loan when a guarantor declines
// instead of accepting. We'll create another QH loan with the two test
// guarantors, then have ONE accept and the OTHER decline. Expect the loan to
// move out of Draft to some terminal/rejected state.
// ============================================================================

if (aFund && g1.body?.id && g2.body?.id) {
  console.log('\n=== Guarantor DECLINE probe ===');
  const qh2 = await call('POST', '/api/v1/portal/me/qarzan-hasana', memberToken, {
    memberId: '00000000-0000-0000-0000-000000000000',
    familyId: null,
    scheme: 2,
    amountRequested: 3000,
    instalmentsRequested: 6,
    currency: 'INR',
    startDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    guarantor1MemberId: g1.body.id,
    guarantor2MemberId: g2.body.id,
    purpose: 'TEST decline-path QH',
    repaymentPlan: 'TEST monthly',
    guarantorsAcknowledged: false,
    monthlyIncome: 20000,
    monthlyExpenses: 5000,
    incomeSources: 'SALARY',
  });
  logProbe('create 2nd QH (for decline probe)', qh2.res, qh2.body?.id && { id: qh2.body.id, status: qh2.body.status });

  if (qh2.body?.id) {
    const consents2 = await call('GET', `/api/v1/qarzan-hasana/${qh2.body.id}/guarantor-consents`, adminToken);
    const rows2 = consents2.body ?? [];
    // Also probe: missing ITS should now reject the consent call (security fix).
    if (rows2[0]) {
      const noIts = await call('POST', `/api/v1/portal/qh-consent/${rows2[0].token}/accept`, null, {
        ipAddress: '127.0.0.1', userAgent: 'flow-smoke', itsNumberVerification: '',
      });
      logProbe('accept WITHOUT ITS verification (expect 400)', noIts.res, noIts.res?.status);
    }
    if (rows2[0]) {
      const accept = await call('POST', `/api/v1/portal/qh-consent/${rows2[0].token}/accept`, null, {
        ipAddress: '127.0.0.1', userAgent: 'flow-smoke',
        itsNumberVerification: itsByMember.get(rows2[0].guarantorMemberId) ?? '',
      });
      logProbe('guarantor 1 accepts (with ITS)', accept.res, accept.body?.status);
    }
    if (rows2[1]) {
      const decline = await call('POST', `/api/v1/portal/qh-consent/${rows2[1].token}/decline`, null, {
        ipAddress: '127.0.0.1', userAgent: 'flow-smoke',
        itsNumberVerification: itsByMember.get(rows2[1].guarantorMemberId) ?? '',
        declineReason: 'TEST decline reason',
      });
      logProbe('guarantor 2 DECLINES (with ITS)', decline.res, decline.body?.status);
    }
    const detail = await call('GET', `/api/v1/portal/me/qarzan-hasana/${qh2.body.id}`, memberToken);
    logProbe('QH after 1 accept + 1 decline (expect status=8 Rejected)', detail.res,
      detail.body && { status: detail.body.status, code: detail.body.code, rejectionReason: detail.body.rejectionReason });
  }
}

writeFileSync('c:/tmp/flow-report.json', JSON.stringify(report, null, 2));
console.log('\nFull report: c:/tmp/flow-report.json');
console.log(`\nSummary: ${report.filter(r => r.ok).length} OK / ${report.filter(r => !r.ok).length} FAIL`);
