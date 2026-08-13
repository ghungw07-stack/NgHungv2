import { sendMessageFactory } from '../../api-zalo/apis/sendMessage.js';
import { sendMessageStateQuote } from '../../service-ngh/chat-zalo/chat-style/chat-style.js';
import { getGlobalPrefix } from '../../service-ngh/service.js';

// Hàm định dạng giá trị với biểu tượng đặc biệt cho giá cao
function formatPrice(price) {
  if (!price || price === '0') return '0 VNĐ';
  
  // Loại bỏ ký tự không phải số
  const numericPrice = price.toString().replace(/[^\d]/g, '');
  const value = parseInt(numericPrice);
  
  // Định dạng với dấu phẩy
  let formatted = value.toLocaleString('vi-VN') + ' VNĐ';
  
  // Thêm biểu tượng đặc biệt cho giá cao
  if (value >= 500000000) {
    formatted = `💎 ${formatted} 💎`;
  } else if (value >= 50000000) {
    formatted = `🌟 ${formatted} ✨`;
  } else if (value >= 10000000) {
    formatted = `💰 ${formatted} 💰`;
  } else if (value >= 5000000) {
    formatted = `💎 ${formatted}`;
  }
  
  return formatted;
}

// Hàm tạo nhận xét dựa trên giá trị với nhiều mức độ chi tiết hơn
function getPriceComment(price) {
  const numericPrice = parseInt(price.toString().replace(/[^\d]/g, '')) || 0;
  
  // Tạo một số nhận xét ngẫu nhiên cho mỗi mức giá
  const comments = {
    0: [
      '😅 Sim này chưa có giá trị định giá hoặc không tồn tại!',
      '🤔 Sim này có vẻ như chưa được định giá, thử số khác nhé!',
      '❓ Không tìm thấy thông tin định giá cho sim này!',
      '😬 Sim này chưa được đánh giá giá trị, có thể là sim thường!'
    ],
    low: [ // < 1,000,000
      '💸 Giá khá bình dân, phù hợp cho người mới dùng!',
      '🛒 Sim giá rẻ, dùng tạm ổn cho sinh viên!',
      '💰 Giá phải chăng, tiết kiệm chi phí!',
      '😄 Sim rẻ tiền nhưng vẫn dùng được mà!',
      '📱 Giá bình dân, phù hợp với túi tiền khiêm tốn!'
    ],
    medium: [ // 1M - 5M
      '👍 Giá tốt, đáng cân nhắc mua!',
      '💡 Sim đẹp giá hời, không nên bỏ lỡ!',
      '✨ Giá trị tốt so với mức giá này!',
      '🎯 Đúng mức giá hợp lý cho một sim đẹp!',
      '💎 Sim chất lượng với giá hợp lý!'
    ],
    good: [ // 5M - 10M
      '💎 Sim đẹp, giá trị khá cao!',
      '🌟 Sim có phong thủy tốt, giá trị cao!',
      '🔥 Sim đẹp và đáng giá từng đồng!',
      '💫 Sim VIP với mức giá hợp lý!',
      '👑 Sim cao cấp, đầu tư xứng đáng!'
    ],
    high: [ // 10M - 50M
      '🌟 Sim VIP, giá trị rất cao!',
      '💎 Sim đẳng cấp, đầu tư lâu dài!',
      '✨ Sim phong thủy tuyệt vời, giá trị lớn!',
      '🔥 Sim hiếm có, giá trị tăng theo thời gian!',
      '💰 Sim cao cấp, biểu tượng của sự thành công!'
    ],
    ultra: [ // 50M - 500M
      '💎 Sim siêu VIP, giá trị cực khủng! 🌟',
      '👑 Sim hoàng kim, dành cho giới thượng lưu!',
      '💰 Sim đẳng cấp thế giới, giá trị triệu đô!',
      '✨ Sim phong thủy đỉnh cao, tài lộc dồi dào!',
      '🔥 Sim hiếm có khó tìm, giá trị tăng trưởng mạnh!',
      '🌟 Sim biểu tượng thành công, đầu tư thông minh!',
      '💸 Sim luxury, chỉ dành cho những người đặc biệt!'
    ],
    legendary: [ // > 500M
      '🏆 Sim huyền thoại, giá trị không tưởng! 🔥',
      '👑 Sim vua chúa, biểu tượng của sự giàu có đỉnh cao!',
      '💎 Sim kim cương, giá trị tỷ giá quốc tế!',
      '🌟 Sim phong thủy thần thánh, tài lộc vô biên!',
      '💰 Sim billion, chỉ có trong tay đại gia!',
      '✨ Sim độc nhất vô nhị, giá trị lịch sử!',
      '🔥 Sim ultimate, đỉnh cao của mọi sim số!'
    ]
  };

  let commentKey;
  if (numericPrice === 0) {
    commentKey = 0;
  } else if (numericPrice < 1000000) {
    commentKey = 'low';
  } else if (numericPrice < 5000000) {
    commentKey = 'medium';
  } else if (numericPrice < 10000000) {
    commentKey = 'good';
  } else if (numericPrice < 50000000) {
    commentKey = 'high';
  } else if (numericPrice < 500000000) {
    commentKey = 'ultra';
  } else {
    commentKey = 'legendary';
  }

  // Chọn ngẫu nhiên một nhận xét từ danh sách
  const selectedComments = comments[commentKey];
  const randomIndex = Math.floor(Math.random() * selectedComments.length);
  
  return selectedComments[randomIndex];
}

// Hàm tạo nhận xét đặc biệt cho các sim có đầu số đẹp hoặc đuôi số đặc biệt
function getSpecialSimComment(sdt) {
  const specialPrefixes = ['086', '088', '089', '096', '097', '098', '099'];
  const vipPrefixes = ['032', '033', '034', '035', '036', '037', '038', '039', '086', '088', '089'];
  const beautifulEndings = ['000', '111', '222', '333', '444', '555', '666', '777', '888', '999'];
  const luckyNumbers = ['168', '888', '999', '6868', '7979', '1234', '4321'];
  
  const prefix = sdt.substring(0, 3);
  const ending = sdt.substring(-3);
  const fullNumber = sdt.substring(3, 7); // 4 số giữa
  
  let specialComment = '';
  
  // Đầu số đặc biệt
  if (specialPrefixes.includes(prefix)) {
    specialComment += '🎉 Sim đầu số đẹp ';
  }
  
  if (vipPrefixes.includes(prefix)) {
    specialComment += '👑 Sim VIP ';
  }
  
  // Đuôi số lặp
  if (beautifulEndings.includes(ending)) {
    specialComment += `✨ Sim ${ending} thần tài `;
  }
  
  // Sim tình yêu
  if (sdt.includes('86') || sdt.includes('68')) {
    specialComment += '💕 Sim tình yêu ';
  }
  
  // Sim phong thủy tài lộc
  if (sdt.includes('79') || sdt.includes('97') || sdt.includes('39')) {
    specialComment += '💰 Sim tài lộc ';
  }
  
  // Số may mắn đặc biệt
  for (const luckyNum of luckyNumbers) {
    if (sdt.includes(luckyNum)) {
      specialComment += `🍀 Sim ${luckyNum} phát `;
      break;
    }
  }
  
  // Sim tứ quý
  const fourOfAKindMatch = sdt.match(/([0-9])\1{3}/);
  if (fourOfAKindMatch) {
    const repeatedDigit = fourOfAKindMatch[1];
    specialComment += `🔥 Sim tứ quý ${repeatedDigit} `;
  }
  
  // Sim ngũ quý
  const fiveOfAKindMatch = sdt.match(/([0-9])\1{4}/);
  if (fiveOfAKindMatch) {
    const repeatedDigit = fiveOfAKindMatch[1];
    specialComment += `💎 Sim ngũ quý ${repeatedDigit} `;
  }
  
  // Sim tam hoa
  const threeOfAKindMatch = sdt.match(/([0-9])\1{2}/);
  if (threeOfAKindMatch && !fourOfAKindMatch && !fiveOfAKindMatch) {
    const repeatedDigit = threeOfAKindMatch[1];
    specialComment += `🌟 Sim tam hoa ${repeatedDigit} `;
  }
  
  // Sim thần tài (39, 79, 97)
  if (sdt.includes('39') || sdt.includes('79') || sdt.includes('97')) {
    specialComment += '🐉 Sim thần tài ';
  }
  
  return specialComment.trim();
}

// Hàm tạo nhận xét nâng cao kết hợp giá trị và đặc điểm sim
function getEnhancedPriceComment(price, sdt) {
  const numericPrice = parseInt(price.toString().replace(/[^\d]/g, '')) || 0;
  const basicComment = getPriceComment(price);
  const specialComment = getSpecialSimComment(sdt);
  
  // Kết hợp nhận xét cơ bản với đặc điểm đặc biệt
  if (specialComment) {
    // Với sim giá cao, đặt đặc điểm lên đầu
    if (numericPrice >= 10000000) {
      return `${specialComment} | ${basicComment}`;
    } 
    // Với sim giá thấp hơn, tích hợp vào giữa
    else {
      const parts = basicComment.split(' ');
      const insertPosition = Math.floor(parts.length / 2);
      const enhancedComment = [
        ...parts.slice(0, insertPosition),
        specialComment,
        ...parts.slice(insertPosition)
      ].join(' ');
      
      return enhancedComment;
    }
  }
  
  return basicComment;
}

// Hàm lấy mức độ sim
function getSimLevel(numericPrice) {
  if (numericPrice === 0) return '📊 Mức độ: Chưa định giá';
  if (numericPrice < 1000000) return '📊 Mức độ: Sim Thường';
  if (numericPrice < 5000000) return '📊 Mức độ: Sim Đẹp';
  if (numericPrice < 10000000) return '📊 Mức độ: Sim VIP';
  if (numericPrice < 50000000) return '📊 Mức độ: Sim Siêu VIP';
  if (numericPrice < 500000000) return '📊 Mức độ: Sim Hoàng Kim';
  return '📊 Mức độ: Sim Huyền Thoại';
}

// Hàm gọi API định giá sim
async function getSimValuation(sdt) {
  try {
    const response = await fetch(`https://api.nemg.me/valuation?sdt=${encodeURIComponent(sdt)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; SimValuationBot/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.data && data.data.valuation) {
      return data.data.valuation[`${sdt}`] || '0';
    }
    
    return '0';
  } catch (error) {
    console.error('Lỗi khi gọi API định giá sim:', error);
    return null;
  }
}

// Hàm gửi tin nhắn với style quote
async function sendStyledMessage(api, message, text, isGroup, ttl = 120000) {
  // Chọn màu sắc mặc định
  let color = '#4ECDC4'; // Xanh ngọc mặc định
  
  // Gửi tin nhắn với style
  try {
    const styledMessage = {
      text: text,
      style: { 
        color: color, 
        fontSize: 14
      }
    };
    
    await sendMessageStateQuote(
      api, 
      message, 
      styledMessage.text, 
      isGroup, 
      ttl,
      false, 
      styledMessage.style
    );
    return true;
  } catch (error) {
    console.error('Lỗi khi gửi tin nhắn style:', error);
    // Fallback: gửi tin nhắn thường
    try {
      const sendMessage = sendMessageFactory(api);
      await sendMessage(
        { 
          msg: text, 
          ttl: ttl 
        },
        message.threadId,
        isGroup ? 1 : 0
      );
      return true;
    } catch (fallbackError) {
      console.error('Lỗi khi gửi tin nhắn fallback:', fallbackError);
      return false;
    }
  }
}

// Hàm xử lý lệnh định giá sim
export async function handleSimValuationCommand(api, message) {
  const threadId = message.threadId;
  const uid = message.data?.uidFrom;
  const content = message.data?.content?.trim() || '';
  const prefix = await getGlobalPrefix(api.getBotId());
  const isGroup = typeof message.isGroup !== 'undefined' ? message.isGroup : threadId !== uid;

  // Kiểm tra prefix và lệnh
  if (!content.startsWith(`${prefix}dinhgia`)) {
    return;
  }

  // Lấy số điện thoại từ content
  let sdt = content.replace(`${prefix}dinhgia`, '').trim();
  
  // Nếu không có số hoặc không hợp lệ, báo lỗi đơn giản
  if (!sdt || sdt.length !== 10 || !/^[0][3|5|7|8|9][0-9]{8}$/.test(sdt)) {
    const errorMsg = `❌ Số điện thoại không hợp lệ! Vui lòng dùng: ${prefix}dinhgia 09xxxxxxxx`;
    await sendStyledMessage(api, message, errorMsg, isGroup, 30000);
    return;
  }

  // Gọi API định giá
  const price = await getSimValuation(sdt);

  // Tạo tin nhắn phản hồi với thông tin chi tiết
  const formattedPrice = formatPrice(price);
  const enhancedComment = getEnhancedPriceComment(price, sdt);
  const numericPrice = parseInt(price.toString().replace(/[^\d]/g, '')) || 0;
  const levelInfo = getSimLevel(numericPrice);

  const response = `📱 ĐỊNH GIÁ SIM 📱\n\n` +
                  `🔢 Số điện thoại: \`${sdt}\`\n` +
                  `${levelInfo}\n` +
                  `💰 Giá trị: ${formattedPrice}\n` +
                  `💬 Nhận xét: ${enhancedComment}\n` +
                  `✨ Chúc bạn luôn 8386 ✨\n\n` +
                  `✨ Định giá bởi Hà Huy Hoàng - Cập nhật mới nhất\n` +
                  `⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}`;


  // Chọn màu sắc phù hợp với mức giá
  let color;
  if (numericPrice >= 500000000) {
    color = '#FFD700'; // Vàng kim
  } else if (numericPrice >= 50000000) {
    color = '#FF6B35'; // Cam rực rỡ
  } else if (numericPrice >= 10000000) {
    color = '#4ECDC4'; // Xanh ngọc
  } else if (numericPrice >= 5000000) {
    color = '#45B7D1'; // Xanh dương
  } else if (numericPrice > 0) {
    color = '#96CEB4'; // Xanh lá nhạt
  } else {
    color = '#FF6B6B'; // Đỏ nhạt
  }

  // Gửi tin nhắn với style quote
  const styledMessage = {
    text: response,
    style: { 
      color: color, 
      fontSize: 14
    }
  };
  
  await sendMessageStateQuote(
    api, 
    message, 
    styledMessage.text, 
    isGroup, 
    1200000,
    false, 
    styledMessage.style
  );
}
