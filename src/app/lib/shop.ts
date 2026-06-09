import { getLoginSessionToken, supabase } from "./supabase";

export const SHOP_ITEM_ID_ADA_SLOTH = "ada_sloth";
export const SHOP_MODEL_KEY_SLOTH = "sloth";
export const SHOP_EQUIPMENT_STORAGE_KEY = "rialo-race-racer-equipment-v1";

export const ADA_SLOTH_SHOP_ITEM = {
  id: SHOP_ITEM_ID_ADA_SLOTH,
  name: "Shasta Ground Sloth",
  tokenSymbol: "ADA",
  modelKey: SHOP_MODEL_KEY_SLOTH,
  pricePoints: 5000,
  assetUrl: "/legacy-race/assets/sloth.glb"
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

function toError(error: unknown, fallback: string) {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return new Error(message);
  }
  return new Error(fallback);
}

export function readLocalRacerEquipment() {
  if (typeof localStorage === "undefined") return {};
  return normalizeObject(localStorage.getItem(SHOP_EQUIPMENT_STORAGE_KEY));
}

export function writeLocalRacerEquipment(equipment: Record<string, string>) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SHOP_EQUIPMENT_STORAGE_KEY, JSON.stringify(equipment));
}

export function applyShopEquipmentToLocalStorage(equipment: Record<string, string>) {
  const nextEquipment: Record<string, string> = {};
  if (equipment.ADA === SHOP_ITEM_ID_ADA_SLOTH || equipment.ADA === SHOP_MODEL_KEY_SLOTH) {
    nextEquipment.ADA = SHOP_MODEL_KEY_SLOTH;
  }
  writeLocalRacerEquipment(nextEquipment);
}

export async function getRacerShopState() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    return {
      items: [
        {
          id: ADA_SLOTH_SHOP_ITEM.id,
          name: ADA_SLOTH_SHOP_ITEM.name,
          token_symbol: ADA_SLOTH_SHOP_ITEM.tokenSymbol,
          model_key: ADA_SLOTH_SHOP_ITEM.modelKey,
          price_points: ADA_SLOTH_SHOP_ITEM.pricePoints,
          asset_url: ADA_SLOTH_SHOP_ITEM.assetUrl,
          purchased: false,
          equipped: readLocalRacerEquipment().ADA === SHOP_MODEL_KEY_SLOTH
        }
      ],
      equipment: readLocalRacerEquipment(),
      pointsBalance: null
    } satisfies RacerShopState;
  }

  const { data, error } = await supabase.rpc("get_racer_shop_state", {
    requested_session_token: sessionToken
  });
  if (error) throw toError(error, "Shop could not be loaded. Apply supabase/racer_shop.sql first.");

  const row = firstRow<any>(data);
  const equipment = normalizeObject(row?.equipment);
  applyShopEquipmentToLocalStorage(equipment);

  return {
    items: normalizeArray<RacerShopItem>(row?.items),
    equipment,
    pointsBalance: Number.isFinite(Number(row?.points_balance)) ? Number(row.points_balance) : null
  } satisfies RacerShopState;
}

export async function buyRacerShopItem(itemId = SHOP_ITEM_ID_ADA_SLOTH) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required before buying shop items.");

  const { data, error } = await supabase.rpc("buy_racer_shop_item", {
    requested_session_token: sessionToken,
    requested_item_id: itemId
  });
  if (error) throw toError(error, "Shop purchase failed.");
  return firstRow<{ purchased_item_id: string; points_balance: number; purchased: boolean; equipped: boolean }>(data);
}

export async function equipRacerShopItem(itemId = SHOP_ITEM_ID_ADA_SLOTH) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required before equipping shop items.");

  const { data, error } = await supabase.rpc("equip_racer_shop_item", {
    requested_session_token: sessionToken,
    requested_token_symbol: "ADA",
    requested_item_id: itemId
  });
  if (error) throw toError(error, "Shop item could not be equipped.");
  const row = firstRow<{ equipment: Record<string, string> }>(data);
  applyShopEquipmentToLocalStorage(normalizeObject(row?.equipment));
  return row;
}

export async function unequipAdaShopItem() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required before changing shop items.");

  const { data, error } = await supabase.rpc("equip_racer_shop_item", {
    requested_session_token: sessionToken,
    requested_token_symbol: "ADA",
    requested_item_id: null
  });
  if (error) throw toError(error, "Shop item could not be changed.");
  const row = firstRow<{ equipment: Record<string, string> }>(data);
  applyShopEquipmentToLocalStorage(normalizeObject(row?.equipment));
  return row;
}
