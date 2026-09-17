export function isSendTaskEnabled(settings) {
  return settings?.sendTask === true && settings?.sendTaskExplicitlyEnabled === true;
}
