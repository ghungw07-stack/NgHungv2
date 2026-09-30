export function resolveQueuedXoSoResult(config = {}, sessionCode) {
  const configuredSession = Number(config.forcedSessionCode);
  const hasScheduledSession = Number.isInteger(configuredSession) && configuredSession > 0;
  const currentSession = Number(sessionCode);

  if (hasScheduledSession && configuredSession !== currentSession) {
    return {
      de: undefined,
      baCang: undefined,
      loNumbers: undefined,
      consume: false,
      expired: configuredSession < currentSession,
    };
  }

  const hasQueuedResult =
    config.nextDe !== undefined ||
    config.nextBaCang !== undefined ||
    config.nextLoNumbers !== undefined;
  return {
    de: config.nextDe,
    baCang: config.nextBaCang,
    loNumbers: config.nextLoNumbers,
    consume: hasQueuedResult,
    expired: false,
  };
}
