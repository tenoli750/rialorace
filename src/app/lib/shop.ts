import { getLoginSessionToken, supabase } from "./supabase";

export const SHOP_ITEM_ID_ADA_SLOTH = "ada_sloth";
export const SHOP_MODEL_KEY_SLOTH = "sloth";
export const SHOP_ITEM_ID_DOGE_ANIME = "doge_anime_girl";
export const SHOP_MODEL_KEY_ANIME_GIRL = "animeGirl";
export const SHOP_EQUIPMENT_STORAGE_KEY = "rialo-race-racer-equipment-v1";
export const SHOP_PURCHASES_STORAGE_KEY = "rialo-race-racer-purchases-v1";
export const SHOP_POINTS_STORAGE_KEY = "rialo-race-racer-shop-points-v1";

const DEFAULT_LOCAL_SHOP_POINTS = 10000;
const FORCE_LOCAL_SHOP =
  import.meta.env.VITE_RACER_SHOP_LOCAL_ONLY === "true" ||
  import.meta.env.VITE_LOCAL_RACER_SHOP === "true";

export const ADA_SLOTH_SHOP_ITEM = {
  id: SHOP_ITEM_ID_ADA_SLOTH,
  name: "Shasta Ground Sloth",
  tokenSymbol: "ADA",
  modelKey: SHOP_MODEL_KEY_SLOTH,
  pricePoints: 5000,
  assetUrl: "/legacy-race/assets/sloth.glb"
};

export const DOGE_ANIME_SHOP_ITEM = {
  id: SHOP_ITEM_ID_DOGE_ANIME,
  name: "Anime Girl Racer",
  tokenSymbol: "DOGE",
  modelKey: SHOP_MODEL_KEY_ANIME_GIRL,
  pricePoints: 5000,
  assetUrl: "/legacy-race/assets/doge-anime-girl.glb"
};

export const SHOP_CATALOG = [ADA_SLOTH_SHOP_ITEM, DOGE_ANIME_SHOP_ITEM] as const;

const MODEL_KEY_BY_ITEM_ID: Record<string, string> = {
  [SHOP_ITEM_ID_ADA_SLOTH]: SHOP_MODEL_KEY_SLOTH,
  [SHOP_MODEL_KEY_SLOTH]: SHOP_MODEL_KEY_SLOTH,
  [SHOP_ITEM_ID_DOGE_ANIME]: SHOP_MODEL_KEY_ANIME_GIRL,
  [SHOP_MODEL_KEY_ANIME_GIRL]: SHOP_MODEL_KEY_ANIME_GIRL
};

const TOKEN_BY_ITEM_ID: Record<string, string> = {
  [SHOP_ITEM_ID_ADA_SLOTH]: "ADA",
  [SHOP_MODEL_KEY_SLOTH]: "ADA",
  [SHOP_ITEM_ID_DOGE_ANIME]: "DOGE",
  [SHOP_MODEL_KEY_ANIME_GIRL]: "DOGE"
};

export interface RacerShopItem {
  id: string;
  name: string;
  token_symbol: string;
  model_key: string;
  price_points: number;
  asset_url: string;
  purchased: boolean;
  equipped: boolean;
}

export interface RacerShopState {
  items: RacerShopItem[];
  equipment: Record<string, string>;
  pointsBalance: number | null;
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function normalizeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeObject(value: unknown): Record<string, string> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeObject(parsed);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => {
      return typeof entry[0] === "string" && typeof entry[1] === "string";
    })
  );
}

function fallbackItems(equipment: Record<string, string>): RacerShopItem[] {
  const purchases = readLocalRacerPurchases();
  return SHOP_CATALOG.map((item) => ({
    id: item.id,
    name: item.name,
    token_symbol: item.tokenSymbol,
    model_key: item.modelKey,
    price_points: item.pricePoints,
    asset_url: item.assetUrl,
    purchased: purchases.includes(item.id),
    equipped: equipment[item.tokenSymbol] === item.modelKey || equipment[item.tokenSymbol] === item.id
  }));
}

export function readLocalRacerEquipment() {
  if (typeof localStorage === "undefined") return {};
  return normalizeObject(localStorage.getItem(SHOP_EQUIPMENT_STORAGE_KEY));
}

export function writeLocalRacerEquipment(equipment: Record<string, string>) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SHOP_EQUIPMENT_STORAGE_KEY, JSON.stringify(equipment));
}

export function readLocalRacerPurchases() {
  if (typeof localStorage === "undefined") return [] as string[];
  return Array.from(
    new Set(
      normalizeArray<string>(localStorage.getItem(SHOP_PURCHASES_STORAGE_KEY)).filter((itemId) => {
        return SHOP_CATALOG.some((item) => item.id === itemId);
      })
    )
  );
}

function writeLocalRacerPurchases(purchases: string[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SHOP_PURCHASES_STORAGE_KEY, JSON.stringify(Array.from(new Set(purchases))));
}

function readLocalShopPoints(seedPoints?: number | null) {
  if (typeof localStorage === "undefined") {
    return Number.isFinite(Number(seedPoints)) ? Number(seedPoints) : DEFAULT_LOCAL_SHOP_POINTS;
  }

  const savedValue = localStorage.getItem(SHOP_POINTS_STORAGE_KEY);
  const saved = Number(savedValue);
  if (savedValue !== null && Number.isFinite(saved)) return saved;

  const seed = Number(seedPoints);
  const initial = Number.isFinite(seed) && seed >= DEFAULT_LOCAL_SHOP_POINTS ? seed : DEFAULT_LOCAL_SHOP_POINTS;
  localStorage.setItem(SHOP_POINTS_STORAGE_KEY, String(initial));
  return initial;
}

function writeLocalShopPoints(points: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SHOP_POINTS_STORAGE_KEY, String(Math.max(0, Math.floor(points))));
}

export function applyShopEquipmentToLocalStorage(equipment: Record<string, string>) {
  const nextEquipment: Record<string, string> = {};
  for (const [token, itemId] of Object.entries(equipment)) {
    const modelKey = MODEL_KEY_BY_ITEM_ID[itemId];
    if (modelKey) {
      nextEquipment[token] = modelKey;
    }
  }
  writeLocalRacerEquipment(nextEquipment);
}

function getLocalRacerShopState(seedPoints?: number | null) {
  const equipment = readLocalRacerEquipment();
  return {
    items: fallbackItems(equipment),
    equipment,
    pointsBalance: readLocalShopPoints(seedPoints)
  } satisfies RacerShopState;
}

function findCatalogItem(itemId: string) {
  return SHOP_CATALOG.find((item) => item.id === itemId || item.modelKey === itemId) ?? null;
}

function buyLocalRacerShopItem(itemId: string, seedPoints?: number | null) {
  const item = findCatalogItem(itemId);
  if (!item) throw new Error("Shop item not found.");

  const purchases = readLocalRacerPurchases();
  const alreadyPurchased = purchases.includes(item.id);
  const currentPoints = readLocalShopPoints(seedPoints);
  let nextPoints = currentPoints;

  if (!alreadyPurchased) {
    if (currentPoints < item.pricePoints) throw new Error("Not enough points.");
    nextPoints = currentPoints - item.pricePoints;
    writeLocalRacerPurchases([...purchases, item.id]);
    writeLocalShopPoints(nextPoints);
  }

  const equipment = readLocalRacerEquipment();
  return {
    purchased_item_id: item.id,
    points_balance: nextPoints,
    purchased: true,
    equipped: equipment[item.tokenSymbol] === item.modelKey || equipment[item.tokenSymbol] === item.id
  };
}

function equipLocalRacerShopItem(itemId: string | null, tokenSymbol?: string) {
  const cleanToken = tokenSymbol?.trim().toUpperCase();
  if (!cleanToken) throw new Error("Unknown racer token.");

  const equipment = readLocalRacerEquipment();
  if (!itemId || itemId === "default") {
    delete equipment[cleanToken];
    writeLocalRacerEquipment(equipment);
    return { equipment };
  }

  const item = findCatalogItem(itemId);
  if (!item) throw new Error("Shop item not found.");
  if (item.tokenSymbol !== cleanToken) throw new Error(`This shop item can only be equipped on ${item.tokenSymbol}.`);
  if (!readLocalRacerPurchases().includes(item.id)) throw new Error("Buy this model before equipping it.");

  equipment[cleanToken] = item.modelKey;
  writeLocalRacerEquipment(equipment);
  return { equipment };
}

function shouldUseLocalShop(sessionToken: string | null) {
  return FORCE_LOCAL_SHOP || !sessionToken;
}

function mergeRemoteShopState(row: any) {
  const remoteEquipment = normalizeObject(row?.equipment);
  applyShopEquipmentToLocalStorage(remoteEquipment);

  const equipment = readLocalRacerEquipment();
  const localPurchases = readLocalRacerPurchases();
  const remoteItems = normalizeArray<RacerShopItem>(row?.items);
  const remotePurchasedIds = remoteItems.filter((item) => item.purchased).map((item) => item.id);
  const purchases = Array.from(new Set([...localPurchases, ...remotePurchasedIds]));
  writeLocalRacerPurchases(purchases);

  const items = SHOP_CATALOG.map((catalogItem) => {
    const remoteItem = remoteItems.find((item) => item.id === catalogItem.id);
    const purchased = Boolean(remoteItem?.purchased) || purchases.includes(catalogItem.id);
    const equipped =
      Boolean(remoteItem?.equipped) ||
      equipment[catalogItem.tokenSymbol] === catalogItem.modelKey ||
      equipment[catalogItem.tokenSymbol] === catalogItem.id;

    return {
      id: catalogItem.id,
      name: remoteItem?.name ?? catalogItem.name,
      token_symbol: remoteItem?.token_symbol ?? catalogItem.tokenSymbol,
      model_key: remoteItem?.model_key ?? catalogItem.modelKey,
      price_points: Number(remoteItem?.price_points ?? catalogItem.pricePoints),
      asset_url: remoteItem?.asset_url ?? catalogItem.assetUrl,
      purchased,
      equipped
    };
  });

  return {
    items,
    equipment,
    pointsBalance: Number.isFinite(Number(row?.points_balance)) ? Number(row.points_balance) : null
  } satisfies RacerShopState;
}

export async function getRacerShopState(seedPoints?: number | null) {
  const sessionToken = getLoginSessionToken();
  if (shouldUseLocalShop(sessionToken)) return getLocalRacerShopState(seedPoints);

  const { data, error } = await supabase.rpc("get_racer_shop_state", {
    requested_session_token: sessionToken
  });
  if (error) return getLocalRacerShopState(seedPoints);

  const row = firstRow<any>(data);
  return mergeRemoteShopState(row);
}

export async function buyRacerShopItem(itemId: string, seedPoints?: number | null) {
  const sessionToken = getLoginSessionToken();
  if (shouldUseLocalShop(sessionToken)) return buyLocalRacerShopItem(itemId, seedPoints);

  const { data, error } = await supabase.rpc("buy_racer_shop_item", {
    requested_session_token: sessionToken,
    requested_item_id: itemId
  });
  if (error) return buyLocalRacerShopItem(itemId, seedPoints);
  const row = firstRow<{ purchased_item_id: string; points_balance: number; purchased: boolean; equipped: boolean }>(data);
  const item = findCatalogItem(row?.purchased_item_id ?? itemId);
  if (item) writeLocalRacerPurchases([...readLocalRacerPurchases(), item.id]);
  return row;
}

export async function equipRacerShopItem(itemId: string, tokenSymbol?: string) {
  const sessionToken = getLoginSessionToken();

  const resolvedToken = tokenSymbol ?? TOKEN_BY_ITEM_ID[itemId];
  if (!resolvedToken) throw new Error("Unknown shop item.");
  if (shouldUseLocalShop(sessionToken)) return equipLocalRacerShopItem(itemId, resolvedToken);

  const { data, error } = await supabase.rpc("equip_racer_shop_item", {
    requested_session_token: sessionToken,
    requested_token_symbol: resolvedToken,
    requested_item_id: itemId
  });
  if (error) return equipLocalRacerShopItem(itemId, resolvedToken);
  const row = firstRow<{ equipment: Record<string, string> }>(data);
  applyShopEquipmentToLocalStorage(normalizeObject(row?.equipment));
  return row;
}

export async function unequipRacerShopItem(tokenSymbol: string) {
  const sessionToken = getLoginSessionToken();
  if (shouldUseLocalShop(sessionToken)) return equipLocalRacerShopItem(null, tokenSymbol);

  const { data, error } = await supabase.rpc("equip_racer_shop_item", {
    requested_session_token: sessionToken,
    requested_token_symbol: tokenSymbol,
    requested_item_id: null
  });
  if (error) return equipLocalRacerShopItem(null, tokenSymbol);
  const row = firstRow<{ equipment: Record<string, string> }>(data);
  applyShopEquipmentToLocalStorage(normalizeObject(row?.equipment));
  return row;
}

/** @deprecated Use unequipRacerShopItem("ADA") */
export async function unequipAdaShopItem() {
  return unequipRacerShopItem("ADA");
}
