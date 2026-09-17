import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import { tempDir } from "../../../../utils/io-json.js";
import { randomIDTemp } from "../../../../utils/format-util.js";
import GIFEncoder from 'gifencoder';
import { getActiveCanvasStyle } from "../../../../utils/canvas/theme.js";

const createGif360 = (imagePath, outputGifPath) => {
  return new Promise((resolve, reject) => {
    const filter = `
      rotate=PI*2*t/5:c=black@0.0:ow=rotw(iw):oh=roth(ih)
    `;

    ffmpeg(imagePath)
      .inputOptions('-loop', '1') // Lặp ảnh đầu vào
      .outputOptions('-vf', filter) // Áp dụng filter xoay 360 độ
      .outputOptions('-t', '5') // Thời gian của GIF là 5 giây
      .outputOptions('-r', '30') // Tốc độ khung hình 30 FPS
      .outputOptions('-y') // Ghi đè file nếu tồn tại
      .save(outputGifPath)
      .on('end', () => {
        console.log('GIF xoay 360 độ đã được tạo thành công!');
        resolve(outputGifPath);
      })
      .on('error', (err) => {
        console.error('Lỗi khi tạo GIF:', err.message);
        reject(err);
      });
  });
};

export async function createSpinningDiscGif(imageUrl, idImage = randomIDTemp()) {
  try {

    const size = 100; 
    const fps = 30; 
    const duration = 2; 
    const totalFrames = fps * duration;
    const activeStyle = getActiveCanvasStyle();
    
    // Tạo đường dẫn cho các file tạm
    const frameDir = path.join(tempDir, `frames_${idImage}`);
    const outputGif = path.join(tempDir, `spinning_${idImage}.gif`);
    
    // Tạo thư mục chứa frames
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir);
    }

    // Tải và xử lý ảnh gốc
    const image = await loadImage(imageUrl);
    
    // Tạo từng frame
    for (let i = 0; i < totalFrames; i++) {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext("2d");
      
      // Tính góc xoay cho frame hiện tại
      const rotation = (i / totalFrames) * Math.PI * 2;
      
      // Thiết lập background trong suốt
      ctx.clearRect(0, 0, size, size);
      
      ctx.save();
      ctx.translate(size / 2, size / 2);
      
      ctx.rotate(rotation);
      ctx.beginPath();
      ctx.arc(0, 0, size / 2 - 10, 0, Math.PI * 2);
      ctx.clip();
      
      const scale = Math.max(size / image.width, size / image.height);
      ctx.drawImage(
        image,
        -image.width * scale / 2,
        -image.height * scale / 2,
        image.width * scale,
        image.height * scale
      );
      ctx.restore();

      ctx.beginPath();
      if (activeStyle === 3) ctx.roundRect(8, 8, size - 16, size - 16, 16);
      else if (activeStyle === 4) ctx.roundRect(5, 16, size - 10, size - 32, 28);
      else ctx.arc(size / 2, size / 2, size / 2 - 7, 0, Math.PI * 2);
      ctx.strokeStyle = activeStyle === 2 ? "#22d3ee" : activeStyle === 3 ? "#d6b56c" : activeStyle === 4 ? "#ef476f" : activeStyle === 5 ? `hsl(${Math.round(i / totalFrames * 360)}, 88%, 70%)` : "rgba(255,255,255,.75)";
      ctx.lineWidth = activeStyle === 3 ? 6 : 4;
      ctx.stroke();
      
      const frameFile = path.join(frameDir, `frame_${i.toString().padStart(4, '0')}.png`);
      const out = fs.createWriteStream(frameFile);
      const stream = canvas.createPNGStream();
      stream.pipe(out);
      await new Promise((resolve) => out.on('finish', resolve));
    }

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(frameDir, 'frame_%04d.png'))
        .inputFPS(fps)
        .outputOptions([
          '-vf', 'scale=300:-1:flags=lanczos',
          '-gifflags', '+transdiff',
          '-y'
        ])
        .toFormat('gif')
        .on('end', resolve)
        .on('error', reject)
        .save(outputGif);
    });

    fs.rmSync(frameDir, { recursive: true, force: true });

    return outputGif;

  } catch (error) {
    console.error("Lỗi khi tạo GIF:", error);
    throw error;
  }
}

export async function createTextEffectGif(text, textColors = null, backgroundColor = null) {
  try {
    const width = 200;
    const height = 50;
    const gifPath = path.join(tempDir, `giftext_${randomIDTemp()}.gif`);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const encoder = new GIFEncoder(width, height);
    const stream = fs.createWriteStream(gifPath);

    encoder.createReadStream().pipe(stream);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(20);
    encoder.setQuality(10);
    const mainFontSize = 30;
    ctx.font = `${mainFontSize}px sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const moveStep = 2;
    const totalFrames = Math.ceil((textWidth + width) / moveStep);
    const bgColor = backgroundColor || '#000000';
    const activeStyle = getActiveCanvasStyle();
    const gifThemes = {
      1: [bgColor, "#FFFFFF"], 2: ["#020617", "#22d3ee"], 3: ["#faf4e7", "#292524"],
      4: ["#fff1f2", "#ef476f"], 5: ["#29135f", "#5eead4"],
    };
    const gifTheme = gifThemes[activeStyle] || gifThemes[1];

    for (let i = 0; i < totalFrames; i++) {
      ctx.fillStyle = gifTheme[0];
      ctx.fillRect(0, 0, width, height);
      if (textColors && textColors.length > 0) {
        if (textColors.length === 1) {
          ctx.fillStyle = textColors[0];
        } else {
          const gradient = ctx.createLinearGradient(0, 0, width, 0);
          textColors.forEach((color, index) => {
            const position = index / (textColors.length - 1);
            gradient.addColorStop(position, color);
          });
          ctx.fillStyle = gradient;
        }
      } else {
        ctx.fillStyle = gifTheme[1];
      }

      ctx.font = `${mainFontSize}px sans-serif`;
      const textX = activeStyle === 4 ? -textWidth + i * moveStep : width - i * moveStep;
      ctx.fillText(text, textX, height / 2 + mainFontSize / 3);

      encoder.addFrame(ctx);
    }

    encoder.finish();

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    return gifPath;
  } catch (error) {
    console.error('Lỗi khi tạo GIF văn bản:', error);
    throw error;
  }
}
