import { Buffer } from 'buffer';
import {
  isAuthorized,
  readActiveAccountSession,
  redis,
  resend,
  type ApiRequest,
  type ApiResponse,
} from '../src/server/professor/shared.js';
import { cleanControlText, isSameOriginHeaders, parseLegacyJsonObject } from '../src/server/cloud/googleAuth.js';

const MAX_EMAIL_BODY_BYTES = 256_000;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader?.('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader?.('Vary', 'Cookie');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isSameOriginHeaders(req.headers)) {
    return res.status(403).json({ error: 'csrf_origin_mismatch' });
  }

  try {
    const authorized = isAuthorized(req);
    const account = authorized ? null : await readActiveAccountSession(req);
    if (!authorized && !account) {
      return res.status(401).json({ error: 'account_session_required' });
    }

    const parsedBody = parseLegacyJsonObject(req.body, { maxBytes: MAX_EMAIL_BODY_BYTES });
    if (parsedBody.ok === false) {
      return res.status(parsedBody.status).json({ error: parsedBody.error });
    }

    const { studentName: rawStudentName, chapterTitle, progressData } = parsedBody.data;
    const studentName = account
      ? cleanControlText(account.user.name || rawStudentName, 80)
      : cleanControlText(rawStudentName, 80);

    if (!studentName || !progressData) {
      return res.status(400).json({
        error: 'Missing required fields: studentName or progressData'
      });
    }

    // Rate limit per authenticated account (or admin), never spoofable by body.studentName
    const rlIdentity = authorized
      ? 'admin'
      : String(account?.user?.accountId || account?.claims?.sub || '').replace(/[^a-z0-9_-]/gi, '_');
    const rlKey = `rl:email:${rlIdentity}`;
    const count = await redis.incr(rlKey);
    if (count === 1) await redis.expire(rlKey, 3600);
    if (count > 5) {
      return res.status(429).json({ error: 'Trop d\'envois. Réessaie plus tard.' });
    }

    let parsedData: Record<string, any>;
    if (typeof progressData === 'string') {
      try {
        const parsed = JSON.parse(progressData);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return res.status(400).json({ error: 'invalid_progress_data' });
        }
        parsedData = parsed;
      } catch {
        return res.status(400).json({ error: 'invalid_progress_data' });
      }
    } else if (typeof progressData === 'object' && !Array.isArray(progressData)) {
      parsedData = progressData as Record<string, any>;
    } else {
      return res.status(400).json({ error: 'invalid_progress_data' });
    }

    const serializedJson = JSON.stringify(parsedData, null, 2);
    if (Buffer.byteLength(serializedJson, 'utf8') > MAX_EMAIL_BODY_BYTES) {
      return res.status(413).json({ error: 'payload_too_large' });
    }

    if (!resend) {
      return res.status(503).json({ error: 'email_service_unconfigured' });
    }

    // Extraction des données
    const result = (Array.isArray(parsedData.results) ? parsedData.results[0] : null) || {};
    const chapterName = cleanControlText(result.chapter || chapterTitle || 'Chapitre Inconnu', 120);

    // Données Leçon
    const lessonPct = Math.min(100, Math.max(0, Math.round(Number(result.lesson?.percentage) || 0)));
    const blanksCount = Math.max(0, Math.trunc(Number(result.lesson?.blanksRevealed) || 0));
    const revealedBlanksList = Array.isArray(result.lesson?.revealedBlanksList)
      ? result.lesson.revealedBlanksList.slice(0, 200)
      : [];

    // Données Quiz
    const quizScore = Math.min(100, Math.max(0, Math.round(Number(result.quiz?.score) || 0)));
    const quizRaw = cleanControlText(result.quiz?.scoreRaw || '? / ?', 40);
    const quizTimeSeconds = Math.max(0, Number(result.quiz?.durationSeconds || result.quizDurationSeconds) || 0);
    const quizTimeText = quizTimeSeconds > 0 ? `${Math.round(quizTimeSeconds / 60)} min` : 'N/A';

    // Données Exercices
    const exercisesStats = result.exercises?.stats || {};
    const exercisesCount = Math.max(0, Math.trunc(Number(exercisesStats.totalExercises) || 0));
    const completedSubQuestions = Math.max(0, Math.trunc(Number(exercisesStats.completedSubQuestions) || 0));
    const exercisesDetails = Array.isArray(result.exercises?.exercisesDetails)
      ? result.exercises.exercisesDetails.slice(0, 200)
      : [];

    const submissionDate = cleanControlText(parsedData.submissionDate || new Date().toLocaleString('fr-FR'), 60);

    const sanitizedName = studentName.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 48) || 'eleve';
    const timestamp = Date.now();
    const filename = `Rapport_${sanitizedName}_${timestamp}.json`;
    const jsonBuffer = Buffer.from(serializedJson, 'utf-8');
    const recipientEmail = process.env.RECIPIENT_EMAIL || 'bdh.malek@gmail.com';

    let exercisesTableHtml = '';
    if (exercisesDetails.length > 0) {
      exercisesTableHtml = `
        <div style="margin-top: 25px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #f9fafb; padding: 10px 15px; border-bottom: 1px solid #e5e7eb;">
            <h3 style="margin: 0; font-size: 14px; color: #374151;">Détail des Exercices</h3>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background-color: #ffffff; text-align: left; color: #6b7280;">
                <th style="padding: 10px 15px; border-bottom: 1px solid #f3f4f6; font-weight: 600;">Question ID</th>
                <th style="padding: 10px 15px; border-bottom: 1px solid #f3f4f6; font-weight: 600;">Ressenti</th>
                <th style="padding: 10px 15px; border-bottom: 1px solid #f3f4f6; font-weight: 600; text-align: center;">Indices</th>
              </tr>
            </thead>
            <tbody>
      `;

      exercisesDetails.forEach((ex: any) => {
        let badgeColor = '#e5e7eb';
        let textColor = '#374151';
        const mastery = cleanControlText(ex?.mastery || '', 32);

        if (mastery === 'Facile') { badgeColor = '#d1fae5'; textColor = '#065f46'; }
        else if (mastery === 'Moyen') { badgeColor = '#fef3c7'; textColor = '#92400e'; }
        else if (mastery === 'Difficile') { badgeColor = '#fee2e2'; textColor = '#b91c1c'; }
        else if (mastery === 'Non traité') { badgeColor = '#f1f5f9'; textColor = '#64748b'; }

        const hintsUsed = Math.max(0, Math.trunc(Number(ex?.hintsUsed) || 0));
        exercisesTableHtml += `
          <tr>
            <td style="padding: 10px 15px; border-bottom: 1px solid #f3f4f6; color: #111827;">${escapeHtml(cleanControlText(ex?.id || '', 80))}</td>
            <td style="padding: 10px 15px; border-bottom: 1px solid #f3f4f6;">
              <span style="background-color: ${badgeColor}; color: ${textColor}; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;">${escapeHtml(mastery)}</span>
            </td>
            <td style="padding: 10px 15px; border-bottom: 1px solid #f3f4f6; text-align: center; color: #4b5563;">${hintsUsed > 0 ? `<span style="color:#d97706; font-weight:bold;">${hintsUsed}</span>` : '0'}</td>
          </tr>
        `;
      });

      exercisesTableHtml += `</tbody></table></div>`;
    }

    let blanksHtml = '';
    if (revealedBlanksList.length > 0) {
      blanksHtml = `
        <div style="margin-top: 20px;">
          <p style="font-size: 12px; color: #6b7280; margin-bottom: 5px; font-weight: 600; text-transform: uppercase;">Concepts révisés (Trous dévoilés)</p>
          <div style="background-color: #f3f4f6; padding: 10px 15px; border-radius: 8px; font-size: 11px; color: #4b5563; line-height: 1.6; font-family: monospace;">
            ${revealedBlanksList.map((b: unknown) => escapeHtml(String(b ?? '').replace('blank-', '').slice(0, 80))).join(' &bull; ')}
          </div>
        </div>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px; color: #1f2937; }
            .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }
            .header { background: linear-gradient(135deg, #4D8A2E 0%, #6AAC43 100%); padding: 30px; text-align: center; color: white; }
            .header-title { font-size: 24px; font-weight: 700; margin: 0; }
            .content { padding: 30px; }
            .row { display: flex; border-bottom: 1px solid #f3f4f6; padding: 12px 0; align-items: center; }
            .row:last-child { border-bottom: none; }
            .label { flex: 1; color: #6b7280; font-weight: 500; font-size: 14px; }
            .value { font-weight: 700; color: #111827; font-size: 14px; }
            .highlight { background-color: #fef3c7; padding: 2px 8px; border-radius: 4px; color: #92400e; }
            .time-tag { font-size: 11px; color: #9ca3af; font-weight: normal; margin-left: 6px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1 class="header-title">Rapport d'Activité</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">${escapeHtml(chapterName)}</p>
            </div>
            <div class="content">
              <div class="row">
                <span class="label">Étudiant</span>
                <span class="value highlight">${escapeHtml(studentName)}</span>
              </div>
              <div class="row">
                <span class="label">Leçon (${lessonPct}%)</span>
                <span class="value">${blanksCount} concepts révélés</span>
              </div>
              <div class="row">
                <span class="label">Quiz</span>
                <span class="value">${escapeHtml(quizRaw)} (${quizScore}%) <span class="time-tag">${escapeHtml(quizTimeText)}</span></span>
              </div>
              <div class="row">
                <span class="label">Exercices</span>
                <span class="value">${exercisesCount} exercices, ${completedSubQuestions} questions</span>
              </div>
              <div class="row">
                <span class="label">Date</span>
                <span class="value" style="font-weight: 500;">${escapeHtml(submissionDate)}</span>
              </div>
              ${exercisesTableHtml}
              ${blanksHtml}
            </div>
          </div>
        </body>
      </html>
    `;

    const data = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'Math en tête <onboarding@resend.dev>',
      to: recipientEmail,
      subject: `📚 Rapport : ${studentName} - ${chapterName}`,
      html: htmlContent,
      attachments: [
        {
          filename,
          content: jsonBuffer,
        },
      ],
    });

    return res.status(200).json({
      success: true,
      messageId: data?.data?.id || 'unknown',
      message: 'Rapport envoyé avec succès'
    });

  } catch (error: any) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'internal_email_error' });
  }
}
