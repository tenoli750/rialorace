export const UNIVERSAL_SLOT_LOCATION_VALUES = {
  racer1: {
    OffsetX: -0.008102738778875601,
    OffsetZ: 0.09236270202076502,
    Lift: -0.12139097979866686,
    RotationDeg: 0
  },
  racer2: {
    OffsetX: -0.008102738778875601,
    OffsetZ: 0.09236270202076502,
    Lift: -0.06,
    RotationDeg: 0
  },
  racer3: {
    OffsetX: -0.008102738778875601,
    OffsetZ: 0.09236270202076502,
    Lift: -0.06,
    RotationDeg: 0
  },
  racer4: {
    OffsetX: -0.008102738778875601,
    OffsetZ: 0.09236270202076502,
    Lift: -0.06416150061094567,
    RotationDeg: 0
  }
};

export const UNIVERSAL_SLOT_FULL_VALUES = {
  racer1: {
    OffsetX: -0.008102738778875601,
    OffsetZ: 0.09236270202076502,
    Lift: -0.12139097979866686,
    RotationDeg: 0,
    Scale: 0.34,
    MajorScale: 1.3448803876711752,
    MinorScale: 1.5658095449844573
  },
  racer2: {
    OffsetX: -0.008102738778875601,
    OffsetZ: 0.09236270202076502,
    Lift: -0.06,
    RotationDeg: 0,
    Scale: 0.47,
    MajorScale: 1.42,
    MinorScale: 1.8200000000000003
  },
  racer3: {
    OffsetX: -0.008102738778875601,
    OffsetZ: 0.09236270202076502,
    Lift: -0.06,
    RotationDeg: 0,
    Scale: 0.42,
    MajorScale: 1.52,
    MinorScale: 2.24
  },
  racer4: {
    OffsetX: -0.008102738778875601,
    OffsetZ: 0.09236270202076502,
    Lift: -0.06416150061094567,
    RotationDeg: 0,
    Scale: 0.05,
    MajorScale: 1.661130565705538,
    MinorScale: 2.758409631330628
  }
};

export const UNIVERSAL_TOKEN_SIZE_VALUES = {
  BTC: {
    Scale: 0.34,
    MajorScale: 1.3448803876711752,
    MinorScale: 1.5658095449844573
  },
  ETH: {
    Scale: 0.47,
    MajorScale: 1.42,
    MinorScale: 1.8200000000000003
  },
  SOL: {
    Scale: 0.42,
    MajorScale: 1.52,
    MinorScale: 2.24
  },
  DOGE: {
    Scale: 0.05,
    MajorScale: 1.661130565705538,
    MinorScale: 2.758409631330628
  },
  XRP: {
    Scale: 0.42,
    MajorScale: 1.42,
    MinorScale: 1.82
  },
  TRX: {
    Scale: 0.42,
    MajorScale: 1.52,
    MinorScale: 2.24
  },
  BNB: {
    Scale: 0.42,
    MajorScale: 1.52,
    MinorScale: 2.24
  },
  ADA: {
    Scale: 0.42,
    MajorScale: 1.52,
    MinorScale: 2.24
  },
  SUI: {
    Scale: 0.42,
    MajorScale: 1.52,
    MinorScale: 2.24
  },
  LTC: {
    Scale: 0.42,
    MajorScale: 1.52,
    MinorScale: 2.24
  }
};

const SLOT_ORDER = ["racer1", "racer2", "racer3", "racer4"];
const LOCATION_KEYS = ["OffsetX", "OffsetZ", "Lift", "RotationDeg"];
const FULL_SLOT_KEYS = ["OffsetX", "OffsetZ", "Lift", "RotationDeg", "Scale", "MajorScale", "MinorScale"];
const SIZE_KEYS = ["Scale", "MajorScale", "MinorScale"];
const PLACEHOLDER_BALL_SCALE = 0.45;
export function buildMarketSlotTuning(coinIds) {
  return Object.fromEntries(
    coinIds.flatMap((coinId, index) => {
      const slotValues = UNIVERSAL_SLOT_LOCATION_VALUES[SLOT_ORDER[index]];
      if (!slotValues) {
        return [];
      }

      return LOCATION_KEYS.map((key) => [`${coinId.toLowerCase()}${key}`, slotValues[key]]);
    })
  );
}

export function buildMarketSizeTuning(coinIds) {
  return Object.fromEntries(
    coinIds.flatMap((coinId) => {
      const tokenValues = UNIVERSAL_TOKEN_SIZE_VALUES[coinId];
      if (!tokenValues) {
        return [];
      }

      return SIZE_KEYS.map((key) => [`${coinId.toLowerCase()}${key}`, tokenValues[key]]);
    })
  );
}

export function buildAutomatedMarketTuning(coinIds) {
  return {
    ...buildMarketSlotTuning(coinIds),
    ...buildMarketSizeTuning(coinIds)
  };
}

export function buildPlaceholderBallTuning(coinIds) {
  return Object.fromEntries(
    coinIds.flatMap((coinId, index) => {
      const slotValues = UNIVERSAL_SLOT_FULL_VALUES[SLOT_ORDER[index]];
      if (!slotValues) {
        return [];
      }

      return FULL_SLOT_KEYS.map((key) => [
        `${coinId.toLowerCase()}${key}`,
        key === "Scale" ? PLACEHOLDER_BALL_SCALE : slotValues[key]
      ]);
    })
  );
}
