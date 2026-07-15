# Zalo ChatBot Project

This Zalo ChatBot project is developed using JavaScript with the **zlbotdqt** library. The creator of this project is **NDQ x LQT**. You can find more information at [NDQ x LQT](https://github.com/Ndqitisme).

## Version Features ( v2.0.3 )

The following features are available in this version:

- **Auto Manager Group Zalo**: Includes features like:
  - Auto anti-spam
  - Filtering messages containing links
  - Filtering messages with offensive keywords
- **Automatic Welcome and Goodbye Images**: Automatically generates welcome or farewell images when members join, leave, or are kicked out of the Zalo group.
- **Social Command**: More 50 command for social group from Youtube, Facebook, Tiktok, Zing, SoundCloud.....

## Usage Instructions

1. **Configuration**: Configure the bot in the `config.json` file located in the `assets` folder. Here’s what you need to set up:
   - **Cookies**: Use the **J2TEAM Cookies** extension to obtain your cookies. You can find the extension [here](https://chrome.google.com/webstore/detail/j2team-cookies/okpidcojinmlaakglciglbpcpajaibco).
   - **IMEI**: Access Zalo Web, then open the Developer Tools (DevTools), switch to the Console tab, and enter the following command: 
     ```javascript
     localStorage.getItem('z_uuid');
     ```
   - **UserAgent**: You can either leave the default UserAgent or replace it with your own. Visit [whatmyuseragent.com](https://whatmyuseragent.com/) to check your UserAgent.

2. **Running the Bot**: After configuring the necessary settings, run the `run.bat` file to start the bot.

3. **Setting Admin Rights**: You can view the UID of the account you want to grant admin rights to via the console. Add the UID to the `list_admin.json` file in the `assets/data` folder.

4. **Restart the Tool**: Make sure to restart the tool after configuring to ensure everything works correctly.

5. **Install FFMPEG**: https://www.gyan.dev/ffmpeg/builds/

  Download: https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-full.7z

  Tạo thư mục ffmpeg ở ổ C:
  Dán toàn bộ file đã giải nén vào thư mục này

  Nhập system variables vào thanh tìm kiếm và chọn công cụ Edit the system environment variables
  Hộp thoại User variables mở ra, hãy ấn vào Path và chọn nút Edit.
  Ở cửa sổ mới, hãy lựa chọn tính năng New ở menu bên phải.
  Thêm địa chỉ C:\ffmpeg\bin và ấn OK để hoàn thành Path.
  Cuối cùng bạn sẽ thấy dòng Path đã có thêm đường dẫn phía sau xác nhận FFmpeg vừa thêm vào.

  Cuối cùng để xác minh FFmpeg Path mới thêm, hãy mở trình chạy câu lệnh Command Prompt hoặc PowerShell. 
  Hãy nhập và chạy câu lệnh dưới đây:
  ffmpeg

---

6. **Install Tensorflow and Nsfwjs**:
  ```
  npm install @tensorflow/tfjs-node
  npm install nsfwjs
  - in nsfwjs edit buffer -> buffer/index.js
  ```

Thank you for using our source code. We hope you enjoy the features it offers!
