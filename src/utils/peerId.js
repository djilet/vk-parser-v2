export function parsePeerIdFromMsgUrl(msgUrl) {
  if (!msgUrl || typeof msgUrl !== 'string') {
    return null;
  }

  const match = msgUrl.match(/\/im\/convo\/(-?\d+)/);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}
