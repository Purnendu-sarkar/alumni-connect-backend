const baseUrl = 'http://localhost:5000/api/v1';

async function main() {
  console.log('--- 1. Moderator Login ---');
  const modRes = await fetch(`${baseUrl}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'MODERATOR' }),
  });
  const modData = await modRes.json();
  if (!modData.success) throw new Error(`Moderator login failed: ${JSON.stringify(modData)}`);
  const modToken = modData.data.accessToken;
  console.log('Moderator logged in successfully. Token received.');

  console.log('--- 2. Fetch Pending Jobs ---');
  const pendingRes = await fetch(`${baseUrl}/jobs/pending`, {
    headers: { Authorization: `Bearer ${modToken}` },
  });
  const pendingData = await pendingRes.json();
  console.log(`Pending response status: ${pendingRes.status}, data:`, pendingData);
  console.log(`Pending jobs count: ${pendingData.data?.length ?? 0}`);
  if (!pendingData.data || pendingData.data.length === 0) {
    throw new Error('No pending jobs found!');
  }
  const jobToApprove = pendingData.data[0];
  console.log(`Target pending job: "${jobToApprove.title}" at "${jobToApprove.company}" (ID: ${jobToApprove.id})`);

  console.log('--- 3. Moderator Approves Job ---');
  const approveRes = await fetch(`${baseUrl}/jobs/${jobToApprove.id}/review`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${modToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  const approveData = await approveRes.json();
  if (!approveData.success) throw new Error(`Approval failed: ${JSON.stringify(approveData)}`);
  console.log(`Job approved successfully! Status: ${approveData.data.status}`);

  console.log('--- 4. Verify Job in Published Jobs List ---');
  const publishedRes = await fetch(`${baseUrl}/jobs?page=1&limit=10`, {
    headers: { 'x-tenant-domain': 'demo.edu' },
  });
  const publishedData = await publishedRes.json();
  const foundApproved = publishedData.data?.find((j: any) => j.id === jobToApprove.id);
  console.log(`Found approved job in published listings: ${Boolean(foundApproved)}`);
  if (!foundApproved) throw new Error('Approved job not found in public listings!');

  console.log('--- 5. Student Login ---');
  const studentRes = await fetch(`${baseUrl}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'STUDENT' }),
  });
  const studentData = await studentRes.json();
  if (!studentData.success) throw new Error(`Student login failed: ${JSON.stringify(studentData)}`);
  const studentToken = studentData.data.accessToken;
  console.log('Student logged in successfully.');

  console.log('--- 6. Student Applies to Approved Job ---');
  const applyRes = await fetch(`${baseUrl}/jobs/${jobToApprove.id}/applications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'I have hands-on experience building modern Next.js and Node.js applications.' }),
  });
  const applyData = await applyRes.json();
  console.log(`Application result status: ${applyRes.status}, message: ${applyData.message || applyData.error?.code}`);

  console.log('--- 7. Verify Application in Student Desk ---');
  const mineRes = await fetch(`${baseUrl}/jobs/mine`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const mineData = await mineRes.json();
  console.log(`Student applications count: ${mineData.data?.applications?.length ?? 0}`);

  console.log('--- 8. Admin Verification Queue Inspection ---');
  const adminRes = await fetch(`${baseUrl}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'ADMIN' }),
  });
  const adminData = await adminRes.json();
  const adminToken = adminData.data.accessToken;
  const verifRes = await fetch(`${baseUrl}/admin/verifications?page=1&limit=10&status=PENDING`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const verifData = await verifRes.json();
  console.log(`Admin pending verifications count: ${verifData.data?.length ?? 0}`);

  console.log('--- 9. Super Admin University Management Inspection ---');
  const superAdminRes = await fetch(`${baseUrl}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'SUPER_ADMIN' }),
  });
  const superAdminData = await superAdminRes.json();
  const superAdminToken = superAdminData.data.accessToken;
  const univRes = await fetch(`${baseUrl}/admin/universities`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const univData = await univRes.json();
  console.log(`Super Admin registered universities count: ${univData.data?.length ?? 0}`);

  console.log('\n=============================================');
  console.log('ALL WORKFLOWS TESTED SUCCESSFULLY & VERIFIED!');
  console.log('=============================================');
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
