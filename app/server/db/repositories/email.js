import { affectedRows, parseJson, query, withTransaction } from "../pool.js";

export async function releaseExpiredEmailLeases() {
  const result = await query(
    `UPDATE email_outbox
     SET status = 'pending', lease_owner = NULL, lease_expires_at = NULL,
         available_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 60 SECOND)
     WHERE status = 'sending' AND lease_expires_at < UTC_TIMESTAMP(3)`,
  );
  return affectedRows(result);
}

export async function claimNextEmail(workerId, leaseSeconds = 120) {
  return withTransaction(async (connection) => {
    const [[row]] = await connection.query(
      `SELECT * FROM email_outbox
       WHERE status = 'pending' AND available_at <= UTC_TIMESTAMP(3)
         AND (lease_expires_at IS NULL OR lease_expires_at < UTC_TIMESTAMP(3))
       ORDER BY created_at ASC
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!row) return null;
    await connection.execute(
      `UPDATE email_outbox
       SET status = 'sending', lease_owner = ?,
           lease_expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND),
           attempt_count = attempt_count + 1
       WHERE id = ?`,
      [workerId, leaseSeconds, row.id],
    );
    return {
      id: row.id,
      userId: row.user_id,
      template: row.template,
      recipient: row.recipient,
      subject: row.subject,
      payload: parseJson(row.payload, {}),
      attemptCount: Number(row.attempt_count) + 1,
    };
  });
}

export async function markEmailSent(emailId, workerId) {
  const result = await query(
    `UPDATE email_outbox
     SET status = 'sent', sent_at = UTC_TIMESTAMP(3),
         lease_owner = NULL, lease_expires_at = NULL, last_error = NULL
     WHERE id = :emailId AND lease_owner = :workerId AND status = 'sending'`,
    { emailId, workerId },
  );
  return affectedRows(result) === 1;
}

export async function markEmailFailed(email, workerId, errorMessage) {
  const permanent = email.attemptCount >= 8;
  const delayMinutes = Math.min(360, 2 ** Math.min(email.attemptCount, 8));
  const result = await query(
    `UPDATE email_outbox
     SET status = :status,
         available_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL :delayMinutes MINUTE),
         lease_owner = NULL, lease_expires_at = NULL,
         last_error = :errorMessage
     WHERE id = :emailId AND lease_owner = :workerId AND status = 'sending'`,
    {
      status: permanent ? "failed" : "pending",
      delayMinutes,
      errorMessage: String(errorMessage).slice(0, 4000),
      emailId: email.id,
      workerId,
    },
  );
  return affectedRows(result) === 1;
}
