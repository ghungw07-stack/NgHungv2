// Định nghĩa các loại cây trồng
export const CROPS = {
  LUA: {
    code: "L1",
    name: "Lúa",
    growthTime: 60 * 60, // 1 tiếng
    waterNeeded: 100,
    waterConsumption: 20,
    harvestValue: 1800000,
    seedPrice: 20000,
    icon: "🌾",
    cropImageCode: "1"
  },
  CACHUA: {
    code: "C1",
    name: "Cà Chua",
    growthTime: 90 * 60, // 1.5 tiếng
    waterNeeded: 120,
    waterConsumption: 25,
    harvestValue: 2700000,
    seedPrice: 30000,
    icon: "🍅",
    cropImageCode: "2"
  },
  CAROT: {
    code: "C2",
    name: "Cà Rốt",
    growthTime: 120 * 60, // 2 tiếng
    waterNeeded: 90,
    waterConsumption: 18,
    harvestValue: 3200000,
    seedPrice: 35000,
    icon: "🥕",
    cropImageCode: "3"
  },
  THOM: {
    code: "T1",
    name: "Thơm",
    growthTime: 180 * 60, // 3 tiếng
    waterNeeded: 150,
    waterConsumption: 30,
    harvestValue: 6300000,
    seedPrice: 70000,
    icon: "🍍",
    cropImageCode: "4"
  },
  DUAHAU: {
    code: "D1",
    name: "Dưa Hấu",
    growthTime: 150 * 60, // 2.5 tiếng
    waterNeeded: 140,
    waterConsumption: 28,
    harvestValue: 4750000,
    seedPrice: 50000,
    icon: "🍉",
    cropImageCode: "5"
  },
  NHO: {
    code: "N1",
    name: "Nho",
    growthTime: 210 * 60, // 3.5 tiếng
    waterNeeded: 160,
    waterConsumption: 32,
    harvestValue: 8100000,
    seedPrice: 90000,
    icon: "🍇",
    cropImageCode: "6"
  },
  HOAHONG: {
    code: "H1",
    name: "Hoa Hồng",
    growthTime: 120 * 60, // 2 tiếng
    waterNeeded: 110,
    waterConsumption: 22,
    harvestValue: 3600000,
    seedPrice: 40000,
    icon: "🌹",
    cropImageCode: "7"
  },
  XOAI: {
    code: "X1",
    name: "Xoài",
    growthTime: 240 * 60, // 4 tiếng
    waterNeeded: 180,
    waterConsumption: 36,
    harvestValue: 9900000,
    seedPrice: 110000,
    icon: "🥭",
    cropImageCode: "8"
  },
  THANHLONG: {
    code: "T2",
    name: "Thanh Long",
    growthTime: 180 * 60, // 3 tiếng
    waterNeeded: 130,
    waterConsumption: 26,
    harvestValue: 5400000,
    seedPrice: 60000,
    icon: "🐉",
    cropImageCode: "9"
  },
  HOAHUONGDUONG: {
    code: "H2",
    name: "Hoa Hướng Dương",
    growthTime: 150 * 60, // 2.5 tiếng
    waterNeeded: 120,
    waterConsumption: 24,
    harvestValue: 4050000,
    seedPrice: 45000,
    icon: "🌻",
    cropImageCode: "10"
  },
  HOATULIP: {
    code: "H3",
    name: "Hoa Tulip",
    growthTime: 165 * 60, // 2.75 tiếng
    waterNeeded: 125,
    waterConsumption: 25,
    harvestValue: 4950000,
    seedPrice: 55000,
    icon: "🌷",
    cropImageCode: "11"
  },
};

// Trạng thái đất
export const SOIL_STATUS = {
  DRY: "Khô cằn",
  LOW_WATER: "Thiếu nước",
  GOOD: "Đất tốt",
};

// Định nghĩa các vật phẩm trong shop
export const SHOP_ITEMS = {
  WATER: {
    code: "W1",
    name: "Bình Nước",
    price: 10000, // x10
    icon: "💧",
    description: "Tưới nước cho cây, tăng độ ẩm lên 60%",
    effect: 60,
  },
  SHOVEL: {
    code: "S1",
    name: "Cuốc",
    price: 15000,
    icon: "⛏️",
    description: "Dùng để cuốc đất khô cằn",
    effect: 1,
  },
  LAND: {
    code: "L0",
    name: "Mảnh Đất",
    price: 10000000, // Giá cơ bản 10 triệu
    icon: "🏞️",
    description: "Mở rộng nông trại (giá tăng theo số lượng đất)",
    effect: 1,
  },
  FERTILIZER: {
    code: "F1",
    name: "Phân Bón Sơ Cấp",
    price: 20000,
    icon: "💩",
    description: "Giảm 20% thời gian phát triển của cây (chỉ dùng được 1 lần/cây)",
    effect: 0.2, // Giảm 20% thời gian
  },
  MEDIUM_FERTILIZER: {
    code: "MF1",
    name: "Phân Bón Trung Cấp",
    price: 35000,
    icon: "🌟",
    description: "Giảm 30% thời gian phát triển của cây (chỉ dùng được 1 lần/cây)",
    effect: 0.3,
  },
  SUPER_FERTILIZER: {
    code: "SF1",
    name: "Phân Bón Cao Cấp",
    price: 50000,
    icon: "✨",
    description: "Giảm 40% thời gian phát triển của cây (chỉ dùng được 1 lần/cây)",
    effect: 0.4, // Giảm 40% thời gian
  },
};

// Thêm map để tra cứu nhanh theo mã sản phẩm
export let PRODUCT_CODES = {};

// Thêm mã hạt giống
Object.entries(CROPS).forEach(([key, crop]) => {
  PRODUCT_CODES[crop.code] = { type: 'CROP', key };
});

// Thêm mã thành phẩm
Object.entries(CROPS).forEach(([key, crop]) => {
  const harvestCode = `${crop.code}_TP`;
  PRODUCT_CODES[harvestCode] = { 
    type: 'PRODUCT', 
    key,
    name: `${crop.name} (Thu hoạch)`,
    icon: crop.icon
  };
});

// Thêm mã vật phẩm
Object.entries(SHOP_ITEMS).forEach(([key, item]) => {
  PRODUCT_CODES[item.code] = { type: 'ITEM', key };
});
