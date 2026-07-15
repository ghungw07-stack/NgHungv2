import axios from "axios";
import path from "path";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageWarningRequest, sendMessageImageTag } from "../../chat-zalo/chat-style/chat-style.js";
import { tempDir } from "../../../utils/io-json.js";
import { randomIDTemp } from "../../../utils/format-util.js";
import { downloadFile, deleteFile } from "../../../utils/util.js";

const CONFIG = {
  serpApiKey: process.env.SERP_API_KEY || "e937d53446a81dc7b55e0630c04121a72fbf56bea82679673ee9a207fd90ca85", // TODO: key này đã nằm trong source, nên coi là đã lộ -> đổi key mới và set qua SERP_API_KEY
  serpApiUrl: "https://serpapi.com/search",
  timeout: 15000,
  paths: {
    saveDir: tempDir,
  }
};

const getFacebookProfile = async (profileId) => {
  try {
    const params = {
      engine: "facebook_profile",
      profile_id: profileId,
      api_key: CONFIG.serpApiKey
    };

    const response = await axios.get(CONFIG.serpApiUrl, {
      params,
      timeout: CONFIG.timeout
    });

    if (response.status !== 200 || !response.data) {
      console.error(`SerpAPI Error: ${response.status}`);
      return null;
    }

    const data = response.data;
    const profileResults = data.profile_results || null;

    return profileResults;

  } catch (error) {
    console.error("Lỗi khi lấy profile Facebook qua SerpAPI:", error.message || error);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    return null;
  }
};

export async function handleFacebookProfileCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const profileId = content.replace(`${prefix}${aliasCommand}`, "").trim();

  try {
    if (!profileId) {
      const object = {
        caption: `Vui lòng nhập profile ID hoặc username Facebook\nVí dụ:\n${prefix}${aliasCommand} Modernatx\n${prefix}${aliasCommand} zuck`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    const profile = await getFacebookProfile(profileId);

    if (!profile) {
      const object = {
        caption: `Không tìm thấy profile Facebook cho: ${profileId}\n\nCó thể profile không tồn tại hoặc bị ẩn.`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    // Format thông tin profile
    let responseText = `📘 Thông tin Profile Facebook\n\n`;
    
    if (profile.name) {
      responseText += `👤 Tên: ${profile.name}\n`;
    }
    
    if (profile.alternate_name) {
      responseText += `📛 Tên khác: ${profile.alternate_name}\n`;
    }
    
    if (profile.id) {
      responseText += `🆔 ID: ${profile.id}\n`;
    } else if (profile.profile_id) {
      responseText += `🆔 Profile ID: ${profile.profile_id}\n`;
    }
    
    if (profile.username) {
      responseText += `📝 Username: ${profile.username}\n`;
    }
    
    if (profile.url) {
      responseText += `🔗 Link: ${profile.url}\n`;
    }
    
    if (profile.gender) {
      const genderMap = {
        'male': 'Nam',
        'female': 'Nữ',
        'other': 'Khác'
      };
      responseText += `⚧️ Giới tính: ${genderMap[profile.gender.toLowerCase()] || profile.gender}\n`;
    }
    
    if (profile.private !== undefined) {
      responseText += `🔒 Trạng thái: ${profile.private ? 'Riêng tư' : 'Công khai'}\n`;
    }
    
    if (profile.about) {
      responseText += `\n📄 Giới thiệu:\n${profile.about}\n`;
    }
    
    if (profile.category) {
      responseText += `\n🏷️ Danh mục: ${profile.category}\n`;
    }
    
    if (profile.followers) {
      responseText += `\n👥 Người theo dõi: ${profile.followers}\n`;
    }
    
    if (profile.likes) {
      responseText += `👍 Lượt thích: ${profile.likes}\n`;
    }
    
    if (profile.verified !== undefined) {
      responseText += `✅ Xác minh: ${profile.verified ? 'Có' : 'Không'}\n`;
    }
    
    if (profile.location) {
      responseText += `📍 Địa điểm: ${profile.location}\n`;
    }
    
    if (profile.website) {
      responseText += `🌐 Website: ${profile.website}\n`;
    }
    
    if (profile.phone) {
      responseText += `📞 Số điện thoại: ${profile.phone}\n`;
    }
    
    if (profile.email) {
      responseText += `📧 Email: ${profile.email}\n`;
    }
    
    if (profile.birthday) {
      responseText += `🎂 Sinh nhật: ${profile.birthday}\n`;
    }

    // Tải và gửi ảnh đại diện
    let imagePath = null;
    const profileImageUrl = profile.profile_picture || profile.image || null;
    
    if (profileImageUrl) {
      try {
        const tempFileName = `fb_profile_${randomIDTemp()}.jpg`;
        imagePath = path.join(CONFIG.paths.saveDir, tempFileName);
        await downloadFile(profileImageUrl, imagePath);
        
        const result = {
          caption: responseText,
          imagePath: imagePath,
        };
        
        await sendMessageImageTag(api, message, result, 30000000);
      } catch (imageError) {
        console.error("Lỗi khi tải ảnh đại diện:", imageError);
        // Nếu lỗi tải ảnh, vẫn gửi text
        const object = {
          caption: responseText + `\n⚠️ Không thể tải ảnh đại diện`,
        };
        await sendMessageWarningRequest(api, message, object, 180000);
      } finally {
        // Xóa file ảnh sau khi gửi
        if (imagePath) {
          try {
            await deleteFile(imagePath);
          } catch (deleteError) {
            console.error("Lỗi khi xóa file ảnh:", deleteError);
          }
        }
      }
    } else {
      // Không có ảnh, chỉ gửi text
      const object = {
        caption: responseText,
      };
      await sendMessageWarningRequest(api, message, object, 180000);
    }

  } catch (error) {
    console.error("Lỗi khi xử lý lệnh Facebook Profile:", error);
    const object = {
      caption: "Đã xảy ra lỗi khi lấy thông tin profile. Vui lòng thử lại sau!",
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}

