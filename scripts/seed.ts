/**
 * Seed Script — V3
 * Run with: npx tsx scripts/seed.ts
 *
 * Creates a sample survey with:
 * - 1 survey (with slug, toneProfile, intro, completionMessage)
 * - 1 published version
 * - 5 sections (as subcollection)
 * - 20 rated questions + 5 comment questions (using all 5 types)
 * - 2 deployments (1 form, 1 chatbot)
 * - 4 mock sessions with responses
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// --- Initialize Firebase Admin ---
initializeApp({
  credential: cert({
    projectId: "student-voice-cfefa",
    clientEmail: "",
    privateKey: "",
  }),
});

const db = getFirestore();

// --- Token generator (8-char, no confusing chars) ---
function generateToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let token = "";
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// --- Section definitions ---
const sectionDefs = [
  {
    title: "Learning Environment",
    questions: [
      { qKey: "q_0001", type: "scale", prompt: { en: "The classroom is comfortable and well-equipped" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0002", type: "scale", prompt: { en: "I have access to the materials I need" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0003", type: "slider", prompt: { en: "How would you rate the overall learning space?" }, config: { min: 0, max: 100, lowLabel: "Poor", highLabel: "Excellent" } },
      { qKey: "q_0004", type: "open_text", prompt: { en: "Any comments about the learning environment?" }, config: {} },
    ],
  },
  {
    title: "Learning Experience",
    questions: [
      { qKey: "q_0005", type: "scale", prompt: { en: "The class activities are engaging and useful" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0006", type: "scale", prompt: { en: "The homework helps me learn" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0007", type: "scale", prompt: { en: "I feel I am making good progress" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0008", type: "multiple_choice", prompt: { en: "What helps you learn the most?" }, config: { options: ["Group work", "Teacher explanations", "Practice exercises", "Real-world examples"], selectMode: "single" } },
      { qKey: "q_0009", type: "open_text", prompt: { en: "Any comments about your learning experience?" }, config: {} },
    ],
  },
  {
    title: "Teaching Quality",
    questions: [
      { qKey: "q_0010", type: "scale", prompt: { en: "The teacher explains things clearly" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0011", type: "scale", prompt: { en: "The teacher gives useful feedback" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0012", type: "scale", prompt: { en: "The pace of lessons is right for me" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0013", type: "nps", prompt: { en: "How likely are you to recommend this class to a friend?" }, config: { min: 0, max: 10, lowLabel: "Not likely", highLabel: "Very likely" } },
      { qKey: "q_0014", type: "open_text", prompt: { en: "What could the teacher improve?" }, config: {} },
    ],
  },
  {
    title: "Student Support",
    questions: [
      { qKey: "q_0015", type: "scale", prompt: { en: "I feel supported when I have difficulties" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0016", type: "scale", prompt: { en: "The admin team is helpful and responsive" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0017", type: "slider", prompt: { en: "How confident do you feel in this class?" }, config: { min: 0, max: 100, lowLabel: "Not confident", highLabel: "Very confident" } },
      { qKey: "q_0018", type: "open_text", prompt: { en: "Is there anything else you'd like to tell us?" }, config: {} },
    ],
  },
  {
    title: "Class Management",
    questions: [
      { qKey: "q_0019", type: "scale", prompt: { en: "The lessons are well organized" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0020", type: "scale", prompt: { en: "Class time is used well" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0021", type: "scale", prompt: { en: "The teacher is fair to all students" }, config: { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" } },
      { qKey: "q_0022", type: "multiple_choice", prompt: { en: "What does the teacher do best?" }, config: { options: ["Clear explanations", "Good examples", "Patient with questions", "Makes learning fun"], selectMode: "single" } },
      { qKey: "q_0023", type: "open_text", prompt: { en: "Any other comments?" }, config: {} },
    ],
  },
];

// --- Mock responses ---
const mockSessions = [
  { lang: "en", responses: { q_0001: 3, q_0002: 2, q_0003: 72, q_0005: 3, q_0006: 2, q_0007: 3, q_0008: "Teacher explanations", q_0010: 3, q_0011: 2, q_0012: 3, q_0013: 9, q_0015: 2, q_0016: 3, q_0017: 80, q_0019: 3, q_0020: 2, q_0021: 3, q_0022: "Clear explanations", q_0004: "Great classroom!", q_0014: "More speaking practice would help" } },
  { lang: "ar", responses: { q_0001: 2, q_0002: 2, q_0003: 55, q_0005: 2, q_0006: 1, q_0007: 2, q_0008: "Group work", q_0010: 2, q_0011: 2, q_0012: 1, q_0013: 7, q_0015: 1, q_0016: 2, q_0017: 45, q_0019: 2, q_0020: 2, q_0021: 2, q_0022: "Patient with questions", q_0009: "More variety in activities please", q_0018: "I need more one-to-one time" } },
  { lang: "es", responses: { q_0001: 3, q_0002: 3, q_0003: 88, q_0005: 3, q_0006: 3, q_0007: 3, q_0008: "Real-world examples", q_0010: 3, q_0011: 3, q_0012: 3, q_0013: 10, q_0015: 3, q_0016: 3, q_0017: 92, q_0019: 3, q_0020: 3, q_0021: 3, q_0022: "Makes learning fun" } },
  { lang: "en", responses: { q_0001: 1, q_0002: 1, q_0003: 30, q_0005: 1, q_0006: 0, q_0007: 1, q_0008: "Practice exercises", q_0010: 1, q_0011: 1, q_0012: 0, q_0013: 4, q_0015: 0, q_0016: 1, q_0017: 25, q_0019: 1, q_0020: 1, q_0021: 1, q_0022: "Good examples", q_0004: "Too noisy sometimes", q_0009: "The homework is too much", q_0014: "Slow down please, too fast", q_0018: "I feel lost in class", q_0023: "Need smaller class sizes" } },
];

async function seed() {
  console.log("🌱 Starting V3 seed...\n");

  // 1. Create survey
  const surveyRef = await db.collection("surveys").add({
    title: "Student Feedback - General",
    slug: "student-feedback-general",
    description: "Collect feedback across all areas of the student experience",
    toneProfile: "friendly",
    toneCustom: "",
    languageSelectionEnabled: true,
    intro: "Your feedback helps us improve. All answers are anonymous and take about 5 minutes.",
    completionMessage: "Thank you for sharing your thoughts. Your feedback directly shapes how we teach and support our students.",
    status: "live",
    createdBy: "seed-script",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  console.log(`✅ Survey: ${surveyRef.id}`);

  // 2. Create version
  const versionRef = await db.collection(`surveys/${surveyRef.id}/versions`).add({
    versionNumber: 1,
    status: "published",
    publishedAt: Timestamp.now(),
    surveyId: surveyRef.id,
    updatedAt: Timestamp.now(),
  });
  console.log(`✅ Version: ${versionRef.id}`);

  const basePath = `surveys/${surveyRef.id}/versions/${versionRef.id}`;

  // 3. Create sections + questions
  const qKeyToDocId: Record<string, string> = {};
  let questionOrder = 0;

  for (let si = 0; si < sectionDefs.length; si++) {
    const secDef = sectionDefs[si];

    // Create section doc
    const sectionRef = await db.collection(`${basePath}/sections`).add({
      title: secDef.title,
      order: si,
    });

    // Create questions for this section
    for (const q of secDef.questions) {
      const qRef = await db.collection(`${basePath}/questions`).add({
        qKey: q.qKey,
        type: q.type,
        prompt: q.prompt,
        sectionId: sectionRef.id,
        sectionTitle: { en: secDef.title },
        section: secDef.title.toLowerCase().replace(/\s+/g, "_"),
        order: questionOrder++,
        required: q.type !== "open_text",
        config: q.config,
      });
      qKeyToDocId[q.qKey] = qRef.id;
    }
  }
  console.log(`✅ ${sectionDefs.length} sections, ${questionOrder} questions`);

  // 4. Create deployments
  const token1 = generateToken();
  const dep1Ref = await db.collection("deployments").add({
    surveyId: surveyRef.id,
    versionId: versionRef.id,
    token: token1,
    label: "B1 Evening - Feb 2026",
    campus: "Dubai",
    status: "live",
    deliveryMode: "form",
    createdAt: Timestamp.now(),
  });

  const token2 = generateToken();
  const dep2Ref = await db.collection("deployments").add({
    surveyId: surveyRef.id,
    versionId: versionRef.id,
    token: token2,
    label: "A2 Morning - Feb 2026",
    campus: "Dubai",
    status: "live",
    deliveryMode: "chatbot",
    createdAt: Timestamp.now(),
  });
  console.log(`✅ Deployments: form=/s/${token1}  chatbot=/s/${token2}`);

  // 5. Create mock sessions + responses
  // Find all question types for proper response saving
  const allQuestions = sectionDefs.flatMap((s) => s.questions);
  const qTypeMap: Record<string, string> = {};
  for (const q of allQuestions) qTypeMap[q.qKey] = q.type;

  for (let i = 0; i < mockSessions.length; i++) {
    const ms = mockSessions[i];
    const startTime = new Date();
    startTime.setMinutes(startTime.getMinutes() - (5 + Math.floor(Math.random() * 5)));
    const endTime = new Date();

    const sessionRef = await db.collection("sessions").add({
      surveyId: surveyRef.id,
      surveyVersionId: versionRef.id,
      deploymentId: i < 2 ? dep1Ref.id : dep2Ref.id,
      language: ms.lang,
      startedAt: Timestamp.fromDate(startTime),
      completedAt: i < 3 ? Timestamp.fromDate(endTime) : null, // 4th session incomplete
    });

    // Save responses
    for (const [qKey, val] of Object.entries(ms.responses)) {
      const qType = qTypeMap[qKey] || "scale";
      const qDocId = qKeyToDocId[qKey] || "";

      let responseData: any = {
        questionId: qDocId,
        qKey,
        type: qType,
        response: {},
        responseText: null,
        score: null,
        createdAt: Timestamp.now(),
      };

      if (qType === "scale") {
        responseData.response = { value: val };
        responseData.score = Number(val);
      } else if (qType === "slider") {
        responseData.response = { value: val };
        responseData.score = Number(val);
      } else if (qType === "nps") {
        responseData.response = { value: val };
        responseData.score = Number(val);
      } else if (qType === "multiple_choice") {
        responseData.response = { value: val };
      } else if (qType === "open_text") {
        responseData.response = { text: val };
        responseData.responseText = String(val);
      }

      await db.collection(`sessions/${sessionRef.id}/responses`).add(responseData);
    }
  }
  console.log(`✅ ${mockSessions.length} sessions with responses`);

  // Summary
  console.log("\n🎉 V3 Seed complete!");
  console.log("─".repeat(40));
  console.log(`Survey:      ${surveyRef.id}`);
  console.log(`Version:     ${versionRef.id}`);
  console.log(`Form URL:    /s/${token1}`);
  console.log(`Chatbot URL: /s/${token2}`);
  console.log("─".repeat(40));
  console.log("\nRun: npm run dev");
}

seed().catch(console.error);