"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDisputedReport = exports.onMatchUpdate = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
const shared_1 = require("@tennis/shared");
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
/**
 * Triggered on every match document write. Handles three transitions:
 *
 * 1. reportSubmission.status → 'pending_confirmation'
 *    Notify the other player that a report has been submitted for their review.
 *
 * 2. status → 'completed' (reportSubmission.status === 'confirmed')
 *    Recalculate division rankings and trigger PDF report generation.
 *
 * 3. status → 'disputed' (reportSubmission.status === 'disputed')
 *    Notify the division leader to resolve the disagreement.
 */
exports.onMatchUpdate = functions.firestore.onDocumentWritten('matches/{matchId}', async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after)
        return;
    const matchId = event.params.matchId;
    const db = (0, firestore_1.getFirestore)();
    const prevSubmission = before?.reportSubmission;
    const curSubmission = after.reportSubmission;
    // 1. Report submitted — notify the other player
    if (curSubmission?.status === 'pending_confirmation' &&
        prevSubmission?.status !== 'pending_confirmation') {
        await notifyOpponentOfSubmission(db, after, matchId, curSubmission);
        return;
    }
    // 2. Report confirmed — update rankings (PDF is handled by generateReport trigger)
    if (after.status === 'completed' && before?.status !== 'completed') {
        await recalculateRankings(after.divisionId);
        return;
    }
    // 3. Report disputed — notify division leader
    if (after.status === 'disputed' && before?.status !== 'disputed') {
        await notifyLeaderOfDispute(db, after, matchId);
        return;
    }
});
async function notifyOpponentOfSubmission(db, match, matchId, submission) {
    // The opponent is whichever player did NOT submit
    const opponentId = submission.submittedBy === match.player1Id ? match.player2Id : match.player1Id;
    // No notification for guest opponents
    if (!opponentId || opponentId === 'guest')
        return;
    const opponentSnap = await db.collection('users').doc(opponentId).get();
    const opponent = opponentSnap.data();
    if (!opponent?.fcmTokens?.length)
        return;
    const submitterSnap = await db.collection('users').doc(submission.submittedBy).get();
    const submitterName = submitterSnap.data()?.displayName ?? 'Your opponent';
    await (0, messaging_1.getMessaging)().sendEachForMulticast({
        tokens: opponent.fcmTokens,
        notification: {
            title: 'Match Report Submitted',
            body: `${submitterName} has submitted the match report. Review and confirm or dispute.`,
        },
        data: { type: 'report_submitted', matchId },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
}
async function notifyLeaderOfDispute(db, match, matchId) {
    const divisionSnap = await db.collection('divisions').doc(match.divisionId).get();
    const leaderId = divisionSnap.data()?.leaderId;
    if (!leaderId)
        return;
    const leaderSnap = await db.collection('users').doc(leaderId).get();
    const leader = leaderSnap.data();
    if (!leader?.fcmTokens?.length)
        return;
    await (0, messaging_1.getMessaging)().sendEachForMulticast({
        tokens: leader.fcmTokens,
        notification: {
            title: 'Match Report Disputed',
            body: 'A player has disputed a match report. Your resolution is needed.',
        },
        data: { type: 'report_disputed', matchId },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    await db.collection('matches').doc(matchId).update({
        'reportSubmission.leaderNotifiedAt': Date.now(),
    });
}
async function recalculateRankings(divisionId) {
    const db = (0, firestore_1.getFirestore)();
    const matchesSnap = await db
        .collection('matches')
        .where('divisionId', '==', divisionId)
        .where('status', '==', 'completed')
        .get();
    const matches = matchesSnap.docs.map((d) => d.data());
    const statsMap = new Map();
    const h2hAccum = new Map();
    for (const match of matches) {
        if (!match.winner)
            continue;
        if (match.player2IsGuest)
            continue; // skip unlinked guest matches
        const { player1Id, player2Id, liveScore, winner } = match;
        for (const pid of [player1Id, player2Id]) {
            if (!statsMap.has(pid)) {
                statsMap.set(pid, { matchesWon: 0, matchesLost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 });
            }
        }
        const { p1Sets, p2Sets, p1Games, p2Games } = (0, shared_1.extractMatchTotals)(liveScore.sets);
        const p1Won = winner === 'player1';
        const p1Stats = statsMap.get(player1Id);
        const p2Stats = statsMap.get(player2Id);
        if (p1Won) {
            p1Stats.matchesWon++;
            p2Stats.matchesLost++;
        }
        else {
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
        const h2hId = [player1Id, player2Id].sort().join('_');
        if (!h2hAccum.has(h2hId)) {
            h2hAccum.set(h2hId, {
                id: h2hId, divisionId,
                player1Id: [player1Id, player2Id].sort()[0],
                player2Id: [player1Id, player2Id].sort()[1],
                player1Wins: 0, player2Wins: 0,
            });
        }
        const h2h = h2hAccum.get(h2hId);
        const sortedIds = [player1Id, player2Id].sort();
        if (winner === 'player1') {
            if (player1Id === sortedIds[0])
                h2h.player1Wins++;
            else
                h2h.player2Wins++;
        }
        else {
            if (player2Id === sortedIds[0])
                h2h.player1Wins++;
            else
                h2h.player2Wins++;
        }
    }
    const divisionSnap = await db.collection('divisions').doc(divisionId).get();
    const division = divisionSnap.data();
    const playerIds = division?.playerIds ?? [...statsMap.keys()];
    const userSnaps = await Promise.all(playerIds.map((id) => db.collection('users').doc(id).get()));
    const displayNames = new Map(userSnaps.map((s) => [s.id, s.data()?.displayName ?? s.id]));
    const rankingInputs = playerIds.map((userId) => ({
        userId,
        displayName: displayNames.get(userId) ?? userId,
        divisionId,
        season: division?.season ?? '2024',
        ...(statsMap.get(userId) ?? { matchesWon: 0, matchesLost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 }),
    }));
    const rankings = (0, shared_1.computeRankings)(rankingInputs, [...h2hAccum.values()]);
    const batch = db.batch();
    for (const ranking of rankings) {
        const ref = db.collection('divisions').doc(divisionId).collection('rankings').doc(ranking.userId);
        batch.set(ref, { ...ranking, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    }
    for (const h2h of h2hAccum.values()) {
        const ref = db.collection('headToHead').doc(h2h.id);
        batch.set(ref, { ...h2h, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    }
    await batch.commit();
}
/**
 * HTTPS callable: division leader resolves a disputed report.
 * Forces the match to 'completed' and triggers rankings + PDF.
 */
exports.resolveDisputedReport = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const { matchId } = request.data;
    const db = (0, firestore_1.getFirestore)();
    const matchRef = db.collection('matches').doc(matchId);
    const matchSnap = await matchRef.get();
    const match = matchSnap.data();
    if (!match)
        throw new functions.https.HttpsError('not-found', 'Match not found');
    const isLeader = await checkIsLeader(request.auth.uid, match.divisionId);
    if (!isLeader) {
        throw new functions.https.HttpsError('permission-denied', 'Only the division leader can resolve disputes');
    }
    await matchRef.update({
        status: 'completed',
        'reportSubmission.status': 'confirmed',
        'reportSubmission.confirmedBy': request.auth.uid,
        'reportSubmission.confirmedAt': Date.now(),
    });
    return { success: true };
});
async function checkIsLeader(uid, divisionId) {
    const db = (0, firestore_1.getFirestore)();
    const divSnap = await db.collection('divisions').doc(divisionId).get();
    return divSnap.data()?.leaderId === uid;
}
//# sourceMappingURL=matchFunctions.js.map