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

const TASK_SIGNAL_PATTERNS = Object.freeze({
  authenticationAuthorizationOrTrust: /\b(auth(?:entication|orization)?|oauth|permission|access control|trust boundary|session token)\b|认证|授权|权限|信任边界/i,
  paymentsOrMoney: /\b(payment|billing|invoice|money|financial|checkout)\b|支付|账单|资金/i,
  sensitiveOrRegulatedData: /\b(sensitive data|regulated data|personal data|pii|phi|secret|credential)\b|敏感数据|个人数据|凭据/i,
  irreversibleOrProductionMigration: /\b(production migration|irreversible migration|database migration|schema migration|data migration)\b|生产迁移|不可逆迁移|数据库迁移|数据迁移/i,
  publicApiSchemaOrProtocol: /\b(public api|public schema|public protocol|published api|sdk contract|webhook contract)\b|公共接口|公开协议|公共协议/i,
  productionReleaseOrDeployment: /\b(production release|production deploy(?:ment)?|publish(?:ing)?|public release|ship to production)\b|生产发布|部署生产|公开发布/i,
  complianceOrLegal: /\b(compliance|legal|regulatory|gdpr|hipaa|pci)\b|合规|法律|监管/i,
  highBlastRadiusInfrastructure: /\b(production infrastructure|high[- ]blast[- ]radius|terraform apply|cluster migration|network policy)\b|生产基础设施|高爆炸半径/i,
});

const AMBIGUOUS_HARD_RISK_PATTERNS = Object.freeze({
  irreversibleOrProductionMigration: /\b(migration|migrate|schema change)\b|迁移/i,
  publicApiSchemaOrProtocol: /\b(api|protocol|schema|sdk|webhook)\b|接口|协议/i,
  productionReleaseOrDeployment: /\b(release|deploy|publish|ship)\b|发布|部署/i,
  highBlastRadiusInfrastructure: /\b(infrastructure|kubernetes|cluster|terraform|network)\b|基础设施|集群|网络/i,
});

function inferTaskSignals(intent) {
  const text = String(intent ?? '').trim();
  const signals = {};
  for (const [signal, pattern] of Object.entries(TASK_SIGNAL_PATTERNS)) {
    signals[signal] = pattern.test(text);
  }
  for (const [signal, pattern] of Object.entries(AMBIGUOUS_HARD_RISK_PATTERNS)) {
    if (signals[signal] !== true && pattern.test(text)) signals[signal] = 'unknown';
  }
  return signals;
}

function inferTaskBaseline(intent) {
  const text = String(intent ?? '').trim();
  if (/\b(feature|multi[- ]file|cross[- ]file|state machine|integration)\b|功能|跨文件|状态机|集成/i.test(text)) return 2;
  return 1;
}

export function resolveTaskProfile(options = {}, table = defaultTable) {
  const safeOptions = isRecord(options) ? options : {};
  const intent = typeof safeOptions.intent === 'string' ? safeOptions.intent : '';
  const explicitSignals = isRecord(safeOptions.signals) ? safeOptions.signals : {};
  const inferredSignals = inferTaskSignals(intent);
  const classification = classifyProfile({
    legacyLevel: safeOptions.legacyLevel ?? inferTaskBaseline(intent),
    preferredProfile: safeOptions.preferredProfile ?? null,
    signals: { ...inferredSignals, ...explicitSignals },
  }, table);
  return {
    ...classification,
    projectMode: safelyMappedProfile(safeOptions.projectMode, table),
    taskProfile: classification.selectedProfile,
    intentBasis: intent,
  };
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
