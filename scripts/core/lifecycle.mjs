const immutableMapping = (stage, concern = null) => Object.freeze({ stage, concern });

export const LEGACY_STAGE_MAP = Object.freeze({
  intake: immutableMapping('frame'),
  opportunity: immutableMapping('frame'),
  requirements: immutableMapping('specify'),
  design: immutableMapping('specify'),
  architecture: immutableMapping('specify'),
  planning: immutableMapping('specify'),
  implementation: immutableMapping('build'),
  verification: immutableMapping('verify'),
  learning: immutableMapping(null, 'learn'),
  release: immutableMapping(null, 'post_close_release'),
});

const FACADE_ROUTES = Object.freeze({
  frame: 'detect-project-stage.mjs',
  specify: 'init-change.mjs',
  build: 'generate-continue-packet.mjs',
  verify: 'run-validation-profile.mjs',
  close: 'audit-close-gate.mjs',
});

export function mapLegacyStage(legacyStage) {
  const normalized = typeof legacyStage === 'string' ? legacyStage.trim().toLowerCase() : '';
  const mapped = LEGACY_STAGE_MAP[normalized];

  if (mapped) {
    return {
      legacyStage: normalized,
      ...mapped,
      supported: true,
    };
  }

  return {
    legacyStage: normalized,
    stage: null,
    concern: null,
    supported: false,
  };
}

export function facadeRoute(stage) {
  const normalized = typeof stage === 'string' ? stage.trim().toLowerCase() : '';
  return FACADE_ROUTES[normalized] ?? null;
}
