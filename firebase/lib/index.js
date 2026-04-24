"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  generateMatchReport: () => generateMatchReport,
  onMatchUpdate: () => onMatchUpdate,
  onNewMessage: () => onNewMessage,
  resolveDisputedReport: () => resolveDisputedReport
});
module.exports = __toCommonJS(index_exports);

// src/matches/matchFunctions.ts
var functions = __toESM(require("firebase-functions/v2"));
var import_firestore = require("firebase-admin/firestore");
var import_app = require("firebase-admin/app");
var import_messaging = require("firebase-admin/messaging");

// ../packages/shared/dist/index.mjs
function formatScoreDisplay(score) {
  const sets = score.sets.filter((s) => s.winner !== void 0 || score.sets.indexOf(s) === score.currentSet).map((s, i) => {
    if (s.tiebreak && s.winner) {
      const loserPts = s.winner === "player1" ? s.tiebreak.player2Points : s.tiebreak.player1Points;
      return `${s.player1Games}-${s.player2Games}(${loserPts})`;
    }
    return `${s.player1Games}-${s.player2Games}`;
  });
  return sets.join(", ");
}
function computeRankings(inputs, headToHeads) {
  const now = Date.now();
  const players = inputs.map((p) => ({
    ...p,
    matchesPlayed: p.matchesWon + p.matchesLost,
    gameDifferential: p.gamesWon - p.gamesLost,
    rank: 0,
    updatedAt: now
  }));
  const h2hMap = buildH2HMap(headToHeads);
  const sorted = players.sort((a, b) => compareRankings(a, b, h2hMap));
  return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
}
function buildH2HMap(h2hs) {
  const map = /* @__PURE__ */ new Map();
  for (const h of h2hs) {
    if (!map.has(h.player1Id)) map.set(h.player1Id, /* @__PURE__ */ new Map());
    if (!map.has(h.player2Id)) map.set(h.player2Id, /* @__PURE__ */ new Map());
    map.get(h.player1Id).set(h.player2Id, h.player1Wins);
    map.get(h.player2Id).set(h.player1Id, h.player2Wins);
  }
  return map;
}
function compareRankings(a, b, h2hMap) {
  if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
  if (b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;
  if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
  if (b.gameDifferential !== a.gameDifferential) return b.gameDifferential - a.gameDifferential;
  const aWinsVsB = h2hMap.get(a.userId)?.get(b.userId) ?? 0;
  const bWinsVsA = h2hMap.get(b.userId)?.get(a.userId) ?? 0;
  if (aWinsVsB !== bWinsVsA) return bWinsVsA - aWinsVsB;
  return a.displayName.localeCompare(b.displayName);
}
function extractMatchTotals(sets) {
  let p1Sets = 0, p2Sets = 0, p1Games = 0, p2Games = 0;
  for (const s of sets) {
    p1Games += s.player1Games;
    p2Games += s.player2Games;
    if (s.winner === "player1") p1Sets++;
    else if (s.winner === "player2") p2Sets++;
  }
  return { p1Sets, p2Sets, p1Games, p2Games };
}

// src/matches/matchFunctions.ts
if (!(0, import_app.getApps)().length) (0, import_app.initializeApp)();
var onMatchUpdate = functions.firestore.onDocumentWritten(
  "matches/{matchId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;
    const matchId = event.params.matchId;
    const db = (0, import_firestore.getFirestore)();
    const prevSubmission = before?.reportSubmission;
    const curSubmission = after.reportSubmission;
    if (curSubmission?.status === "pending_confirmation" && prevSubmission?.status !== "pending_confirmation") {
      await notifyOpponentOfSubmission(db, after, matchId, curSubmission);
      return;
    }
    if (after.status === "completed" && before?.status !== "completed") {
      await recalculateRankings(after.divisionId);
      return;
    }
    if (after.status === "disputed" && before?.status !== "disputed") {
      await notifyLeaderOfDispute(db, after, matchId);
      return;
    }
  }
);
async function notifyOpponentOfSubmission(db, match, matchId, submission) {
  const opponentId = submission.submittedBy === match.player1Id ? match.player2Id : match.player1Id;
  if (!opponentId || opponentId === "guest") return;
  const opponentSnap = await db.collection("users").doc(opponentId).get();
  const opponent = opponentSnap.data();
  if (!opponent?.fcmTokens?.length) return;
  const submitterSnap = await db.collection("users").doc(submission.submittedBy).get();
  const submitterName = submitterSnap.data()?.displayName ?? "Your opponent";
  await (0, import_messaging.getMessaging)().sendEachForMulticast({
    tokens: opponent.fcmTokens,
    notification: {
      title: "Match Report Submitted",
      body: `${submitterName} has submitted the match report. Review and confirm or dispute.`
    },
    data: { type: "report_submitted", matchId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } }
  });
}
async function notifyLeaderOfDispute(db, match, matchId) {
  const divisionSnap = await db.collection("divisions").doc(match.divisionId).get();
  const leaderId = divisionSnap.data()?.leaderId;
  if (!leaderId) return;
  const leaderSnap = await db.collection("users").doc(leaderId).get();
  const leader = leaderSnap.data();
  if (!leader?.fcmTokens?.length) return;
  await (0, import_messaging.getMessaging)().sendEachForMulticast({
    tokens: leader.fcmTokens,
    notification: {
      title: "Match Report Disputed",
      body: "A player has disputed a match report. Your resolution is needed."
    },
    data: { type: "report_disputed", matchId },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } }
  });
  await db.collection("matches").doc(matchId).update({
    "reportSubmission.leaderNotifiedAt": Date.now()
  });
}
async function recalculateRankings(divisionId) {
  const db = (0, import_firestore.getFirestore)();
  const matchesSnap = await db.collection("matches").where("divisionId", "==", divisionId).where("status", "==", "completed").get();
  const matches = matchesSnap.docs.map((d) => d.data());
  const statsMap = /* @__PURE__ */ new Map();
  const h2hAccum = /* @__PURE__ */ new Map();
  for (const match of matches) {
    if (!match.winner) continue;
    if (match.player2IsGuest) continue;
    const { player1Id, player2Id, liveScore, winner } = match;
    for (const pid of [player1Id, player2Id]) {
      if (!statsMap.has(pid)) {
        statsMap.set(pid, { matchesWon: 0, matchesLost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 });
      }
    }
    const { p1Sets, p2Sets, p1Games, p2Games } = extractMatchTotals(liveScore.sets);
    const p1Won = winner === "player1";
    const p1Stats = statsMap.get(player1Id);
    const p2Stats = statsMap.get(player2Id);
    if (p1Won) {
      p1Stats.matchesWon++;
      p2Stats.matchesLost++;
    } else {
      p2Stats.matchesWon++;
      p1Stats.matchesLost++;
    }
    p1Stats.setsWon += p1Sets;
    p1Stats.setsLost += p2Sets;
    p2Stats.setsWon += p2Sets;
    p2Stats.setsLost += p1Sets;
    p1Stats.gamesWon += p1Games;
    p1Stats.gamesLost += p2Games;
    p2Stats.gamesWon += p2Games;
    p2Stats.gamesLost += p1Games;
    const h2hId = [player1Id, player2Id].sort().join("_");
    if (!h2hAccum.has(h2hId)) {
      h2hAccum.set(h2hId, {
        id: h2hId,
        divisionId,
        player1Id: [player1Id, player2Id].sort()[0],
        player2Id: [player1Id, player2Id].sort()[1],
        player1Wins: 0,
        player2Wins: 0
      });
    }
    const h2h = h2hAccum.get(h2hId);
    const sortedIds = [player1Id, player2Id].sort();
    if (winner === "player1") {
      if (player1Id === sortedIds[0]) h2h.player1Wins++;
      else h2h.player2Wins++;
    } else {
      if (player2Id === sortedIds[0]) h2h.player1Wins++;
      else h2h.player2Wins++;
    }
  }
  const divisionSnap = await db.collection("divisions").doc(divisionId).get();
  const division = divisionSnap.data();
  const playerIds = division?.playerIds ?? [...statsMap.keys()];
  const userSnaps = await Promise.all(playerIds.map((id) => db.collection("users").doc(id).get()));
  const displayNames = new Map(userSnaps.map((s) => [s.id, s.data()?.displayName ?? s.id]));
  const rankingInputs = playerIds.map((userId) => ({
    userId,
    displayName: displayNames.get(userId) ?? userId,
    divisionId,
    season: division?.season ?? "2024",
    ...statsMap.get(userId) ?? { matchesWon: 0, matchesLost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 }
  }));
  const rankings = computeRankings(rankingInputs, [...h2hAccum.values()]);
  const batch = db.batch();
  for (const ranking of rankings) {
    const ref = db.collection("divisions").doc(divisionId).collection("rankings").doc(ranking.userId);
    batch.set(ref, { ...ranking, updatedAt: import_firestore.FieldValue.serverTimestamp() });
  }
  for (const h2h of h2hAccum.values()) {
    const ref = db.collection("headToHead").doc(h2h.id);
    batch.set(ref, { ...h2h, updatedAt: import_firestore.FieldValue.serverTimestamp() });
  }
  await batch.commit();
}
var resolveDisputedReport = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in");
  }
  const { matchId } = request.data;
  const db = (0, import_firestore.getFirestore)();
  const matchRef = db.collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  const match = matchSnap.data();
  if (!match) throw new functions.https.HttpsError("not-found", "Match not found");
  const isLeader = await checkIsLeader(request.auth.uid, match.divisionId);
  if (!isLeader) {
    throw new functions.https.HttpsError("permission-denied", "Only the division leader can resolve disputes");
  }
  await matchRef.update({
    status: "completed",
    "reportSubmission.status": "confirmed",
    "reportSubmission.confirmedBy": request.auth.uid,
    "reportSubmission.confirmedAt": Date.now()
  });
  return { success: true };
});
async function checkIsLeader(uid, divisionId) {
  const db = (0, import_firestore.getFirestore)();
  const divSnap = await db.collection("divisions").doc(divisionId).get();
  return divSnap.data()?.leaderId === uid;
}

// src/reports/generateReport.ts
var functions2 = __toESM(require("firebase-functions/v2"));
var import_firestore2 = require("firebase-admin/firestore");
var import_storage = require("firebase-admin/storage");
var import_app2 = require("firebase-admin/app");
var import_pdf_lib = require("pdf-lib");
if (!(0, import_app2.getApps)().length) (0, import_app2.initializeApp)();
var generateMatchReport = functions2.firestore.onDocumentWritten(
  "matches/{matchId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;
    if (before?.status === "completed" || after.status !== "completed") return;
    if (after.reportUrl) return;
    const matchId = event.params.matchId;
    await createAndStoreReport(matchId, after);
  }
);
async function createAndStoreReport(matchId, match) {
  const db = (0, import_firestore2.getFirestore)();
  const [p1Snap, p2Snap] = await Promise.all([
    db.collection("users").doc(match.player1Id).get(),
    db.collection("users").doc(match.player2Id).get()
  ]);
  const p1 = p1Snap.data();
  const p2 = p2Snap.data();
  const pdfDoc = await import_pdf_lib.PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(import_pdf_lib.StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(import_pdf_lib.StandardFonts.HelveticaBold);
  const { height } = page.getSize();
  let y = height - 60;
  const draw = (text, x, size, bold = false, color = (0, import_pdf_lib.rgb)(0, 0, 0)) => {
    page.drawText(text, { x, y, size, font: bold ? fontBold : font, color });
  };
  draw("Tennis League \u2014 Match Report", 60, 20, true, (0, import_pdf_lib.rgb)(0.1, 0.4, 0.1));
  y -= 35;
  draw((/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { dateStyle: "long" }), 60, 11);
  y -= 30;
  const winnerName = match.winner === "player1" ? p1.displayName : p2.displayName;
  const loserName = match.winner === "player1" ? p2.displayName : p1.displayName;
  draw(`Winner: ${winnerName}`, 60, 14, true);
  y -= 20;
  draw(`Opponent: ${loserName}`, 60, 14);
  y -= 30;
  draw("Final Score", 60, 13, true);
  y -= 18;
  draw(formatScoreDisplay(match.liveScore), 60, 13);
  y -= 30;
  draw("Set Breakdown", 60, 13, true);
  y -= 18;
  for (const set of match.liveScore.sets.filter((s) => s.winner)) {
    let setStr = `  Set ${set.setNumber + 1}: ${set.player1Games}\u2013${set.player2Games}`;
    if (set.tiebreak) {
      const loserPts = set.winner === "player1" ? set.tiebreak.player2Points : set.tiebreak.player1Points;
      setStr += ` (${loserPts})`;
    }
    draw(setStr + `  \u2014 ${set.winner === "player1" ? p1.displayName : p2.displayName} won`, 60, 11);
    y -= 16;
  }
  y -= 14;
  draw("Match Statistics", 60, 13, true);
  y -= 18;
  const statRows = [
    ["", p1.displayName, p2.displayName],
    ["Aces", String(match.stats.player1.aces), String(match.stats.player2.aces)],
    ["Double Faults", String(match.stats.player1.doubleFaults), String(match.stats.player2.doubleFaults)],
    ["Winners", String(match.stats.player1.winners), String(match.stats.player2.winners)],
    ["Unforced Errors", String(match.stats.player1.unforcedErrors), String(match.stats.player2.unforcedErrors)],
    ["Break Pts Won", String(match.stats.player1.breakPointsWon), String(match.stats.player2.breakPointsWon)]
  ];
  for (const [label, v1, v2] of statRows) {
    const isBold = label === "";
    draw(label, 60, 11, isBold);
    draw(v1, 300, 11, isBold);
    draw(v2, 430, 11, isBold);
    y -= 16;
  }
  y = 40;
  page.drawText("Generated by Tennis League App", { x: 60, y, size: 9, font, color: (0, import_pdf_lib.rgb)(0.5, 0.5, 0.5) });
  const pdfBytes = await pdfDoc.save();
  const bucket = (0, import_storage.getStorage)().bucket();
  const file = bucket.file(`reports/${matchId}.pdf`);
  await file.save(Buffer.from(pdfBytes), { contentType: "application/pdf" });
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 30 * 24 * 60 * 60 * 1e3
    // 30 days
  });
  await (0, import_firestore2.getFirestore)().collection("matches").doc(matchId).update({ reportUrl: signedUrl });
}

// src/messaging/onNewMessage.ts
var functions3 = __toESM(require("firebase-functions/v2"));
var import_firestore3 = require("firebase-admin/firestore");
var import_messaging2 = require("firebase-admin/messaging");
var import_app3 = require("firebase-admin/app");
if (!(0, import_app3.getApps)().length) (0, import_app3.initializeApp)();
var onNewMessage = functions3.firestore.onDocumentCreated(
  "channels/{channelId}/messages/{messageId}",
  async (event) => {
    const message = event.data?.data();
    if (!message) return;
    const db = (0, import_firestore3.getFirestore)();
    const channelSnap = await db.collection("channels").doc(event.params.channelId).get();
    const channel = channelSnap.data();
    if (!channel) return;
    await channelSnap.ref.update({
      lastMessage: {
        content: message.content,
        senderId: message.senderId,
        senderName: message.senderName,
        timestamp: message.createdAt
      }
    });
    const recipientIds = channel.participantIds.filter((id) => id !== message.senderId);
    if (recipientIds.length === 0) return;
    const userSnaps = await Promise.all(
      recipientIds.map((id) => db.collection("users").doc(id).get())
    );
    const tokens = [];
    for (const snap of userSnaps) {
      const user = snap.data();
      if (user?.fcmTokens?.length) {
        tokens.push(...user.fcmTokens);
      }
    }
    if (tokens.length === 0) return;
    await (0, import_messaging2.getMessaging)().sendEachForMulticast({
      tokens,
      notification: {
        title: message.senderName,
        body: message.content.length > 100 ? message.content.slice(0, 97) + "..." : message.content
      },
      data: {
        type: "message",
        channelId: event.params.channelId,
        messageId: event.params.messageId
      },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default", badge: 1 } } }
    });
  }
);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generateMatchReport,
  onMatchUpdate,
  onNewMessage,
  resolveDisputedReport
});
