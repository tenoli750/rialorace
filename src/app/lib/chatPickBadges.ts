export async function listChatPickBadges(marketId: string, targetRaceStartedAt: string) {
  const response = await fetch("/api/list-chat-pick-badges", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      marketId,
      targetRaceStartedAt
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && typeof data.error === "string"
        ? data.error
        : "Could not load chat pick badges.";
    throw new Error(message);
  }

  return (data?.badges && typeof data.badges === "object" ? data.badges : {}) as Record<string, string>;
}
