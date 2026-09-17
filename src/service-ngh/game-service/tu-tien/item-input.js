export const MAX_SHOP_QUANTITY = 1_000_000;

// Giữ khóa dữ liệu cũ để túi đồ hiện có không bị mất, nhưng nhận và hiển thị
// mã vật phẩm đã sửa chính tả.
const ITEM_CODE_ALIASES = Object.freeze({
  phuhokiep: "phukiep",
  ngodaodan: "ngoidaodan",
  ngododan: "ngoidaodan",
  tulinhchau: "tutapchau",
  sonhaxatacdo: "sonhaky",
  longcotkhoi: "longcotkhue",
  tienhuyetcothu: "tieuthienhuyet",
  batdietienkim: "batdai",
  thanhmockiem: "kiemgo",
  thanhvankiem: "thanhvan",
  xichdiemthuong: "xichdiem",
  cuulongtienkiem: "cuulong",
  phongloian: "phongloi",
  honthienkinh: "honthien",
});

const DISPLAY_CODES = Object.freeze({
  phukiep: "phuhokiep",
  ngoidaodan: "ngodaodan",
  tutapchau: "tulinhchau",
  sonhaky: "sonhaxatacdo",
  longcotkhue: "longcotkhoi",
  tieuthienhuyet: "tienhuyetcothu",
  batdai: "batdietienkim",
  kiemgo: "thanhmockiem",
  thanhvan: "thanhvankiem",
  xichdiem: "xichdiemthuong",
  cuulong: "cuulongtienkiem",
  phongloi: "phongloian",
  honthien: "honthienkinh",
});

export function resolveItemCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return ITEM_CODE_ALIASES[code] || code;
}

export function displayItemCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return DISPLAY_CODES[code] || code;
}

export function parseShopQuantity(value = "1") {
  const raw = String(value).trim().replace(/^x/i, "");
  if (!/^\d+$/.test(raw)) return null;
  const quantity = Number(raw);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_SHOP_QUANTITY) return null;
  return quantity;
}
