/**
 * Seed MongoDB with demo grievances routed through the real AI pipeline.
 *
 * This is not a mock: each complaint goes through services/aiServiceClient.js,
 * the same bridge the live submission route uses, so what lands in MongoDB is
 * genuine model output — department routing, 1–5 priority, duplicate links.
 *
 *   node seedDemo.js          add the demo grievances
 *   node seedDemo.js --reset  wipe the collection first
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Issue from './models/Issue.js';
import User from './models/User.js';
import { calculateSLA } from './controllers/slaController.js';
import { hashPassword } from './middleware/auth.js';
import { analyzeComplaint, indexComplaint, clearIndex } from './services/aiServiceClient.js';
import { escalateCluster, resolveRoot } from './services/escalation.js';

dotenv.config();

// Sign-in-able demo accounts. Complaints are attributed to these, so "My
// Complaints" has content the moment you log in.
// Override with DEMO_PASSWORD when seeding a public instance, so the guest
// password is not the one published in the repository.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo12345';
const DEMO_USERS = [
  { email: 'citizen@demo.in', name: 'Ravi Deshmukh', phone: '9812345670', role: 'citizen' },
  { email: 'meena@demo.in',   name: 'Meena Krishnan', phone: '9800112233', role: 'citizen' },
  { email: 'admin@demo.in',   name: 'Municipal Admin', phone: '9800000000', role: 'citizen' },
  // Government officials. Provisioned here the way the owner console
  // provisions them; they cannot self-register.
  { email: 'officer@gov.in', name: 'S. Iyer', phone: '9800334455',
    role: 'official', designation: 'Junior Engineer', employeeId: 'KA-JE-4471',
    department: 'Public Works Department', region: 'Karnataka' },
  { email: 'pwd.officer@gov.in', name: 'R. Sharma', phone: '9800667788',
    role: 'dept_admin', designation: 'Assistant Engineer', employeeId: 'KA-AE-2210',
    department: 'Public Works Department', region: 'Karnataka' },
];

const COMPLAINTS = [
  {
    title: 'Live wire hanging near school gate',
    description: 'An electric wire snapped and is hanging low right outside the school gate. Children pass under it every morning. Extremely dangerous, please fix immediately.',
    location: 'MG Road, near Govt. Primary School', state: 'Karnataka',
    coordinates: { latitude: 12.9716, longitude: 77.5946 },
    submitterName: 'Ramesh Kumar',
  },
  {
    title: 'Large pothole on MG Road',
    description: 'A very large pothole has formed near the MG Road junction. Two-wheelers are skidding and cars are getting damaged every day.',
    location: 'MG Road Junction', state: 'Karnataka',
    coordinates: { latitude: 12.9720, longitude: 77.5950 },
    submitterName: 'Priya Sharma',
  },
  {
    title: 'Drain overflowing outside the vegetable market',
    description: 'The main drain outside the vegetable market is overflowing. Sewage is spreading across the footpath, mosquitoes are breeding and children are falling sick.',
    location: 'Sabzi Mandi Road', state: 'Karnataka',
    coordinates: { latitude: 12.9740, longitude: 77.5980 },
    submitterName: 'Anil Verma',
  },
  {
    title: 'No water supply for four days',
    description: 'There has been no water supply in our building for four days. We are buying tankers at our own cost.',
    location: 'Sector 7, Indiranagar', state: 'Karnataka',
    coordinates: { latitude: 12.9700, longitude: 77.5930 },
    submitterName: 'Fatima Sheikh',
  },
  {
    title: 'Garbage not collected in Sector 12',
    description: 'Garbage has not been picked up for over a week in Sector 12. The pile is stinking and stray dogs are scattering it across the road.',
    location: 'Sector 12', state: 'Karnataka',
    coordinates: { latitude: 12.9750, longitude: 77.6000 },
    submitterName: 'Suresh Nair',
  },
  {
    title: 'Street light not working near colony park',
    description: 'The street light outside the colony park has been off for two weeks. The whole lane is pitch dark after 7pm and it feels unsafe.',
    location: 'Colony Park Lane', state: 'Karnataka',
    coordinates: { latitude: 12.9730, longitude: 77.5960 },
    submitterName: 'Meera Iyer',
  },
  {
    title: 'Please repaint the community hall',
    description: 'The community hall walls have faded paint and look shabby. Requesting repainting whenever budget allows.',
    location: 'Community Hall, Block C', state: 'Karnataka',
    coordinates: { latitude: 12.9760, longitude: 77.5910 },
    submitterName: 'Vikram Rao',
  },
  // Deliberate duplicate: same pothole, a different citizen's words, 40m away.
  // Must come from a DIFFERENT account than the original — repeat reports only
  // raise priority when they come from different people, and the round-robin
  // below would otherwise hand both to the same one.
  {
    authorEmail: 'citizen@demo.in',
    title: 'Huge crater on M.G. Road',
    description: 'There is a big hole in the road at the MG Road crossing. Bikes are slipping and cars keep getting damaged.',
    location: 'MG Road crossing', state: 'Karnataka',
    coordinates: { latitude: 12.9717, longitude: 77.5947 },
    submitterName: 'Deepak Joshi',
  },
];

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  if (process.argv.includes('--reset')) {
    // Purge the vector store as well. It lives outside MongoDB, so dropping
    // the documents alone leaves embeddings behind — and every re-seeded
    // complaint then matches its own deleted predecessor at similarity 1.0.
    const { cleared } = await clearIndex();
    const { deletedCount } = await Issue.deleteMany({});
    console.log(`Cleared ${deletedCount} issues and ${cleared ?? 0} embeddings`);
  }

  // Upsert the demo accounts. Idempotent, so re-seeding does not fail on the
  // unique email index or reset a password you may have changed.
  const users = [];
  // --no-admin: skip the demo admin account. Use it on any real instance, where
  // the owner is created with scripts/createOwner.mjs instead.
  const skipAdmin = process.argv.includes('--no-admin');
  for (const demo of DEMO_USERS.filter(u => !(skipAdmin && u.email === 'admin@demo.in'))) {
    let user = await User.findOne({ email: demo.email });
    if (!user) {
      user = await User.create({
        ...demo,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        // Seeded citizens are marked verified so the demo does not require
        // walking the Aadhaar flow for each of them. Real registrations go
        // through it — see services/aadhaar.js.
        aadhaarVerified: demo.role === 'citizen',
        aadhaarVerifiedAt: demo.role === 'citizen' ? new Date() : null,
      });
      console.log(`  created ${demo.role.padEnd(10)} ${demo.email}`);
    } else if (['official', 'dept_admin'].includes(demo.role) && (!user.department || !user.region)) {
      // Existing demos from before regional scoping need a one-time
      // backfill. Do not overwrite an owner's explicit later assignment.
      user.department ||= demo.department;
      user.region ||= demo.region;
      await user.save();
      console.log(`  assigned ${demo.email} to ${user.department} · ${user.region}`);
    }
    users.push(user);
  }
  console.log(`Demo accounts ready (password: ${DEMO_PASSWORD})\n`);

  for (const [index, complaint] of COMPLAINTS.entries()) {
    const triage = await analyzeComplaint({
      title: complaint.title,
      description: complaint.description,
      latitude: complaint.coordinates.latitude,
      longitude: complaint.coordinates.longitude,
    });

    // Officials do not file grievances — round-robin the citizens only.
    const citizens = users.filter(u => u.role === 'citizen');
    const author = complaint.authorEmail
      ? citizens.find(u => u.email === complaint.authorEmail)
      : citizens[index % citizens.length];

    // The same merge decision the live route makes: follow a match to its
    // root, and never merge into a resolved or missing report.
    let mergeInto = null;
    if (triage.isDuplicate && triage.matchedComplaintId) {
      const root = await resolveRoot(triage.matchedComplaintId);
      if (root && root.status !== 'resolved') mergeInto = root;
    }

    const issue = await Issue.create({
      ...complaint,
      submitterName: author.name,
      submittedBy: String(author._id),
      submitterEmail: author.email,
      sla: calculateSLA(triage.priority),
      category: triage.category,
      department: mergeInto?.department || triage.department,
      priority: triage.priority,
      priorityScore: triage.priorityScore,
      urgencyLevel: triage.urgencyLevel,
      sentiment: triage.sentiment,
      aiSummary: triage.aiSummary,
      isDuplicate: Boolean(mergeInto),
      matchedComplaintId: mergeInto ? String(mergeInto._id) : null,
      similarityScore: triage.similarityScore,
      matchedDistanceMeters: triage.matchedDistanceMeters,
      similarComplaints: triage.similarComplaints,
      aiTriage: {
        reasoning: triage.priorityReasoning,
        source: triage.analysisSource,
        serviceStatus: triage.aiServiceStatus,
        analyzedAt: new Date(),
        baseScore: triage.priorityScore,
      },
      votes: Math.floor(Math.random() * 20),
    });

    // Index after the write, exactly as the live route does.
    await indexComplaint({
      complaintId: issue._id,
      title: issue.title,
      description: issue.description,
      latitude: issue.coordinates?.latitude,
      longitude: issue.coordinates?.longitude,
      category: issue.category,
      status: issue.status,
    });

    // A duplicate upvotes the original and, if enough different people have now
    // reported it, raises its priority — exactly as the live route does.
    let dupNote = '';
    if (issue.isDuplicate && issue.matchedComplaintId) {
      await Issue.findOneAndUpdate(
        { _id: issue.matchedComplaintId, voters: { $ne: String(author._id) }, submittedBy: { $ne: String(author._id) } },
        { $push: { voters: String(author._id) }, $inc: { votes: 1 } }
      );
      const outcome = await escalateCluster(issue.matchedComplaintId);
      dupNote = `  DUPLICATE of ${issue.matchedComplaintId} (${issue.similarityScore})` +
        (outcome.raised ? `  -> original raised ${outcome.from}->${outcome.to} (${outcome.reportCount} people)` : '');
    }
    console.log(
      `  ${issue.priorityScore}/${issue.urgencyLevel.padEnd(8)} ` +
      `${issue.department.padEnd(32)} ${issue.title.slice(0, 40)}${dupNote}`
    );
  }

  console.log(`\nSeeded ${COMPLAINTS.length} grievances.`);
  await mongoose.disconnect();
};

run().catch(err => { console.error(err); process.exit(1); });
