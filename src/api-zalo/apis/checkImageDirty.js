import axios from "axios";
import { getApiKeysMedia } from "../../utils/api-key-manager.js";

const apiInvalid = [];

export function checkImageFactory() {
	/**
	 * Check Dirty Content | Kiểm tra nội dung bẩn
	 *
	 * @param {string} imageInput | Đường dẫn đến tệp ảnh
	 * @throws {ZaloApiError}
	 */
	return async function checkImage(imageInput) {
		const response = await axios.get(imageInput, { responseType: 'arraybuffer' })
		if (response.status !== 200) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const formData = new FormData();
		formData.append('img_bytes', new Blob([response.data]));
		const zaloKeys = getApiKeysMedia("ZALO_AI");
		if (apiInvalid.length === zaloKeys.length) apiInvalid = [];
		for (const apiKey of zaloKeys) {
			if (apiInvalid.includes(apiKey)) continue;

			try {
				const response = await axios.post(
					'https://api.zalo.ai/v1/dirtycontent/filter',
					formData,
					{ headers: { 'apikey': apiKey } }
				);
				return response.data.data;
			} catch (error) {
				console.warn(`API key ${apiKey} gặp lỗi:`, error);
				apiInvalid.push(apiKey);
				continue;
			}
		}

		console.error("Tất cả API key ZALO_AI đều không khả dụng");
		throw new Error("Lỗi khi kiểm tra hình ảnh: Không có API key khả dụng");
	};
} 