import { query, stringifyJson } from "../pool.js";

export async function writeAudit({
  actorUserId = null,
  targetUserId = null,
  action,
  resourceType = null,
  resourceId = null,
  requestId = null,
  ipHash = null,
  userAgentHash = null,
  outcome = "success",
  metadata = null,
}) {
  await query(
    `INSERT INTO audit_logs (
      actor_user_id, target_user_id, action, resource_type, resource_id,
      request_id, ip_hash, user_agent_hash, outcome, metadata
    ) VALUES (
      :actorUserId, :targetUserId, :action, :resourceType, :resourceId,
      :requestId, :ipHash, :userAgentHash, :outcome, :metadata
    )`,
    {
      actorUserId,
      targetUserId,
      action,
      resourceType,
      resourceId,
      requestId,
      ipHash,
      userAgentHash,
      outcome,
      metadata: stringifyJson(metadata),
    },
  );
}
