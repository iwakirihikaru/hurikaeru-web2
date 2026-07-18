import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = process.cwd();
const studentServerSource = fs.readFileSync(path.join(rootDir, 'src', '04_student.js'), 'utf8');
const studentClientSource = fs.readFileSync(path.join(rootDir, 'src', 'index.html'), 'utf8');

function createServerContext(overrides = {}) {
  const counters = {
    rosterCalls: 0,
    lessonCalls: 0,
    activeCalls: 0,
    stateCalls: 0,
    lessonSnapshotCalls: 0,
    runtimeSnapshotCalls: 0,
    stringifyCalls: 0,
  };
  const tokenStore = new Map();
  const context = {
    console,
    counters,
    Math,
    JSON: {
      stringify(value) {
        counters.stringifyCalls += 1;
        return JSON.stringify(value);
      },
      parse: JSON.parse,
    },
    Date,
    readGlobalConfig: () => ({
      active_unit: '1',
      active_period: '1',
      active_timeline_field: 'review',
      active_revision: '3',
    }),
    CacheService: {
      getScriptCache() {
        return {
          put(key, value) { tokenStore.set(String(key), String(value)); },
          get(key) { return tokenStore.has(String(key)) ? tokenStore.get(String(key)) : null; },
          remove(key) { tokenStore.delete(String(key)); },
        };
      },
    },
    makeId_: prefix => `${prefix}-token`,
    MEDALS: ['🥇', '🥈', '🥉'],
    MEDAL_COLORS: ['#d4af37', '#c0c0c0', '#cd7f32'],
    nowIso_: () => '2026-07-17T09:00:00.000Z',
    sanitizeStudentName_: value => String(value || '').trim(),
    mapAnswersToCustoms_: (fields, answersMap) => (fields || []).map(field => String((answersMap || {})[field.key] || '')),
    getMedalColor_: medal => medal ? '#f90' : '',
    isStudentAiEnabled_: () => true,
    isStudentAiAutoSubmitEnabled_: () => true,
    getLiveTenantMaintenanceState: () => ({ mode: 'ok' }),
    getAiFeatureFlags_: () => ({ studentAiEnabled: true, studentAiAutoSubmitEnabled: true }),
    getPresets: () => [],
    getEnabledFields_: unit => (unit.fields || []).filter(field => field.enabled !== false),
    getLessonFields_: (lesson, unit) => lesson.fields || unit.fields || [],
    getRosterEntries_: () => {
      counters.rosterCalls += 1;
      return [
        { number: '1', name: 'A' },
        { number: '2', name: 'B' },
      ];
    },
    getStudentSelectableEntries_: () => [
      { number: '1', name: 'A' },
      { number: '2', name: 'B' },
    ],
    getOrCreateLesson_: (unitId, period) => {
      counters.lessonCalls += 1;
      return {
        lessonId: `lesson-${unitId}-${period}`,
        unitId: String(unitId),
        period: Number(period),
        fields: [
          { key: 'review', label: 'ふりかえり', enabled: true },
          { key: 'goal', label: 'めあて', enabled: true },
        ],
      };
    },
    getResponseRecordByStudentNumber_: () => {
      counters.stateCalls += 1;
      return null;
    },
    getPreviousStudentLearningContextFromDb_: () => ({ prevReview: '', previousNextGoal: '' }),
    getActiveSetting: () => {
      counters.activeCalls += 1;
      return {
        unitId: '1',
        period: 1,
        unit: {
          id: '1',
          subject: '算数',
          name: 'たし算',
          maxPeriod: 6,
          fields: [
            { key: 'review', label: 'ふりかえり', enabled: true },
            { key: 'goal', label: 'めあて', enabled: true },
          ],
        },
        lesson: { lessonId: 'lesson-1-1' },
        timelineFieldKey: 'review',
        activeRevision: 3,
      };
    },
    getAllUnits: () => [
      { id: '1', subject: '算数', name: 'たし算', maxPeriod: 6, fields: [{ key: 'review', label: 'ふりかえり', enabled: true }, { key: 'goal', label: 'めあて', enabled: true }] },
      { id: '2', subject: '国語', name: '説明文', maxPeriod: 4, fields: [{ key: 'review', label: 'ふりかえり', enabled: true }] },
    ],
    getLessonRecordById_: lessonId => {
      if (lessonId === 'lesson-1-1') return { lessonId: 'lesson-1-1', unitId: '1', period: 1, fields: [{ key: 'review', label: 'ふりかえり', enabled: true }, { key: 'goal', label: 'めあて', enabled: true }] };
      if (lessonId === 'lesson-2-1') return { lessonId: 'lesson-2-1', unitId: '2', period: 1, fields: [{ key: 'review', label: 'ふりかえり', enabled: true }] };
      return null;
    },
    getLessonRecordByUnitPeriod_: (unitId, period) => {
      if (String(unitId) === '1' && Number(period) === 1) return { lessonId: 'lesson-1-1', unitId: '1', period: 1, fields: [{ key: 'review', label: 'ふりかえり', enabled: true }, { key: 'goal', label: 'めあて', enabled: true }] };
      if (String(unitId) === '2' && Number(period) === 1) return { lessonId: 'lesson-2-1', unitId: '2', period: 1, fields: [{ key: 'review', label: 'ふりかえり', enabled: true }] };
      return null;
    },
    getLessonLiveStateSnapshot_: () => {
      counters.lessonSnapshotCalls += 1;
      return {
        lesson: { lessonId: 'lesson-1-1' },
        fields: [
          { key: 'review', label: 'ふりかえり', enabled: true },
          { key: 'goal', label: 'めあて', enabled: true },
        ],
        roster: [
          { number: '1', name: 'A' },
          { number: '2', name: 'B' },
        ],
        responseMapByStudentNumber: {
          '1': {
            studentName: 'A',
            answersMap: { review: 'じぶん', goal: 'めあて' },
            comment: 'teacher-only',
            rank: 'S',
            medal: '🥇',
            submitted: true,
            score: 99,
            aiStatus: 'done',
            aiProcessedAt: '2026-07-17T09:00:00.000Z',
            updatedAt: '2026-07-17T09:00:00.000Z',
          },
          '2': {
            studentName: 'B',
            answersMap: { review: 'みんな', goal: 'がんばる' },
            comment: 'private-b',
            rank: 'A',
            medal: '🥈',
            submitted: true,
            score: 88,
            aiStatus: 'processing',
            aiProcessedAt: '2026-07-17T09:01:00.000Z',
            updatedAt: '2026-07-17T09:01:00.000Z',
          },
        },
        responseReadMeta: { scope: 'lesson' },
        serverNow: '2026-07-17T09:02:00.000Z',
      };
    },
    getLessonRuntimeSnapshot_: () => {
      counters.runtimeSnapshotCalls += 1;
      return null;
    },
    attachStudentApiTiming_: (payload, apiName, startedAt, timing) => {
      const result = payload && typeof payload === 'object' ? { ...payload } : {};
      result.timing = { ...(timing || {}), api: apiName, totalMs: 1 };
      return result;
    },
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(studentServerSource, context);
  return context;
}

function testTimelineDtoVisibility() {
  const context = createServerContext();
  const init = context.studentInit('1', 0);
  const payload = context.getTimelineSnapshot('lesson-1-1', 3, '1', init.studentSessionToken);
  assert.equal(Array.isArray(payload.rows), true);
  assert.equal(payload.rows.length, 2);
  for (const row of payload.rows) {
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'comment'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'rank'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'score'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'aiStatus'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'aiProcessedAt'), false);
  }
  assert.equal(payload.myState.comment, 'teacher-only');
  assert.equal(payload.myState.aiStatus, 'done');
}

function testLessonAndRevisionGuards() {
  const context = createServerContext();
  const init = context.studentInit('1', 0);
  const wrongLessonPayload = context.getTimelineSnapshot('lesson-2-1', 3, '1', init.studentSessionToken);
  assert.equal(Array.isArray(wrongLessonPayload.rows), true);
  assert.equal(wrongLessonPayload.rows.length, 0);
  assert.equal(wrongLessonPayload.myState, null);
  const staleRevisionPayload = context.getTimelineSnapshot('lesson-1-1', 2, '1', init.studentSessionToken);
  assert.equal(Array.isArray(staleRevisionPayload.rows), true);
  assert.equal(staleRevisionPayload.rows.length, 0);
  assert.equal(staleRevisionPayload.myState, null);
}

function testStudentSessionGuards() {
  const context = createServerContext();
  const init = context.studentInit('1', 0);
  assert.equal(typeof init.studentSessionToken, 'string');
  assert.notEqual(init.studentSessionToken, '');
  assert.throws(() => context.studentLoadState('1', 1, '1', ''), /student_session_required/);
  assert.throws(() => context.getTimelineSnapshot('lesson-1-1', 3, '2', init.studentSessionToken), /student_session_mismatch/);
  const loadState = context.studentLoadState('1', 1, '1', init.studentSessionToken);
  assert.equal(loadState.num, '1');
}

function testStudentInitDoesNotFetchWholeClassState() {
  const context = createServerContext({
    getLessonLiveStateSnapshot_: () => {
      throw new Error('studentInit must not read lesson live snapshot');
    },
    getLessonRuntimeSnapshot_: () => {
      throw new Error('studentInit must not read lesson runtime snapshot');
    },
  });
  const result = context.studentInit('1', 0);
  assert.equal(result.needPeriodSelect, false);
  assert.equal(result.lessonId, 'lesson-1-1');
  assert.equal(result.activeRevision, 3);
  assert.equal(context.counters.rosterCalls, 0);
  assert.equal(context.counters.lessonCalls >= 1, true);
  assert.equal(context.counters.stateCalls >= 1, true);
  assert.equal(context.counters.stringifyCalls >= 1, true);
}

function testClientGuardsPresence() {
  assert.match(studentClientSource, /function isTimelineResponseCurrent_/);
  assert.match(studentClientSource, /student_start_indicator/);
  assert.match(studentClientSource, /student_main_rendered/);
  assert.match(studentClientSource, /student_input_ready/);
  assert.match(studentClientSource, /timeline_rendered/);
  assert.match(studentClientSource, /id="timelineRetryBtn"/);
  assert.match(studentClientSource, /\.getTimelineSnapshot\(myLessonId,myActiveRevision,myNum,studentSessionToken\)/);
}

testTimelineDtoVisibility();
testLessonAndRevisionGuards();
testStudentSessionGuards();
testStudentInitDoesNotFetchWholeClassState();
testClientGuardsPresence();

console.log('student guard tests passed');
