// ============================================================
//  AI フィードバック
// ============================================================
function tryProcessPendingAiInline_(source) {
  const persistRetryResult = flushAiPersistRetryQueue_(String(source || 'inline'));
  if (persistRetryResult.remaining > 0) {
    return { ok: true, processed: persistRetryResult.processed || 0, source, skipped: 'persist_retry_pending' };
  }
  if ((persistRetryResult.processed || 0) > 0 && !hasPendingAiResponses_()) {
    return { ok: true, processed: persistRetryResult.processed || 0, source, skipped: 'persist_retry_applied' };
  }
  if (!hasPendingAiResponses_()) {
    const aggregateResult = maybeFlushAiAggregateQueue_(String(source || 'inline'));
    if ((aggregateResult.processed || 0) > 0 || (aggregateResult.remaining || 0) > 0) {
      return { ok: true, processed: aggregateResult.processed || 0, source, skipped: aggregateResult.remaining > 0 ? 'aggregate_pending' : 'aggregate_applied' };
    }
  }
  if (!hasPendingAiResponses_()) {
    return { ok: true, skipped: 'no_pending' };
  }
  const props = PropertiesService.getScriptProperties();
  const inlineSource = String(source || 'inline');
  if (inlineSource === 'teacher_queue') {
    const lastTeacherKickAtMs = Number(props.getProperty(AI_TEACHER_QUEUE_KICK_AT_KEY) || 0);
    if (lastTeacherKickAtMs && (Date.now() - lastTeacherKickAtMs) < AI_TEACHER_QUEUE_COOLDOWN_MS) {
      return { ok: true, skipped: 'teacher_cooldown' };
    }
  }
  const lastKickAtMs = Number(props.getProperty(AI_INLINE_KICK_AT_KEY) || 0);
  if (lastKickAtMs && (Date.now() - lastKickAtMs) < AI_INLINE_COOLDOWN_MS) {
    return { ok: true, skipped: 'cooldown' };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    maybeWriteInlineBusyLog_(source);
    return { ok: false, skipped: 'lock_busy' };
  }

    let claimed = [];
    let batchId = '';
    try {
      props.setProperty(AI_INLINE_KICK_AT_KEY, String(Date.now()));
      if (inlineSource === 'teacher_queue') {
        props.setProperty(AI_TEACHER_QUEUE_KICK_AT_KEY, String(Date.now()));
      }
      writeAiEventLogs_([{
        eventType: 'inline_kick_attempt',
        aiStatus: 'pending',
        detail: inlineSource,
        timestamp: nowIso_(),
      }]);
      claimed = claimPendingResponsesForBatch_(AI_BATCH_MAX_ITEMS);
      if (!claimed.length) {
        maybeWriteInlineEmptyLog_(source);
        return { ok: true, processed: 0, source };
      }
    batchId = makeId_('aibatch');
    writeAiEventLogs_(buildAiItemEvents_(claimed, 'inline_claimed', {
      batchId,
      aiStatus: 'processing',
      detail: String(source || 'inline'),
      timestamp: nowIso_(),
    }));
  } finally {
    lock.releaseLock();
  }

  return processClaimedAiBatch_(claimed, batchId, source || 'inline');
}

function maybeWriteInlineBusyLog_(source) {
  const props = PropertiesService.getScriptProperties();
  const nowMs = Date.now();
  const lastLoggedAtMs = Number(props.getProperty(AI_INLINE_BUSY_LOG_AT_KEY) || 0);
  if (lastLoggedAtMs && (nowMs - lastLoggedAtMs) < AI_INLINE_BUSY_LOG_MS) return;
  props.setProperty(AI_INLINE_BUSY_LOG_AT_KEY, String(nowMs));
  writeAiEventLogs_([{
    eventType: 'inline_lock_busy',
    aiStatus: 'pending',
    detail: String(source || 'inline'),
    timestamp: nowIso_(),
  }]);
}

function ensureAiBatchTrigger_(delayMs) {
  const props = PropertiesService.getScriptProperties();
  const desiredDelayMs = Math.max(500, Number(delayMs || AI_BATCH_WINDOW_MS));
  const desiredAtMs = Date.now() + desiredDelayMs;
  const scheduledAtMs = Number(props.getProperty(AI_BATCH_TRIGGER_AT_KEY) || 0);
  if (scheduledAtMs && desiredAtMs >= (scheduledAtMs - 300)) return false;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(AI_TRIGGER_LOCK_MS)) {
    maybeWriteTriggerBusyLog_();
    return false;
  }
  try {
    const triggers = ScriptApp.getProjectTriggers()
      .filter(trigger => trigger.getHandlerFunction() === AI_BATCH_HANDLER);
    const refreshedScheduledAtMs = Number(props.getProperty(AI_BATCH_TRIGGER_AT_KEY) || 0);
    if (triggers.length > 0 && refreshedScheduledAtMs && desiredAtMs >= (refreshedScheduledAtMs - 300)) return false;
    triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
    ScriptApp.newTrigger(AI_BATCH_HANDLER).timeBased().after(desiredDelayMs).create();
    props.setProperty(AI_BATCH_TRIGGER_AT_KEY, String(desiredAtMs));
    writeAiEventLogs_([{
      eventType: 'trigger_scheduled',
      aiStatus: 'pending',
      detail: `delayMs=${desiredDelayMs} scheduledAtMs=${desiredAtMs} activeTriggers=${triggers.length}`,
      timestamp: nowIso_(),
    }]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function safeEnsureAiBatchTrigger_(delayMs, source) {
  try {
    return ensureAiBatchTrigger_(delayMs);
  } catch (err) {
    try {
      writeAiEventLogs_([{
        eventType: 'trigger_schedule_failed',
        aiStatus: 'pending',
        detail: `${String(source || 'unknown')}: ${String(err && err.message ? err.message : err).slice(0, 220)}`,
        timestamp: nowIso_(),
      }]);
    } catch (ignored) {
      // Do not fail a saved submission because fallback scheduling telemetry failed.
    }
    return false;
  }
}

function maybeWriteTriggerBusyLog_() {
  const props = PropertiesService.getScriptProperties();
  const nowMs = Date.now();
  const lastLoggedAtMs = Number(props.getProperty(AI_TRIGGER_BUSY_LOG_AT_KEY) || 0);
  if (lastLoggedAtMs && (nowMs - lastLoggedAtMs) < AI_TRIGGER_BUSY_LOG_MS) return;
  props.setProperty(AI_TRIGGER_BUSY_LOG_AT_KEY, String(nowMs));
  writeAiEventLogs_([{
    eventType: 'trigger_lock_busy',
    aiStatus: 'pending',
    detail: 'ensureAiBatchTrigger skipped',
    timestamp: nowIso_(),
  }]);
}

function maybeWriteAiSparseLog_(keyName, windowMs, builder) {
  const props = PropertiesService.getScriptProperties();
  const nowMs = Date.now();
  const lastLoggedAtMs = Number(props.getProperty(keyName) || 0);
  if (lastLoggedAtMs && (nowMs - lastLoggedAtMs) < windowMs) return;
  props.setProperty(keyName, String(nowMs));
  const event = builder && builder();
  if (event) writeAiEventLogs_([event]);
}

function maybeWriteInlineEmptyLog_(source) {
  maybeWriteAiSparseLog_(AI_EMPTY_LOG_AT_KEY, AI_EMPTY_LOG_MS, () => ({
    eventType: 'inline_empty',
    aiStatus: 'pending',
    detail: String(source || 'inline'),
    timestamp: nowIso_(),
  }));
}

function maybeWriteBatchHandlerEmptyLog_(batchId) {
  maybeWriteAiSparseLog_(AI_EMPTY_LOG_AT_KEY, AI_EMPTY_LOG_MS, () => ({
    batchId: batchId || '',
    eventType: 'batch_handler_empty',
    aiStatus: 'processing',
    detail: 'no claimable responses',
    timestamp: nowIso_(),
  }));
}

function maybeWriteClaimBusyLog_(limit) {
  maybeWriteAiSparseLog_(AI_CLAIM_BUSY_LOG_AT_KEY, AI_CLAIM_BUSY_LOG_MS, () => ({
    eventType: 'claim_lock_busy',
    aiStatus: 'pending',
    detail: `limit=${Number(limit || 0)}`,
    timestamp: nowIso_(),
  }));
}

function clearAiBatchTriggers_() {
  PropertiesService.getScriptProperties().deleteProperty(AI_BATCH_TRIGGER_AT_KEY);
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === AI_BATCH_HANDLER)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}

function getAiBatchDelayForSubmission_() {
  return AI_TRIGGER_RESCUE_DELAY_MS;
}

function getPendingAiSubmissionCount_() {
  return getResponseSheetData_().rows.filter(row => {
    const submitted = row[8] === true;
    const reviewText = String(row[7] || '').trim();
    const aiStatus = String(row[16] || '');
    return submitted && reviewText && (aiStatus === 'pending' || isOrphanedAiResponseRow_(row));
  }).length;
}

function processPendingAiBatch() {
  const handlerRunId = makeId_('airun');
  writeAiEventLogs_([{
    batchId: handlerRunId,
    eventType: 'batch_handler_entered',
    aiStatus: 'processing',
    detail: 'processPendingAiBatch entered',
    timestamp: nowIso_(),
  }]);
  clearAiBatchTriggers_();
  const persistRetryResult = flushAiPersistRetryQueue_('time_trigger');
  if (persistRetryResult.remaining > 0) {
    return { ok: true, processed: persistRetryResult.processed || 0, persistRetryPending: true };
  }
  if ((persistRetryResult.processed || 0) > 0 && !hasPendingAiResponses_()) {
    return { ok: true, processed: persistRetryResult.processed || 0, persistRetryApplied: true };
  }
  if (!hasPendingAiResponses_()) {
    const aggregateResult = maybeFlushAiAggregateQueue_('time_trigger');
    if ((aggregateResult.processed || 0) > 0 || (aggregateResult.remaining || 0) > 0) {
      return { ok: true, processed: aggregateResult.processed || 0, aggregatePending: aggregateResult.remaining > 0 };
    }
  }
  const claimed = claimPendingResponsesForBatch_(AI_BATCH_MAX_ITEMS);
  if (!claimed.length) {
    maybeWriteBatchHandlerEmptyLog_(handlerRunId);
    return { ok: true, processed: 0 };
  }

  const batchId = makeId_('aibatch');
  const updates = [];
  writeAiEventLogs_([{
    batchId,
    eventType: 'batch_claimed',
    aiStatus: 'processing',
    detail: `claimed=${claimed.length}`,
    timestamp: nowIso_(),
  }]);
  return processClaimedAiBatch_(claimed, batchId, 'time_trigger', updates);
}

function processClaimedAiBatch_(claimed, batchId, source, existingUpdates) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const updates = existingUpdates || [];
  try {
    if (!apiKey) {
      claimed.forEach(item => {
        updates.push(buildAiErrorUpdate_(item, batchId, 'APIキーが未設定です。先生に伝えてね。'));
      });
    } else {
      processAiItemsWithFallback_(claimed, apiKey, batchId, updates);
    }
  } catch (err) {
    claimed.forEach(item => {
      updates.push(buildAiFailureUpdate_(item, batchId, `AI処理エラー: ${String(err)}`));
    });
  }

  try {
    applyAiUpdatesBatch_(updates);
  } catch (err) {
    recoverClaimedAiBatchAfterPersistFailure_(claimed, updates, batchId, err);
    return {
      ok: false,
      processed: 0,
      source,
      error: `AI結果の保存に失敗: ${String(err && err.message ? err.message : err)}`,
    };
  }

    try {
      writeAiEventsForUpdates_(updates);
    } catch (err) {
      writeAiBatchLevelEvent_('result_event_write_failed', 'processing', String(err && err.message ? err.message : err), {
        batchId,
        claimed,
      });
    }
    try {
      enqueueAggregateForAiUpdates_(updates);
    } catch (err) {
      writeAiBatchLevelEvent_('aggregate_enqueue_failed', 'processing', String(err && err.message ? err.message : err), {
        batchId,
        claimed,
      });
    }

  if (hasPendingAiResponses_()) {
    const nextDelayMs = hasRetryPendingUpdates_(updates)
      ? AI_TRIGGER_RETRY_RESCUE_DELAY_MS
      : AI_TRIGGER_DRAIN_DELAY_MS;
    safeEnsureAiBatchTrigger_(nextDelayMs, 'processClaimedAiBatch');
  } else {
    clearAiBatchTriggers_();
  }
  return { ok: true, processed: updates.length, source };
}

function recoverClaimedAiBatchAfterPersistFailure_(claimed, updates, batchId, err) {
  const errorText = `AI結果の保存に失敗したため再実行します: ${String(err && err.message ? err.message : err)}`;
  writeAiBatchLevelEvent_('result_save_failed', 'processing', errorText, {
    batchId,
    claimed,
  });

  try {
    storeAiPersistRetryUpdates_(batchId, updates, errorText);
  } catch (storeErr) {
    writeAiBatchLevelEvent_('persist_retry_store_failed', 'processing', String(storeErr && storeErr.message ? storeErr.message : storeErr), {
      batchId,
      claimed,
    });
  }
  safeEnsureAiBatchTrigger_(AI_TRIGGER_SHORT_RESCUE_DELAY_MS, 'recoverClaimedAiBatchAfterPersistFailure');
}

function flushAiPersistRetryQueue_(source) {
  const entries = loadAiPersistRetryEntries_();
  if (!entries.length) return { processed: 0, remaining: 0 };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return { processed: 0, remaining: entries.length, skipped: 'lock_busy' };
  try {
    return processAiPersistRetryQueueUnsafe_(entries, source);
  } finally {
    lock.releaseLock();
  }
}

function processAiPersistRetryQueueUnsafe_(entries, source) {
  let processed = 0;
  let remaining = 0;
  (entries || []).forEach(entry => {
    if (!entry || !entry.batchId || !Array.isArray(entry.updates) || !entry.updates.length) {
      clearAiPersistRetryEntry_(entry && entry.batchId);
      return;
    }
    try {
      applyAiUpdatesBatch_(entry.updates);
      try {
        writeAiEventsForUpdates_(entry.updates);
      } catch (eventErr) {
        writeAiBatchLevelEvent_('persist_retry_event_failed', 'processing', String(eventErr && eventErr.message ? eventErr.message : eventErr), {
          batchId: entry.batchId,
          claimed: entry.updates,
        });
      }
        try {
          enqueueAggregateForAiUpdates_(entry.updates);
        } catch (aggregateErr) {
          writeAiBatchLevelEvent_('persist_retry_aggregate_enqueue_failed', 'processing', String(aggregateErr && aggregateErr.message ? aggregateErr.message : aggregateErr), {
            batchId: entry.batchId,
            claimed: entry.updates,
          });
        }
      clearAiPersistRetryEntry_(entry.batchId);
      processed += entry.updates.length;
      writeAiBatchLevelEvent_('persist_retry_applied', 'done', String(source || 'persist_retry'), {
        batchId: entry.batchId,
        claimed: entry.updates,
      });
    } catch (retryErr) {
      remaining += 1;
      writeAiBatchLevelEvent_('persist_retry_failed', 'processing', String(retryErr && retryErr.message ? retryErr.message : retryErr), {
        batchId: entry.batchId,
        claimed: entry.updates,
      });
    }
  });
  if (remaining > 0) {
    safeEnsureAiBatchTrigger_(AI_TRIGGER_SHORT_RESCUE_DELAY_MS, 'processAiPersistRetryQueue');
  }
  return { processed, remaining };
}

function getAiPersistRetryPropKey_(batchId) {
  return `AI_PERSIST_RETRY_${String(batchId || '').trim()}`;
}

function loadAiPersistRetryBatchIds_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(AI_PERSIST_RETRY_INDEX_KEY) || '[]';
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch (err) {
    return [];
  }
}

function saveAiPersistRetryBatchIds_(batchIds) {
  PropertiesService.getScriptProperties().setProperty(
    AI_PERSIST_RETRY_INDEX_KEY,
    JSON.stringify(Array.from(new Set((batchIds || []).filter(Boolean))))
  );
}

function storeAiPersistRetryUpdates_(batchId, updates, errorText) {
  const safeBatchId = String(batchId || '').trim();
  if (!safeBatchId) throw new Error('batchId is required');
  const safeUpdates = Array.isArray(updates) ? updates.filter(Boolean) : [];
  if (!safeUpdates.length) return;
  const props = PropertiesService.getScriptProperties();
  const payload = {
    batchId: safeBatchId,
    errorText: String(errorText || '').slice(0, 500),
    storedAt: nowIso_(),
    updates: safeUpdates,
  };
  props.setProperty(getAiPersistRetryPropKey_(safeBatchId), JSON.stringify(payload));
  const ids = loadAiPersistRetryBatchIds_();
  ids.push(safeBatchId);
  saveAiPersistRetryBatchIds_(ids);
}

function loadAiPersistRetryEntries_() {
  const props = PropertiesService.getScriptProperties();
  return loadAiPersistRetryBatchIds_().map(batchId => {
    const raw = props.getProperty(getAiPersistRetryPropKey_(batchId));
    if (!raw) return { batchId, updates: [] };
    try {
      const parsed = JSON.parse(raw);
      return {
        batchId,
        updates: Array.isArray(parsed?.updates) ? parsed.updates : [],
        errorText: parsed?.errorText || '',
        storedAt: parsed?.storedAt || '',
      };
    } catch (err) {
      return { batchId, updates: [] };
    }
  });
}

function clearAiPersistRetryEntry_(batchId) {
  const safeBatchId = String(batchId || '').trim();
  if (!safeBatchId) return;
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(getAiPersistRetryPropKey_(safeBatchId));
  const ids = loadAiPersistRetryBatchIds_().filter(id => String(id) !== safeBatchId);
  saveAiPersistRetryBatchIds_(ids);
}

function writeAiBatchLevelEvent_(eventType, aiStatus, detail, options) {
  const claimed = Array.isArray(options?.claimed) ? options.claimed : [];
  const timestamp = nowIso_();
  const rows = claimed.length
    ? claimed.map(item => ({
        responseId: item.responseId || '',
        lessonId: item.lessonId || '',
        unitId: item.unitId || '',
        studentId: item.studentId || '',
        studentNumber: item.studentNumber || '',
        studentName: item.studentName || '',
        batchId: options?.batchId || '',
        eventType,
        aiStatus: aiStatus || '',
        detail: String(detail || '').slice(0, 220),
        timestamp,
        retryCount: Number(item.aiRetryCount || 0),
      }))
    : [{
        batchId: options?.batchId || '',
        eventType,
        aiStatus: aiStatus || '',
        detail: String(detail || '').slice(0, 220),
        timestamp,
      }];
  writeAiEventLogs_(rows);
}

function claimPendingResponsesForBatch_(limit) {
  const lessonMap = getLessonClaimMetaMap_();
  const units = getAllUnits();
  const unitMap = {};
  units.forEach(unit => { unitMap[String(unit.id)] = unit; });
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(AI_CLAIM_LOCK_MS)) {
    maybeWriteClaimBusyLog_(limit);
    return [];
  }
  let claimed = [];
  try {
    const sheet = getResponsesDbSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    const rows = sheet.getRange(2, 1, lastRow - 1, RESPONSE_HEADERS.length).getValues();
    const queuedAt = nowIso_();
    let dirty = false;
    for (let i = rows.length - 1; i >= 0 && claimed.length < limit; i--) {
      const row = rows[i];
      const submitted = row[8] === true;
      const aiStatus = String(row[16] || '');
      const reviewText = String(row[7] || '').trim();
      const aiProcessedAt = row[18] || '';
      const aiStartedAt = row[22] || '';
      const claimable = isAiQueueClaimableStatus_(aiStatus, aiProcessedAt, aiStartedAt) || isOrphanedAiResponseRow_(row);
      if (!submitted || !reviewText || !claimable) continue;

      const lesson = lessonMap[String(row[1] || '')] || { lessonId: row[1] || '', unitId: row[2] || '', period: '' };
      row[16] = 'processing';
      row[17] = row[17] || queuedAt;
      row[18] = queuedAt;
      row[19] = '';
      row[20] = '';
      row[21] = Number(row[21] || 0);
      row[22] = queuedAt;
      row[23] = 0;
      row[24] = 0;
      dirty = true;
      claimed.push({
        rowNumber: i + 2,
        responseId: row[0] || '',
        lessonId: row[1] || '',
        unitId: row[2] || lesson.unitId || '',
        period: lesson.period || '',
        studentId: row[3] || '',
        studentNumber: row[4] || '',
        studentName: row[5] || '',
        reviewText,
        isRewrite: row[14] === true,
        aiRetryCount: Number(row[21] || 0),
        aiStartedAt: queuedAt,
        answersJson: row[6] || '',
      });
    }

    if (dirty) {
      sheet.getRange(2, 1, rows.length, RESPONSE_HEADERS.length).setValues(rows);
      writeAiEventLogs_(buildAiItemEvents_(claimed, 'processing_started', {
        aiStatus: 'processing',
        detail: `claimed ${claimed.length} item(s)`,
        timestamp: queuedAt,
      }));
    }
  } finally {
    lock.releaseLock();
  }
  claimed = claimed.map(item => {
    const lesson = lessonMap[String(item.lessonId || '')] || { lessonId: item.lessonId || '', unitId: item.unitId || '', period: '' };
    const unit = unitMap[String(item.unitId || lesson.unitId || '')] || null;
    const fields = getEnabledFields_(unit || {});
    const answersMap = parseAnswersJson_(item.answersJson);
    return {
      ...item,
      unitId: item.unitId || lesson.unitId || '',
      period: lesson.period || '',
      customText: buildCustomTextFromAnswers_(fields, answersMap),
    };
  });
  return claimed;
}

function hasPendingAiResponses_() {
  const rows = getResponseSheetData_().rows;
  return rows.some(row => {
    const aiStatus = String(row[16] || '');
    return row[8] === true
      && String(row[7] || '').trim()
      && (isAiQueueClaimableStatus_(aiStatus, row[18] || '', row[22] || '') || isOrphanedAiResponseRow_(row));
  });
}

function getLessonClaimMetaMap_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'LESSON_CLAIM_META_V1';
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (err) {
    // ignore cache parse errors
  }
  const sheet = getLessonsDbSheet_();
  const lastRow = sheet.getLastRow();
  const lessonMap = {};
  if (lastRow > 1) {
    const rows = sheet.getRange(2, 1, lastRow - 1, LESSON_HEADERS.length).getValues();
    rows.forEach(row => {
      lessonMap[String(row[0] || '')] = {
        lessonId: row[0] || '',
        unitId: row[1] || '',
        period: row[2] || '',
      };
    });
  }
  try {
    cache.put(cacheKey, JSON.stringify(lessonMap), 120);
  } catch (err) {
    // ignore cache write errors
  }
  return lessonMap;
}

function getAiQueueHealth_() {
  const rows = getResponseSheetData_().rows;
  let oldestQueuedAtMs = Infinity;
  let pendingCount = 0;
  let staleCount = 0;
  let maxRetryCount = 0;
  rows.forEach(row => {
    const aiStatus = String(row[16] || '');
    const submitted = row[8] === true;
    const reviewText = String(row[7] || '').trim();
    if (!submitted || !reviewText) return;
    if (isAiQueueClaimableStatus_(aiStatus, row[18] || '', row[22] || '') || isOrphanedAiResponseRow_(row)) {
      pendingCount++;
      if (isStaleAiProcessing_(aiStatus, row[18] || '', row[22] || '')) staleCount++;
      maxRetryCount = Math.max(maxRetryCount, Number(row[21] || 0));
      const ts = Date.parse(row[17] || row[18] || '');
      if (Number.isFinite(ts) && ts < oldestQueuedAtMs) oldestQueuedAtMs = ts;
    }
  });
  return {
    pendingCount,
    staleCount,
    triggerCount: ScriptApp.getProjectTriggers()
      .filter(trigger => trigger.getHandlerFunction() === AI_BATCH_HANDLER)
      .length,
    oldestQueuedAtMs: Number.isFinite(oldestQueuedAtMs) ? oldestQueuedAtMs : null,
    maxRetryCount,
  };
}

function ensureAiQueueLiveness_() {
  rescueOrphanedAiResponses_();
  const health = getAiQueueHealth_();
  if (!health.pendingCount) return health;
  const oldestAgeMs = health.oldestQueuedAtMs ? Date.now() - health.oldestQueuedAtMs : 0;
  if (health.triggerCount === 0 && oldestAgeMs >= AI_QUEUE_SELF_HEAL_MS) {
    safeEnsureAiBatchTrigger_(AI_TRIGGER_RETRY_RESCUE_DELAY_MS, 'queue_liveness_missing_trigger');
  } else if (health.triggerCount > 0 && oldestAgeMs >= AI_BATCH_TRIGGER_STALE_MS) {
    clearAiBatchTriggers_();
    safeEnsureAiBatchTrigger_(AI_TRIGGER_RETRY_RESCUE_DELAY_MS, 'queue_liveness_stale_trigger');
  }
  return health;
}

function isAiQueueClaimableStatus_(aiStatus, aiProcessedAt, aiStartedAt) {
  return String(aiStatus || '') === 'pending' || isStaleAiProcessing_(aiStatus, aiProcessedAt, aiStartedAt);
}

function isOrphanedAiResponseRow_(row) {
  const submitted = row[8] === true;
  const reviewText = String(row[7] || '').trim();
  const aiStatus = String(row[16] || '').trim();
  const comment = String(row[13] || '').trim();
  return submitted && reviewText && !aiStatus && !comment;
}

function rescueOrphanedAiResponses_() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(500)) return 0;
  try {
    const sheet = getResponsesDbSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 0;
    const rows = sheet.getRange(2, 1, lastRow - 1, RESPONSE_HEADERS.length).getValues();
    const queuedAt = nowIso_();
    let changed = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!isOrphanedAiResponseRow_(row)) continue;
      row[16] = 'pending';
      row[17] = row[17] || queuedAt;
      row[18] = '';
      row[19] = '';
      row[20] = '';
      row[21] = 0;
      row[22] = '';
      row[23] = 0;
      row[24] = 0;
      changed++;
    }
    if (changed) {
      sheet.getRange(2, 1, rows.length, RESPONSE_HEADERS.length).setValues(rows);
    }
    return changed;
  } finally {
    lock.releaseLock();
  }
}

function isStaleAiProcessing_(aiStatus, aiProcessedAt, aiStartedAt) {
  if (String(aiStatus || '') !== 'processing') return false;
  const ts = Date.parse(aiStartedAt || aiProcessedAt || '');
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts >= AI_PROCESSING_STALE_MS;
}

function processAiItemsWithFallback_(items, apiKey, batchId, updates) {
  const immediate = [];
  const toModel = [];

  items.forEach(item => {
    const quick = buildImmediateAiResult_(item);
    if (quick) {
      immediate.push(buildAiSuccessUpdate_(item, batchId, quick));
    } else {
      toModel.push(item);
    }
  });

  immediate.forEach(update => updates.push(update));
  if (!toModel.length) return;

  if (toModel.length <= 1) {
    updates.push(runAiForSingleItem_(toModel[0], apiKey, batchId));
    return;
  }

  try {
    writeAiEventLogs_(buildAiItemEvents_(toModel, 'api_request_started', {
      batchId,
      aiStatus: 'processing',
      detail: `batch size=${toModel.length}`,
    }));
    const requestStartedAtMs = Date.now();
    const batchResults = runAiBatchRequest_(toModel, apiKey);
    const timing = { modelLatencyMs: Date.now() - requestStartedAtMs };
    writeAiEventLogs_(buildAiItemEvents_(toModel, 'api_request_finished', {
      batchId,
      aiStatus: 'processing',
      detail: `batch ok size=${toModel.length}`,
      modelLatencyMs: timing.modelLatencyMs,
    }));
    const resultMap = {};
    batchResults.forEach(result => { resultMap[String(result.responseId || '')] = result; });
    toModel.forEach(item => {
      const result = resultMap[String(item.responseId)];
      if (!result) throw new Error('batch result missing responseId');
      updates.push(buildAiSuccessUpdate_(item, batchId, result, timing));
    });
  } catch (err) {
    writeAiEventLogs_(buildAiItemEvents_(toModel, 'api_request_failed', {
      batchId,
      aiStatus: 'processing',
      detail: String(err),
    }));
    if (isRetriableAiErrorText_(err)) {
      toModel.forEach(item => updates.push(buildAiRetryUpdate_(item, batchId, `AI一時失敗: ${String(err)}`)));
      return;
    }
    const left = toModel.slice(0, AI_BATCH_SPLIT_SIZE);
    const right = toModel.slice(AI_BATCH_SPLIT_SIZE);
    processAiChunkFallback_(left, apiKey, batchId, updates);
    processAiChunkFallback_(right, apiKey, batchId, updates);
  }
}

function processAiChunkFallback_(items, apiKey, batchId, updates) {
  if (!items.length) return;
  if (items.length <= 1) {
    updates.push(runAiForSingleItem_(items[0], apiKey, batchId));
    return;
  }
  try {
    writeAiEventLogs_(buildAiItemEvents_(items, 'api_request_started', {
      batchId,
      aiStatus: 'processing',
      detail: `chunk size=${items.length}`,
    }));
    const requestStartedAtMs = Date.now();
    const batchResults = runAiBatchRequest_(items, apiKey);
    const timing = { modelLatencyMs: Date.now() - requestStartedAtMs };
    writeAiEventLogs_(buildAiItemEvents_(items, 'api_request_finished', {
      batchId,
      aiStatus: 'processing',
      detail: `chunk ok size=${items.length}`,
      modelLatencyMs: timing.modelLatencyMs,
    }));
    const resultMap = {};
    batchResults.forEach(result => { resultMap[String(result.responseId || '')] = result; });
    items.forEach(item => {
      const result = resultMap[String(item.responseId)];
      if (!result) throw new Error('chunk result missing responseId');
      updates.push(buildAiSuccessUpdate_(item, batchId, result, timing));
    });
  } catch (err) {
    writeAiEventLogs_(buildAiItemEvents_(items, 'api_request_failed', {
      batchId,
      aiStatus: 'processing',
      detail: String(err),
    }));
    if (isRetriableAiErrorText_(err)) {
      items.forEach(item => updates.push(buildAiRetryUpdate_(item, batchId, `AI一時失敗: ${String(err)}`)));
      return;
    }
    items.forEach(item => updates.push(runAiForSingleItem_(item, apiKey, batchId)));
  }
}

function buildImmediateAiResult_(item) {
  const review = String(item.reviewText || '').trim();
  if (!review) {
    return { comment: 'ふりかえりをかいてから、もういちどためしてね。', score: 0, rank: 'C' };
  }
  if (review.length <= 10 || /^(がんばった|たのしかった)[。！\s]*$/.test(review)) {
    return { comment: 'なにをがんばったか、くわしくかいてみよう！', score: 0, rank: 'C' };
  }
  return null;
}

function runAIForOne_(sheet, row, review, customText, isRewrite, unitId, period, studentNumber, studentName) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    if (sheet) sheet.getRange(row, BASE_COL.COMMENT).setValue('APIキーが設定されていません。先生に伝えてね。');
    return;
  }

  if (review.length <= 10 || /^(がんばった|たのしかった)[。！\s]*$/.test(review)) {
    if (sheet) {
      sheet.getRange(row, BASE_COL.COMMENT).setValue('なにをがんばったか、くわしくかいてみよう！');
      sheet.getRange(row, BASE_COL.RANK).setValue('C');
      sheet.getRange(row, BASE_COL.SCORE).setValue(0);
    }
    const lesson = getOrCreateLesson_(unitId, period);
    const student = getOrCreateStudent_(studentNumber, studentName || '');
    updateResponseAiResult_(lesson.lessonId, student.studentId, { comment: 'なにをがんばったか、くわしくかいてみよう！', rank: 'C', score: 0 });
    return;
  }

  const cfg    = getGlobalConfigWithDefaults_();
  const prompt = `${cfg.prompt_comment || DEFAULT_PROMPT_COMMENT}

${cfg.prompt_score || DEFAULT_PROMPT_SCORE}

${customText ? '--- 児童の記録 ---\n' + customText : ''}
ふりかえり：${review}

必ず以下のJSON形式のみで返してください：
{"comment":"コメント","score":数字}`;

  try {
    const parsed = fetchGeminiJsonWithRetry_(apiKey, prompt);

    const score   = Math.max(0, Math.min(7, Math.round(parsed.score||0)));
    const rank    = RANKS[score];
    const comment = (isRewrite ? '🆕' : '') + (parsed.comment||'');

    if (sheet) {
      sheet.getRange(row, BASE_COL.COMMENT).setValue(comment);
      sheet.getRange(row, BASE_COL.RANK).setValue(rank);
      sheet.getRange(row, BASE_COL.SCORE).setValue(score);
      sheet.getRange(row, BASE_COL.COMMENT).setBackground(isRewrite ? '#FFFDE7' : null);
    }

    const lesson = getOrCreateLesson_(unitId, period);
    const student = getOrCreateStudent_(studentNumber, studentName || '');
    updateResponseAiResult_(lesson.lessonId, student.studentId, { comment, rank, score });
    appendToAggregate_(studentNumber, studentName || '', review, comment, rank, unitId, period);
  } catch(err) {
    if (sheet) sheet.getRange(row, BASE_COL.COMMENT).setValue('AIのよみこみにしっぱいしました。もういちどためしてね。');
  }
}

function fetchGeminiJsonWithRetry_(apiKey, prompt) {
  let lastError = null;
  for (let i = 0; i < AI_API_FETCH_ATTEMPTS; i++) {
    try {
      const res  = UrlFetchApp.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
        { method:'post', contentType:'application/json',
          payload: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }),
          muteHttpExceptions: true }
      );
      const status = res.getResponseCode();
      if (status >= 500 || status === 429) {
        lastError = new Error(`AI API retryable error: ${status} ${String(res.getContentText() || '').slice(0, 300)}`);
        if (i + 1 < AI_API_FETCH_ATTEMPTS) {
          Utilities.sleep(getAiApiRetrySleepMs_(res, i));
        }
        continue;
      }
      if (status < 200 || status >= 300) {
        throw new Error(`AI API error: ${status} ${res.getContentText()}`);
      }
      const json = JSON.parse(res.getContentText());
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('AI response text is empty');
      return JSON.parse(text.replace(/```json|```/g,'').trim());
    } catch (err) {
      lastError = err;
      if (!isRetriableAiErrorText_(err) || i + 1 >= AI_API_FETCH_ATTEMPTS) break;
      Utilities.sleep(getAiApiRetrySleepMs_(null, i));
    }
  }
  throw lastError || new Error('AI fetch failed');
}

function getAiApiRetrySleepMs_(response, attemptIndex) {
  const jitterMs = Math.floor(Math.random() * 2000);
  const headers = response && typeof response.getAllHeaders === 'function'
    ? response.getAllHeaders()
    : {};
  const retryAfter = Number(headers['Retry-After'] || headers['retry-after'] || '');
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(AI_API_RETRY_MAX_MS, Math.max(AI_API_RETRY_BASE_MS, retryAfter * 1000) + jitterMs);
  }
  return Math.min(AI_API_RETRY_MAX_MS, (AI_API_RETRY_BASE_MS * Math.pow(2, attemptIndex)) + jitterMs);
}

function runAiForSingleItem_(item, apiKey, batchId) {
  const cfg = getGlobalConfigWithDefaults_();
  const prompt = `${cfg.prompt_comment || DEFAULT_PROMPT_COMMENT}

${cfg.prompt_score || DEFAULT_PROMPT_SCORE}

${item.customText ? '--- 児童の記録 ---\n' + item.customText : ''}
ふりかえり：${item.reviewText}

必ず以下のJSON形式のみで返してください：
{"comment":"コメント","score":数字}`;
  const requestStartedAtMs = Date.now();
  writeAiEventLogs_(buildAiItemEvents_([item], 'api_request_started', {
    batchId,
    aiStatus: 'processing',
    detail: 'single',
  }));
  try {
    const parsed = fetchGeminiJsonWithRetry_(apiKey, prompt);
    const modelLatencyMs = Date.now() - requestStartedAtMs;
    writeAiEventLogs_(buildAiItemEvents_([item], 'api_request_finished', {
      batchId,
      aiStatus: 'processing',
      detail: 'single ok',
      modelLatencyMs,
    }));
    return buildAiSuccessUpdate_(item, batchId, parsed, { modelLatencyMs });
  } catch (err) {
    const modelLatencyMs = Date.now() - requestStartedAtMs;
    writeAiEventLogs_(buildAiItemEvents_([item], 'api_request_failed', {
      batchId,
      aiStatus: 'processing',
      detail: String(err),
      modelLatencyMs,
    }));
    return buildAiFailureUpdate_(item, batchId, `AIの応答取得に失敗: ${String(err)}`, { modelLatencyMs });
  }
}

function runAiBatchRequest_(items, apiKey) {
  const cfg = getGlobalConfigWithDefaults_();
  const lines = items.map(item => {
    const parts = [
      `responseId=${item.responseId}`,
      `student=${item.studentNumber}`,
      item.customText ? item.customText : '',
      `ふりかえり：${item.reviewText}`,
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n\n---\n\n');
  const prompt = `${cfg.prompt_comment || DEFAULT_PROMPT_COMMENT}

${cfg.prompt_score || DEFAULT_PROMPT_SCORE}

以下の複数件をまとめて評価してください。
各件について score は 0-7 の整数、comment は60文字以内にしてください。
必ず JSON 配列のみを返してください。各要素は responseId, comment, score を含めてください。

${lines}

返答形式:
[{"responseId":"...","comment":"...","score":4}]`;
  const parsed = fetchGeminiJsonWithRetry_(apiKey, prompt);
  if (!Array.isArray(parsed)) {
    throw new Error('batch response is not array');
  }
  return parsed;
}

function buildAiSuccessUpdate_(item, batchId, result, timing) {
  const score = Math.max(0, Math.min(7, Math.round(Number(result.score || 0))));
  const rank = RANKS[score] || 'C';
  const prefix = item.isRewrite ? '🆕' : '';
  const processedAt = nowIso_();
  return {
    responseId: item.responseId,
    lessonId: item.lessonId,
    unitId: item.unitId,
    period: item.period,
    studentId: item.studentId,
    studentNumber: item.studentNumber,
    studentName: item.studentName,
    reviewText: item.reviewText,
    comment: `${prefix}${String(result.comment || '').trim()}`,
    rank,
    score,
    aiStatus: 'done',
    aiQueuedAt: '',
    aiProcessedAt: processedAt,
    aiError: '',
    aiBatchId: batchId,
    aiRetryCount: 0,
    aiStartedAt: item.aiStartedAt || '',
    aiLatencyMs: calcAiElapsedMs_(item.aiStartedAt, processedAt),
    aiModelLatencyMs: Number(timing?.modelLatencyMs || 0),
  };
}

function buildAiErrorUpdate_(item, batchId, errorText, timing) {
  const processedAt = nowIso_();
  return {
    responseId: item.responseId,
    lessonId: item.lessonId,
    unitId: item.unitId,
    period: item.period,
    studentId: item.studentId,
    studentNumber: item.studentNumber,
    studentName: item.studentName,
    reviewText: item.reviewText,
    comment: 'AIのコメント作成に失敗しました。しばらくしてからもう一度ためしてね。',
    rank: '',
    score: 0,
    aiStatus: 'error',
    aiQueuedAt: '',
    aiProcessedAt: processedAt,
    aiError: String(errorText || '').slice(0, 500),
    aiBatchId: batchId,
    aiRetryCount: Number(item.aiRetryCount || 0) + 1,
    aiStartedAt: item.aiStartedAt || '',
    aiLatencyMs: calcAiElapsedMs_(item.aiStartedAt, processedAt),
    aiModelLatencyMs: Number(timing?.modelLatencyMs || 0),
  };
}

function buildAiRetryUpdate_(item, batchId, errorText, timing) {
  return {
    responseId: item.responseId,
    lessonId: item.lessonId,
    unitId: item.unitId,
    period: item.period,
    studentId: item.studentId,
    studentNumber: item.studentNumber,
    studentName: item.studentName,
    reviewText: item.reviewText,
    comment: '',
    rank: '',
    score: 0,
    aiStatus: 'pending',
    aiQueuedAt: nowIso_(),
    aiProcessedAt: '',
    aiError: String(errorText || '').slice(0, 500),
    aiBatchId: batchId,
    aiRetryCount: Number(item.aiRetryCount || 0) + 1,
    aiStartedAt: item.aiStartedAt || '',
    aiLatencyMs: calcAiElapsedMs_(item.aiStartedAt, nowIso_()),
    aiModelLatencyMs: Number(timing?.modelLatencyMs || 0),
  };
}

function buildAiFailureUpdate_(item, batchId, errorText, timing) {
  return isRetriableAiErrorText_(errorText)
    ? buildAiRetryUpdate_(item, batchId, errorText, timing)
    : buildAiErrorUpdate_(item, batchId, errorText, timing);
}

function isRetriableAiErrorText_(errorText) {
  const text = String(errorText || '').toLowerCase();
  return text.includes('retryable')
    || text.includes(' 429 ')
    || text.includes('429 ')
    || text.includes(' 500 ')
    || text.includes(' 502 ')
    || text.includes(' 503 ')
    || text.includes(' 504 ')
    || text.includes('service unavailable')
    || text.includes('timed out')
    || text.includes('fetch failed')
    || text.includes('temporar')
    || text.includes('quota');
}

function hasRetryPendingUpdates_(updates) {
  return (updates || []).some(update => String(update.aiStatus || '') === 'pending');
}

function applyAiUpdatesBatch_(updates) {
  if (!updates.length) return;
  const lock = LockService.getDocumentLock();
  lock.waitLock(LOCK_AI_RESULT_MS);
  try {
    const sheet = getResponsesDbSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    const rows = sheet.getRange(2, 1, lastRow - 1, RESPONSE_HEADERS.length).getValues();
    const byResponseId = {};
    updates.forEach(update => { byResponseId[String(update.responseId)] = update; });
    let dirty = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const update = byResponseId[String(row[0] || '')];
      if (!update) continue;
      row[10] = update.score ?? row[10];
      row[11] = update.rank ?? row[11];
      row[13] = update.comment ?? row[13];
      row[15] = nowIso_();
      row[16] = update.aiStatus || row[16];
      row[17] = update.aiQueuedAt || '';
      row[18] = update.aiProcessedAt || '';
      row[19] = update.aiError || '';
      row[20] = update.aiBatchId || '';
      row[21] = Number(update.aiRetryCount ?? row[21] ?? 0);
      row[22] = update.aiStartedAt ?? row[22] ?? '';
      row[23] = Number(update.aiLatencyMs ?? row[23] ?? 0);
      row[24] = Number(update.aiModelLatencyMs ?? row[24] ?? 0);
      dirty = true;
    }
    if (dirty) sheet.getRange(2, 1, rows.length, RESPONSE_HEADERS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
}

function appendAggregateForAiUpdates_(updates) {
  if (!updates.length) return;
  upsertAggregateEntries_((updates || [])
    .filter(update => update.aiStatus === 'done' && update.lessonId)
    .map(update => ({
      studentNumber: update.studentNumber || '',
      studentName: update.studentName || '',
      reviewText: update.reviewText || '',
      comment: update.comment || '',
      rank: update.rank || '',
      unitId: update.unitId || '',
      period: update.period || '',
      responseId: update.responseId || '',
      unitName: update.unitName || '',
    })));
}

function enqueueAggregateForAiUpdates_(updates) {
  const entries = (updates || [])
    .filter(update => update && update.aiStatus === 'done' && update.lessonId)
    .map(update => ({
      studentNumber: update.studentNumber || '',
      studentName: update.studentName || '',
      reviewText: update.reviewText || '',
      comment: update.comment || '',
      rank: update.rank || '',
      unitId: update.unitId || '',
      period: update.period || '',
      responseId: update.responseId || '',
      unitName: update.unitName || '',
    }));
  if (!entries.length) return;
  enqueueAggregateEntries_(entries);
}

function loadAiAggregateQueue_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(AI_AGGREGATE_QUEUE_KEY) || '[]';
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? entries.filter(Boolean) : [];
  } catch (err) {
    return [];
  }
}

function maybeFlushAiAggregateQueue_(source) {
  const sourceText = String(source || '');
  if (sourceText !== 'teacher_queue' && sourceText !== 'time_trigger') {
    return { processed: 0, remaining: loadAiAggregateQueue_().length };
  }
  const entries = loadAiAggregateQueue_();
  if (!entries.length) return { processed: 0, remaining: 0 };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return { processed: 0, remaining: entries.length, skipped: 'lock_busy' };
  try {
    return flushAiAggregateQueueUnsafe_(entries, sourceText);
  } finally {
    lock.releaseLock();
  }
}

function flushAiAggregateQueueUnsafe_(entries, source) {
  const props = PropertiesService.getScriptProperties();
  let processed = 0;
  let remainingEntries = [];
  try {
    const result = upsertAggregateEntries_(entries || []);
    processed = Number(result.processed || 0);
  } catch (err) {
    remainingEntries = Array.isArray(entries) ? entries.slice() : [];
  }
  props.setProperty(AI_AGGREGATE_QUEUE_KEY, JSON.stringify(remainingEntries));
  if (processed > 0) {
    writeAiBatchLevelEvent_('aggregate_queue_flushed', 'done', String(source || 'aggregate_queue'), {});
  }
  if (remainingEntries.length > 0) {
    safeEnsureAiBatchTrigger_(AI_TRIGGER_SHORT_RESCUE_DELAY_MS, 'flushAiAggregateQueue');
  }
  return { processed, remaining: remainingEntries.length };
}

function recalcLessonMedalsFromDb_(lessonId) {
  const cfg = readGlobalConfig();
  const top = Math.min(parseInt(cfg.medal_top)||5, 5);
  const sheet = getResponsesDbSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const rows = sheet.getRange(2, 1, lastRow - 1, RESPONSE_HEADERS.length).getValues();
  const lessonRows = [];
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || '') !== String(lessonId)) continue;
    lessonRows.push({
      index: i,
      responseId: rows[i][0] || '',
      reviewText: rows[i][7] || '',
      score: Number(rows[i][10] || 0),
    });
  }

  const medalMap = {};
  lessonRows
    .filter(row => row.reviewText && row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
    .forEach((row, idx) => {
      medalMap[row.responseId] = MEDALS[idx] || '';
    });

  const updatedAt = nowIso_();
  lessonRows.forEach(row => {
    rows[row.index][12] = medalMap[row.responseId] || '';
    rows[row.index][15] = updatedAt;
  });

  sheet.getRange(2, 1, rows.length, RESPONSE_HEADERS.length).setValues(rows);
}

function buildCustomTextFromAnswers_(fields, answersMap) {
  return (fields || [])
    .map(field => `${field.label}：${answersMap[field.key] || ''}`)
    .filter(line => !line.endsWith('：'))
    .join('\n');
}

function appendToAggregate_(studentNumber, studentName, review, comment, rank, unitId, period, responseId) {
  upsertAggregateEntries_([{
    studentNumber,
    studentName,
    reviewText: review,
    comment,
    rank,
    unitId,
    period,
    responseId,
  }]);
}

function upsertAggregateEntries_(entries) {
  const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!safeEntries.length) return { processed: 0, updated: 0, appended: 0 };
  const ss = getTenantSpreadsheet_();
  const agg = ss.getSheetByName(SHEET_AGG);
  if (!agg) return { processed: 0, updated: 0, appended: 0 };
  ensureAggregateSchema_(agg);
  const units = getAllUnits();
  const unitMap = {};
  units.forEach(unit => {
    unitMap[String(unit.id || '')] = unit;
  });
  const date = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  const deduped = {};
  safeEntries.forEach(entry => {
    const key = getAggregateEntryKey_(entry);
    if (key) deduped[key] = entry;
  });
  const normalizedEntries = Object.keys(deduped).map(key => deduped[key]);
  if (!normalizedEntries.length) return { processed: 0, updated: 0, appended: 0 };
  const rowIndex = buildAggregateRowIndex_(agg);
  const updates = [];
  const appends = [];
  normalizedEntries.forEach(entry => {
    const unitId = String(entry.unitId || '').trim();
    const unit = unitMap[unitId] || null;
    const record = [
      unit?.name || String(entry.unitName || ''),
      unit?.subject || '',
      entry.period || '',
      entry.studentNumber || '',
      entry.studentName || '',
      date,
      entry.reviewText || '',
      entry.rank || '',
      entry.comment || '',
      unitId,
      String(entry.responseId || ''),
    ];
    const responseId = String(entry.responseId || '').trim();
    const legacyKey = makeAggregateLegacyKey_(unitId, entry.period || '', entry.studentNumber || '', unit?.name || String(entry.unitName || ''));
    const existingRow = (responseId && rowIndex.responseIds[responseId]) || rowIndex.legacyKeys[legacyKey] || 0;
    if (existingRow > 1) {
      updates.push({ rowNumber: existingRow, values: [record] });
      rowIndex.responseIds[responseId] = existingRow;
      rowIndex.legacyKeys[legacyKey] = existingRow;
      return;
    }
    appends.push(record);
    const nextRowNumber = agg.getLastRow() + appends.length;
    if (responseId) rowIndex.responseIds[responseId] = nextRowNumber;
    rowIndex.legacyKeys[legacyKey] = nextRowNumber;
  });
  writeSheetRowBatches_(agg, updates, AGG_HEADERS.length);
  if (appends.length) {
    agg.getRange(agg.getLastRow() + 1, 1, appends.length, AGG_HEADERS.length).setValues(appends);
  }
  return {
    processed: normalizedEntries.length,
    updated: updates.length,
    appended: appends.length,
  };
}

function ensureAggregateSchema_(sheet) {
  const headerWidth = AGG_HEADERS.length;
  if (sheet.getLastColumn() < headerWidth) {
    sheet.insertColumnsAfter(sheet.getLastColumn(), headerWidth - sheet.getLastColumn());
  }
  const headers = sheet.getRange(1, 1, 1, headerWidth).getValues()[0];
  let needsUpdate = false;
  AGG_HEADERS.forEach((header, idx) => {
    if (headers[idx] !== header) {
      headers[idx] = header;
      needsUpdate = true;
    }
  });
  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headerWidth).setValues([headers]);
  }
}

function findAggregateRow_(agg, responseId, unitId, period, num, unitName) {
  const lastRow = agg.getLastRow();
  if (lastRow <= 1) return 0;
  const data = agg.getRange(2, 1, lastRow - 1, Math.max(agg.getLastColumn(), AGG_HEADERS.length)).getValues();
  const responseIdStr = String(responseId || '');
  const unitIdStr = String(unitId || '');
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (responseIdStr && String(row[10] || '') === responseIdStr) {
      return i + 2;
    }
    const sameUnitId = String(row[9] || '') === unitIdStr;
    const sameLegacyUnit = !row[9] && row[0] === unitName;
    const samePeriod = String(row[2]) === String(period);
    const sameNum = String(row[3]) === String(num);
    if ((sameUnitId || sameLegacyUnit) && samePeriod && sameNum) {
      return i + 2;
    }
  }
  return 0;
}

function buildAggregateRowIndex_(sheet) {
  const safeSheet = sheet || getTenantSpreadsheet_().getSheetByName(SHEET_AGG);
  if (!safeSheet) return { responseIds: {}, legacyKeys: {} };
  ensureAggregateSchema_(safeSheet);
  const lastRow = safeSheet.getLastRow();
  if (lastRow <= 1) return { responseIds: {}, legacyKeys: {} };
  const rows = safeSheet.getRange(2, 1, lastRow - 1, Math.max(safeSheet.getLastColumn(), AGG_HEADERS.length)).getValues();
  const responseIds = {};
  const legacyKeys = {};
  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const responseId = String(row[10] || '').trim();
    if (responseId) responseIds[responseId] = rowNumber;
    legacyKeys[makeAggregateLegacyKey_(row[9] || '', row[2] || '', row[3] || '', row[0] || '')] = rowNumber;
  });
  return { responseIds, legacyKeys };
}

function enqueueAggregateEntries_(entries) {
  const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!safeEntries.length) return 0;
  const props = PropertiesService.getScriptProperties();
  const current = loadAiAggregateQueue_();
  const deduped = {};
  current.concat(safeEntries).forEach(entry => {
    const key = getAggregateEntryKey_(entry);
    if (key) deduped[key] = entry;
  });
  props.setProperty(AI_AGGREGATE_QUEUE_KEY, JSON.stringify(Object.values(deduped)));
  safeEnsureAiBatchTrigger_(AI_TRIGGER_DRAIN_DELAY_MS, 'enqueueAggregateEntries');
  return safeEntries.length;
}

function getAggregateEntryKey_(entry) {
  if (!entry) return '';
  const responseId = String(entry.responseId || '').trim();
  if (responseId) return `response:${responseId}`;
  return `legacy:${makeAggregateLegacyKey_(entry.unitId, entry.period, entry.studentNumber, entry.unitName || '')}`;
}

function makeAggregateLegacyKey_(unitId, period, studentNumber, unitName) {
  const unitKey = String(unitId || '').trim() || `unit:${String(unitName || '').trim()}`;
  return [unitKey, String(period || '').trim(), String(studentNumber || '').trim()].join('|');
}

function buildAggregateIndex_(sheet) {
  const safeSheet = sheet || getTenantSpreadsheet_().getSheetByName(SHEET_AGG);
  if (!safeSheet) {
    return { responseIds: {}, legacyKeys: {} };
  }
  ensureAggregateSchema_(safeSheet);
  const lastRow = safeSheet.getLastRow();
  if (lastRow <= 1) {
    return { responseIds: {}, legacyKeys: {} };
  }
  const rows = safeSheet.getRange(2, 1, lastRow - 1, Math.max(safeSheet.getLastColumn(), AGG_HEADERS.length)).getValues();
  const responseIds = {};
  const legacyKeys = {};
  rows.forEach(row => {
    const responseId = String(row[10] || '').trim();
    if (responseId) responseIds[responseId] = true;
    const legacyKey = makeAggregateLegacyKey_(row[9] || '', row[2] || '', row[3] || '', row[0] || '');
    if (legacyKey) legacyKeys[legacyKey] = true;
  });
  return { responseIds, legacyKeys };
}

function hasAggregateEntry_(index, entry, unitName) {
  if (!entry) return false;
  const responseId = String(entry.responseId || '').trim();
  if (responseId && index?.responseIds?.[responseId]) return true;
  const legacyKey = makeAggregateLegacyKey_(entry.unitId, entry.period, entry.studentNumber, unitName || entry.unitName || '');
  return Boolean(legacyKey && index?.legacyKeys?.[legacyKey]);
}

function shouldTrackAggregateDoneResponse_(response) {
  return Boolean(
    response
    && response.submitted === true
    && String(response.reviewText || '').trim()
    && String(response.aiStatus || '') === 'done'
    && !isAiLoadTestResponse_(response)
  );
}

function getAggregateQueueHealth_(responses) {
  const responseRows = Array.isArray(responses) ? responses : getResponseSheetData_().rows.map(mapResponseRow_);
  const queuedEntries = loadAiAggregateQueue_();
  const persistRetryEntries = loadAiPersistRetryEntries_();
  const aggregateIndex = buildAggregateIndex_();
  const lessonRows = getLessonsDbSheet_().getDataRange().getValues().slice(1);
  const lessonPeriodMap = {};
  lessonRows.forEach(row => {
    lessonPeriodMap[String(row[0] || '')] = row[2] || '';
  });
  const units = getAllUnits();
  const unitNameMap = {};
  units.forEach(unit => {
    unitNameMap[String(unit.id || '')] = unit.name || '';
  });
  const missingEntries = [];
  responseRows.forEach(response => {
    if (!shouldTrackAggregateDoneResponse_(response)) return;
    const period = response.lessonId ? (lessonPeriodMap[String(response.lessonId)] || '') : '';
    const unitName = unitNameMap[String(response.unitId || '')] || '';
    const entry = {
      responseId: response.responseId || '',
      unitId: response.unitId || '',
      period,
      studentNumber: response.studentNumber || '',
      studentName: response.studentName || '',
      reviewText: response.reviewText || '',
      comment: response.comment || '',
      rank: response.rank || '',
      unitName,
    };
    if (!hasAggregateEntry_(aggregateIndex, entry, unitName)) {
      missingEntries.push(entry);
    }
  });
  const persistRetryItems = persistRetryEntries.reduce((sum, entry) => sum + ((entry?.updates || []).length), 0);
  return {
    queued: queuedEntries.length,
    missing: missingEntries.length,
    missingEntries,
    persistRetryBatches: persistRetryEntries.length,
    persistRetryItems,
  };
}

