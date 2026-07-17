import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROFILE_ORDER = Object.freeze(['lite', 'standard', 'enterprise']);
const DEFAULT_TABLE_URL = new URL('../../assets/policies/profile-triggers.v1.json', import.meta.url);
const defaultTable = JSON.parse(readFileSync(fileURLToPath(DEFAULT_TABLE_URL), 'utf8'));

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAlias(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }
  return null;
}

function mappedProfile(value, table) {
  const alias = normalizeAlias(value);
  if (alias === null || !isRecord(table) || !isRecord(table.legacyLevels)) {
    return null;
  }
  const profile = Object.prototype.hasOwnProperty.call(table.legacyLevels, alias)
    ? table.legacyLevels[alias]
    : null;
  return PROFILE_ORDER.includes(profile) ? profile : null;
}

function safelyMappedProfile(value, table) {
  try {
    return mappedProfile(value, table);
  } catch {
    return null;
  }
}

function profileRank(profile) {
  return PROFILE_ORDER.indexOf(profile);
}

function higherProfile(current, candidate) {
  return profileRank(candidate) > profileRank(current) ? candidate : current;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function normalizePolicyTable(table) {
  const validHardTriggerIds = [];
  const validHardPolicies = [];
  let invalid = false;

  if (
    !isRecord(table) ||
    table.schemaVersion !== 1 ||
    !Array.isArray(table.profiles) ||
    table.profiles.length !== PROFILE_ORDER.length ||
    !table.profiles.every((profile, index) => profile === PROFILE_ORDER[index]) ||
    !isRecord(table.legacyLevels) ||
    !Array.isArray(table.triggers)
  ) {
    return { invalid: true, triggers: [], validHardTriggerIds, validHardPolicies };
  }

  if (Object.values(table.legacyLevels).some((profile) => !PROFILE_ORDER.includes(profile))) {
    invalid = true;
  }

  const triggers = [];
  for (const row of table.triggers) {
    if (!isRecord(row)) {
      invalid = true;
      continue;
    }

    const idValid = typeof row.id === 'string' && row.id.length > 0;
    const inputValid = typeof row.input === 'string' && row.input.length > 0;
    const dimensionValid = typeof row.dimension === 'string' && row.dimension.length > 0;
    const floorValid = PROFILE_ORDER.includes(row.profileFloor);
    const hardValid = typeof row.hard === 'boolean';
    const downgradeableValid = typeof row.downgradeable === 'boolean';
    const unknownBehaviorValid = row.unknownBehavior === 'ignore' || row.unknownBehavior === 'ask_user';
    const policiesValid =
      Array.isArray(row.policies) &&
      row.policies.every((policy) => typeof policy === 'string' && policy.length > 0);
    const hardPoliciesValid = row.hard !== true || (policiesValid && row.policies.length > 0);
    const hardRowValid =
      row.hard !== true ||
      (
        row.profileFloor === 'enterprise' &&
        row.downgradeable === false &&
        row.unknownBehavior === 'ask_user'
      );

    if (
      !idValid ||
      !inputValid ||
      !dimensionValid ||
      !floorValid ||
      !hardValid ||
      !downgradeableValid ||
      !unknownBehaviorValid ||
      !policiesValid ||
      !hardPoliciesValid ||
      !hardRowValid
    ) {
      invalid = true;
      if (row.hard === true) {
        if (idValid) validHardTriggerIds.push(row.id);
        if (policiesValid) validHardPolicies.push(...row.policies);
      }
      continue;
    }

    const trigger = {
      id: row.id,
      input: row.input,
      profileFloor: row.hard ? 'enterprise' : row.profileFloor,
      hard: row.hard,
      unknownBehavior: row.unknownBehavior,
      policies: row.policies,
    };
    triggers.push(trigger);
    if (trigger.hard) {
      validHardTriggerIds.push(trigger.id);
      validHardPolicies.push(...trigger.policies);
    }
  }

  return { invalid, triggers, validHardTriggerIds, validHardPolicies };
}

function invalidPolicyResult(baselineProfile, triggerIds = [], policies = []) {
  return {
    schemaVersion: 1,
    status: 'ask_user',
    reasonCode: 'HARD_RISK_POLICY_INVALID',
    selectedProfile: 'enterprise',
    baselineProfile,
    triggerIds: sortedUnique(triggerIds),
    policies: sortedUnique(policies),
    confidence: 'low',
  };
}

export function profileForLegacyLevel(level) {
  return safelyMappedProfile(level, defaultTable);
}

function readOptions(options) {
  if (!isRecord(options)) {
    return { legacyLevel: 1, preferredProfile: null, signals: {} };
  }
  return {
    legacyLevel: options.legacyLevel ?? 1,
    preferredProfile: options.preferredProfile ?? null,
    signals: options.signals ?? {},
  };
}

export function classifyProfile(options = {}, table = defaultTable) {
  let safeOptions;
  try {
    safeOptions = readOptions(options);
  } catch {
    return invalidPolicyResult('lite');
  }

  const baselineProfile = safelyMappedProfile(safeOptions.legacyLevel, table) ?? 'lite';

  try {
    const normalizedTable = normalizePolicyTable(table);
    if (normalizedTable.invalid) {
      return invalidPolicyResult(
        baselineProfile,
        normalizedTable.validHardTriggerIds,
        normalizedTable.validHardPolicies,
      );
    }

    let selectedProfile = baselineProfile;
    const triggerIds = [];
    const policies = [];
    let uncertainHardRisk = false;
    const suppliedSignals = isRecord(safeOptions.signals) ? safeOptions.signals : {};

    for (const trigger of normalizedTable.triggers) {
      const isSupplied = Object.prototype.hasOwnProperty.call(suppliedSignals, trigger.input);
      const value = isSupplied ? suppliedSignals[trigger.input] : undefined;
      const isHardAskUser = trigger.hard && trigger.unknownBehavior === 'ask_user';
      const isHardUnknown = isHardAskUser && value !== true && value !== false;

      if (value !== true && !isHardUnknown) {
        continue;
      }

      triggerIds.push(trigger.id);
      policies.push(...trigger.policies);
      selectedProfile = higherProfile(selectedProfile, trigger.profileFloor);
      if (isHardUnknown) {
        uncertainHardRisk = true;
      }
    }

    const preferred = safelyMappedProfile(safeOptions.preferredProfile, table);
    if (preferred !== null) {
      selectedProfile = higherProfile(selectedProfile, preferred);
    }

    return {
      schemaVersion: 1,
      status: uncertainHardRisk ? 'ask_user' : 'proceed',
      reasonCode: uncertainHardRisk ? 'HARD_RISK_UNKNOWN' : 'PROFILE_SELECTED',
      selectedProfile,
      baselineProfile,
      triggerIds: sortedUnique(triggerIds),
      policies: sortedUnique(policies),
      confidence: uncertainHardRisk ? 'low' : 'high',
    };
  } catch {
    return invalidPolicyResult(baselineProfile);
  }
}
