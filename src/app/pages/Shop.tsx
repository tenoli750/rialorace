import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Check, RotateCcw, ShoppingCart } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  SHOP_CATALOG,
  buyRacerShopItem,
  equipRacerShopItem,
  getRacerShopState,
  unequipRacerShopItem
} from "../lib/shop";
import type { RacerShopItem } from "../lib/shop";

export function Shop() {
  const { user, points, setPointsBalance } = useAuth();
  const [items, setItems] = useState<RacerShopItem[]>([]);
  const [equipment, setEquipment] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading shop...");
  const [isBusy, setIsBusy] = useState(false);

  const displayItems = useMemo(() => {
    if (items.length) return items;
    return SHOP_CATALOG.map((item) => ({
      id: item.id,
      name: item.name,
      token_symbol: item.tokenSymbol,
      model_key: item.modelKey,
      price_points: item.pricePoints,
      asset_url: item.assetUrl,
      purchased: false,
      equipped: false
    }));
  }, [items]);

  useEffect(() => {
    void loadShop();
  }, [user]);

  async function loadShop(nextStatus = "") {
    try {
      setIsBusy(true);
      if (!nextStatus) setStatus("Loading shop...");
      const shopState = await getRacerShopState(points);
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

  function isItemEquipped(item: RacerShopItem) {
    return item.equipped || equipment[item.token_symbol] === item.id || equipment[item.token_symbol] === item.model_key;
  }

  function getMarketHref(item: RacerShopItem) {
    if (item.token_symbol === "DOGE") return "/betting.html";
    if (item.token_symbol === "ADA") return "/market02-betting.html?id=market-02";
    return "/live-markets.html";
  }

  async function handleBuy(item: RacerShopItem) {
    try {
      setIsBusy(true);
      const result = await buyRacerShopItem(item.id, points);
      if (Number.isFinite(Number(result?.points_balance))) {
        setPointsBalance(Number(result?.points_balance));
      }
      await loadShop(`${item.name} purchased.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Purchase failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleEquip(item: RacerShopItem) {
    try {
      setIsBusy(true);
      await equipRacerShopItem(item.id, item.token_symbol);
      await loadShop(`${item.token_symbol} model changed to ${item.model_key}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Model could not be equipped.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUnequip(item: RacerShopItem) {
    try {
      setIsBusy(true);
      await unequipRacerShopItem(item.token_symbol);
      await loadShop(`${item.token_symbol} model changed back to default.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Model could not be changed.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <section className="mx-auto max-w-[1900px]">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-wide text-[#8a5a44]">Shop</span>
            <h1 className="mt-1 text-2xl font-semibold text-[#9a3412]">Racer Models</h1>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-[#8a5a44]">Balance</div>
            <div className="text-xl font-semibold text-[#9a3412]">{points.toLocaleString()} pts</div>
          </div>
        </header>

        <div className="grid gap-4">
          {displayItems.map((item) => {
            const equipped = isItemEquipped(item);
            return (
              <article
                key={item.id}
                className="grid min-h-[440px] w-full overflow-hidden rounded-lg border border-[#fed7aa] bg-white lg:grid-cols-[360px_1fr]"
              >
                <div className="bg-[#171310]">
                  <iframe
                    title={`${item.name} preview`}
                    src={`/shop-model-preview.html?src=${encodeURIComponent(item.asset_url)}`}
                    className="h-full min-h-[440px] w-full border-0"
                  />
                </div>

                <div className="flex min-w-0 flex-col justify-between p-5">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#ffedd5] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#9a3412]">
                        {item.token_symbol} Skin
                      </span>
                      <span className="rounded-md border border-[#fed7aa] px-3 py-1 text-xs font-semibold text-[#8a5a44]">
                        {equipped ? "Equipped" : item.purchased ? "Owned" : "Locked"}
                      </span>
                    </div>

                    <h2 className="text-2xl font-semibold text-[#9a3412]">{item.name}</h2>

                    <div className="mt-5 grid grid-cols-4 gap-4 border-y border-[#fed7aa] py-4">
                      <ShopMetric label="Price" value={`${item.price_points.toLocaleString()} pts`} />
                      <ShopMetric label="Target" value={item.token_symbol} />
                      <ShopMetric label="Model" value={item.model_key} />
                      <ShopMetric label="Active" value={equipped ? item.model_key : `Default ${item.token_symbol}`} />
                    </div>

                    <div className="mt-4 text-sm text-[#8a5a44]">{status}</div>
                  </div>

                  <div className="mt-5 grid grid-cols-[1fr_auto] gap-3">
                    {!item.purchased ? (
                      <button
                        type="button"
                        onClick={() => void handleBuy(item)}
                        disabled={isBusy || points < item.price_points}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#9a3412] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7c2d12] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Buy {item.name}
                      </button>
                    ) : equipped ? (
                      <button
                        type="button"
                        onClick={() => void handleUnequip(item)}
                        disabled={isBusy}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[#fed7aa] bg-white px-4 text-sm font-semibold text-[#9a3412] transition-colors hover:border-[#9a3412] hover:bg-[#fff7ed] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Use Default {item.token_symbol}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleEquip(item)}
                        disabled={isBusy}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#9a3412] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7c2d12] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                        Equip on {item.token_symbol}
                      </button>
                    )}

                    <Link
                      to={getMarketHref(item)}
                      className="flex h-12 items-center justify-center rounded-md border border-[#fed7aa] px-4 text-sm font-semibold text-[#9a3412] transition-colors hover:border-[#9a3412] hover:bg-[#fff7ed]"
                    >
                      Market
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ShopMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs text-[#8a5a44]">{label}</div>
      <div className="truncate text-sm font-semibold text-[#9a3412]">{value}</div>
    </div>
  );
}
