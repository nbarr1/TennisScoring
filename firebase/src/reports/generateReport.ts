import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getApps, initializeApp } from 'firebase-admin/app';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Match, User } from '@tennis/shared';
import { EMPTY_STATS, formatScoreDisplay } from '@tennis/shared';

if (!getApps().length) initializeApp();

export const generateMatchReport = functions.firestore.onDocumentWritten(
  'matches/{matchId}',
  async (event) => {
    const before = event.data?.before?.data() as Match | undefined;
    const after = event.data?.after?.data() as Match | undefined;

    if (!after) return;
    if (before?.status === 'completed' || after.status !== 'completed') return;
    if (after.reportUrl) return; // Already generated

    const matchId = event.params.matchId;
    await createAndStoreReport(matchId, after);
  },
);

async function createAndStoreReport(matchId: string, match: Match) {
  const db = getFirestore();

  const [p1Snap, p2Snap] = await Promise.all([
    db.collection('users').doc(match.player1Id).get(),
    match.player2IsGuest
      ? Promise.resolve(null)
      : db.collection('users').doc(match.player2Id).get(),
  ]);
  const p1 = p1Snap.data() as User;
  const p2 = p2Snap?.data() as User | undefined;
  const p1Name = p1?.displayName ?? match.player1Name ?? 'Player 1';
  const p2Name = p2?.displayName ?? match.player2Name ?? 'Guest';
  const p1Stats = { ...EMPTY_STATS, ...match.stats.player1 };
  const p2Stats = { ...EMPTY_STATS, ...match.stats.player2 };
  const pct = (won: number, total: number) => (total > 0 ? `${Math.round((won / total) * 100)}%` : '—');
  const duration = (ms?: number) => {
    if (ms === undefined) return '—';
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();

  let y = height - 60;

  const draw = (
    text: string,
    x: number,
    size: number,
    bold = false,
    color = rgb(0, 0, 0),
  ) => {
    page.drawText(text, { x, y, size, font: bold ? fontBold : font, color });
  };

  // Header
  draw('Tennis League — Match Report', 60, 20, true, rgb(0.1, 0.4, 0.1));
  y -= 35;
  draw(new Date().toLocaleDateString('en-US', { dateStyle: 'long' }), 60, 11);
  y -= 30;

  // Players
  const winnerName = match.winner === 'player1' ? p1Name : p2Name;
  const loserName = match.winner === 'player1' ? p2Name : p1Name;
  draw(`Winner: ${winnerName}`, 60, 14, true);
  y -= 20;
  draw(`Opponent: ${loserName}`, 60, 14);
  y -= 30;

  // Score
  draw('Final Score', 60, 13, true);
  y -= 18;
  draw(formatScoreDisplay(match.liveScore), 60, 13);
  y -= 30;

  // Set breakdown
  draw('Set Breakdown', 60, 13, true);
  y -= 18;
  for (const [index, set] of match.liveScore.sets
    .filter((s) => s.winner)
    .entries()) {
    let setStr = `  Set ${index + 1}: ${set.player1Games}–${set.player2Games}`;
    if (set.tiebreak) {
      const loserPts =
        set.winner === 'player1'
          ? set.tiebreak.player2Points
          : set.tiebreak.player1Points;
      setStr += ` (${loserPts})`;
    }
    draw(
      setStr + `  — ${set.winner === 'player1' ? p1Name : p2Name} won`,
      60,
      11,
    );
    y -= 16;
  }
  y -= 14;

  // Stats
  draw('Match Statistics', 60, 13, true);
  y -= 18;
  const statRows: [string, string, string][] = [
    ['', p1Name, p2Name],
    [
      'Receiving Pts Won',
      pct(p1Stats.receivingPointsWon, p1Stats.receivingPointsTotal),
      pct(p2Stats.receivingPointsWon, p2Stats.receivingPointsTotal),
    ],
    [
      'Break Pts Won',
      `${p1Stats.breakPointsWon}/${p1Stats.breakPointsFaced}`,
      `${p2Stats.breakPointsWon}/${p2Stats.breakPointsFaced}`,
    ],
    ...(match.advancedStatsEnabled
      ? ([
          ['Aces', String(p1Stats.aces), String(p2Stats.aces)],
          ['Double Faults', String(p1Stats.doubleFaults), String(p2Stats.doubleFaults)],
          ['Winners', String(p1Stats.winners), String(p2Stats.winners)],
          ['Unforced Errors', String(p1Stats.unforcedErrors), String(p2Stats.unforcedErrors)],
        ] as [string, string, string][])
      : []),
  ];
  for (const [label, v1, v2] of statRows) {
    const isBold = label === '';
    draw(label, 60, 11, isBold);
    draw(v1, 300, 11, isBold);
    draw(v2, 430, 11, isBold);
    y -= 16;
  }

  y -= 10;
  draw('Elapsed Time', 60, 13, true);
  y -= 18;
  for (const set of match.liveScore.sets.filter((s) => s.winner)) {
    draw(`Set ${set.setNumber + 1}: ${duration(set.durationMs)}`, 60, 11);
    y -= 16;
  }
  draw(`Match: ${duration(match.matchDurationMs)}`, 60, 11, true);

  // Footer
  y = 40;
  page.drawText('Generated by Tennis League App', {
    x: 60,
    y,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  const bucket = getStorage().bucket();
  const file = bucket.file(`reports/${matchId}.pdf`);
  await file.save(Buffer.from(pdfBytes), { contentType: 'application/pdf' });

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
  });

  await getFirestore()
    .collection('matches')
    .doc(matchId)
    .update({ reportUrl: signedUrl });
}
