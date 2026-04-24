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
exports.generateMatchReport = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const app_1 = require("firebase-admin/app");
const pdf_lib_1 = require("pdf-lib");
const shared_1 = require("@tennis/shared");
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
exports.generateMatchReport = functions.firestore.onDocumentWritten('matches/{matchId}', async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after)
        return;
    if (before?.status === 'completed' || after.status !== 'completed')
        return;
    if (after.reportUrl)
        return; // Already generated
    const matchId = event.params.matchId;
    await createAndStoreReport(matchId, after);
});
async function createAndStoreReport(matchId, match) {
    const db = (0, firestore_1.getFirestore)();
    const [p1Snap, p2Snap] = await Promise.all([
        db.collection('users').doc(match.player1Id).get(),
        db.collection('users').doc(match.player2Id).get(),
    ]);
    const p1 = p1Snap.data();
    const p2 = p2Snap.data();
    const pdfDoc = await pdf_lib_1.PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    const { height } = page.getSize();
    let y = height - 60;
    const draw = (text, x, size, bold = false, color = (0, pdf_lib_1.rgb)(0, 0, 0)) => {
        page.drawText(text, { x, y, size, font: bold ? fontBold : font, color });
    };
    // Header
    draw('Tennis League — Match Report', 60, 20, true, (0, pdf_lib_1.rgb)(0.1, 0.4, 0.1));
    y -= 35;
    draw(new Date().toLocaleDateString('en-US', { dateStyle: 'long' }), 60, 11);
    y -= 30;
    // Players
    const winnerName = match.winner === 'player1' ? p1.displayName : p2.displayName;
    const loserName = match.winner === 'player1' ? p2.displayName : p1.displayName;
    draw(`Winner: ${winnerName}`, 60, 14, true);
    y -= 20;
    draw(`Opponent: ${loserName}`, 60, 14);
    y -= 30;
    // Score
    draw('Final Score', 60, 13, true);
    y -= 18;
    draw((0, shared_1.formatScoreDisplay)(match.liveScore), 60, 13);
    y -= 30;
    // Set breakdown
    draw('Set Breakdown', 60, 13, true);
    y -= 18;
    for (const set of match.liveScore.sets.filter(s => s.winner)) {
        let setStr = `  Set ${set.setNumber + 1}: ${set.player1Games}–${set.player2Games}`;
        if (set.tiebreak) {
            const loserPts = set.winner === 'player1' ? set.tiebreak.player2Points : set.tiebreak.player1Points;
            setStr += ` (${loserPts})`;
        }
        draw(setStr + `  — ${set.winner === 'player1' ? p1.displayName : p2.displayName} won`, 60, 11);
        y -= 16;
    }
    y -= 14;
    // Stats
    draw('Match Statistics', 60, 13, true);
    y -= 18;
    const statRows = [
        ['', p1.displayName, p2.displayName],
        ['Aces', String(match.stats.player1.aces), String(match.stats.player2.aces)],
        ['Double Faults', String(match.stats.player1.doubleFaults), String(match.stats.player2.doubleFaults)],
        ['Winners', String(match.stats.player1.winners), String(match.stats.player2.winners)],
        ['Unforced Errors', String(match.stats.player1.unforcedErrors), String(match.stats.player2.unforcedErrors)],
        ['Break Pts Won', String(match.stats.player1.breakPointsWon), String(match.stats.player2.breakPointsWon)],
    ];
    for (const [label, v1, v2] of statRows) {
        const isBold = label === '';
        draw(label, 60, 11, isBold);
        draw(v1, 300, 11, isBold);
        draw(v2, 430, 11, isBold);
        y -= 16;
    }
    // Footer
    y = 40;
    page.drawText('Generated by Tennis League App', { x: 60, y, size: 9, font, color: (0, pdf_lib_1.rgb)(0.5, 0.5, 0.5) });
    const pdfBytes = await pdfDoc.save();
    const bucket = (0, storage_1.getStorage)().bucket();
    const file = bucket.file(`reports/${matchId}.pdf`);
    await file.save(Buffer.from(pdfBytes), { contentType: 'application/pdf' });
    const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    await (0, firestore_1.getFirestore)().collection('matches').doc(matchId).update({ reportUrl: signedUrl });
}
//# sourceMappingURL=generateReport.js.map