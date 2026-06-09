import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Check, RotateCcw, ShoppingCart } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  ADA_SLOTH_SHOP_ITEM,
  buyRacerShopItem,
  equipRacerShopItem,
  getRacerShopState,
  SHOP_ITEM_ID_ADA_SLOTH,
  SHOP_MODEL_KEY_SLOTH,
  unequipAdaShopItem
} from "../lib/shop";
import type { RacerShopItem } from "../lib/shop";

export function Shop() {
  const { user, points, setPointsBalance, refreshSession } = useAuth();
  const [items, setItems] = useState<RacerShopItem[]>([]);
  const [equipment, setEquipment] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading shop...");
  const [isBusy, setIsBusy] = useState(false);

  const slothItem = useMemo(() => {
    return (
      items.find((item) => item.id === SHOP_ITEM_ID_ADA_SLOTH) ?? {
        id: ADA_SLOTH_SHOP_ITEM.id,
        name: ADA_SLOTH_SHOP_ITEM.name,
        token_symbol: ADA_SLOTH_SHOP_ITEM.tokenSymbol,
        model_key: ADA_SLOTH_SHOP_ITEM.modelKey,
        price_points: ADA_SLOTH_SHOP_ITEM.pricePoints,
        asset_url: ADA_SLOTH_SHOP_ITEM.assetUrl,
        purchased: false,
        equipped: equipment.ADA === SHOP_MODEL_KEY_SLOTH
      }
    );
  }, [equipment, items]);

  const isEquipped = slothItem.equipped || equipment.ADA === SHOP_ITEM_ID_ADA_SLOTH || equipment.ADA === SHOP_MODEL_KEY_SLOTH;

  useEffect(() => {
    void loadShop();
  }, [user]);

  async function loadShop(nextStatus = "") {
    try {
      setIsBusy(true);
      if (!nextStatus) setStatus("Loading shop...");
      const shopState = await getRacerShopState();
      setItems(shopState.items);
      setEquipment(shopState.equipment);
      if (Number.isFinite(Number(shopState.pointsBalance))) {
        setPointsBalance(Number(shopState.pointsBalance));
      }
      setStatus(nextStatus || "Shop synced.");
    } catch (error) {
      setItems([]);
      setEquipment({});
      setStatus(error instanceof Error ? error.message : "Shop could not be loaded.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleBuy() {
    try {
      setIsBusy(true);
      const result = await buyRacerShopItem(slothItem.id);
      if (Number.isFinite(Number(result?.points_balance))) {
        setPointsBalance(Number(result?.points_balance));
      }
      await refreshSession();
      await loadShop("Sloth model purchased.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Purchase failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleEquip() {
    try {
      setIsBusy(true);
      await equipRacerShopItem(slothItem.id);
      await loadShop("ADA model changed to SLOTH.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Model could not be equipped.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUnequip() {
    try {
      setIsBusy(true);
      await unequipAdaShopItem();
      await loadShop("ADA model changed back to default.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Model could not be changed.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <section className="mb-6 rounded-lg border border-[#fed7aa] bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-xs uppercase tracking-wide text-[#8a5a44]">Shop</span>
            <h1 className="mt-1 text-3xl font-semibold text-[#9a3412]">Racer Models</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#8a5a44]">
              Buy model skins with points, then equip them on matching racers.
            </p>
          </div>
          <div className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-4 py-3">
            <div className="text-xs text-[#8a5a44]">Balance</div>
            <div className="text-xl font-semibold text-[#9a3412]">{user ? `${points.toLocaleString()} pts` : "--"}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <article className="overflow-hidden rounded-lg border border-[#fed7aa] bg-white">
          <div className="grid gap-0 lg:grid-cols-[1fr_1.05fr]">
            <div className="min-h-[360px] bg-[#171310]">
              <iframe
                title="Shasta Ground Sloth preview"
                src="/shop-model-preview.html?src=/legacy-race/assets/sloth.glb"
                className="h-full min-h-[360px] w-full border-0"
              />
            </div>
            <div className="grid content-between gap-6 p-6">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[#ffedd5] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#9a3412]">
                    ADA Skin
                  </span>
                  <span className="rounded-md border border-[#fed7aa] px-3 py-1 text-xs font-semibold text-[#8a5a44]">
                    {isEquipped ? "Equipped" : slothItem.purchased ? "Owned" : "Locked"}
                  </span>
                </div>
                <h2 className="text-2xl font-semibold text-[#9a3412]">{slothItem.name}</h2>
                <p className="mt-2 text-sm text-[#8a5a44]">
                  Replace ADA's default racer model with the SLOTH model in live race views.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <ShopMetric label="Price" value={`${slothItem.price_points.toLocaleString()} pts`} />
                <ShopMetric label="Target" value="ADA" />
                <ShopMetric label="Model" value="SLOTH" />
              </div>

              <div className="grid gap-3">
                {!user ? (
                  <Link
                    to="/login.html"
                    className="flex h-12 w-full items-center justify-center rounded-md bg-[#9a3412] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7c2d12]"
                  >
                    Login to Buy
                  </Link>
                ) : !slothItem.purchased ? (
                  <button
                    type="button"
                    onClick={() => void handleBuy()}
                    disabled={isBusy || points < slothItem.price_points}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#9a3412] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7c2d12] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Buy Sloth Model
                  </button>
                ) : isEquipped ? (
                  <button
                    type="button"
                    onClick={() => void handleUnequip()}
                    disabled={isBusy}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-[#fed7aa] bg-white px-4 text-sm font-semibold text-[#9a3412] transition-colors hover:border-[#9a3412] hover:bg-[#fff7ed] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Use Default ADA
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleEquip()}
                    disabled={isBusy}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#9a3412] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7c2d12] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    Equip on ADA
                  </button>
                )}
              </div>
            </div>
          </div>
        </article>

        <aside className="grid content-start gap-4">
          <section className="rounded-lg border border-[#fed7aa] bg-white p-5">
            <span className="text-xs uppercase tracking-wide text-[#8a5a44]">Current Setup</span>
            <h2 className="mt-1 text-xl font-semibold text-[#9a3412]">ADA Racer</h2>
            <div className="mt-4 rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-4">
              <div className="text-xs text-[#8a5a44]">Active Model</div>
              <div className="mt-1 text-lg font-semibold text-[#9a3412]">{isEquipped ? "SLOTH" : "Default ADA"}</div>
            </div>
            <Link
              to="/market02-betting.html?id=market-02"
              className="mt-4 flex h-10 items-center justify-center rounded-md border border-[#fed7aa] px-4 text-sm font-semibold text-[#9a3412] transition-colors hover:border-[#9a3412] hover:bg-[#fff7ed]"
            >
              Open ADA Market
            </Link>
          </section>

          <section className="rounded-lg border border-[#fed7aa] bg-white p-5">
            <span className="text-xs uppercase tracking-wide text-[#8a5a44]">Status</span>
            <div className="mt-3 rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-3 text-sm text-[#8a5a44]">
              {status}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function ShopMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-3">
      <div className="mb-1 text-xs text-[#8a5a44]">{label}</div>
      <div className="text-sm font-semibold text-[#9a3412]">{value}</div>
    </div>
  );
}
