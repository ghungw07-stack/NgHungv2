import os from "os";
import si from "systeminformation";
import disk from "diskusage";
import { readFileSync } from "fs";
import { join } from "path";
import { exec, execFile } from "child_process";
import { getUserInfoBasic } from "./user-info.js";
import { createBotInfoImage, clearImagePath } from "../../utils/canvas/index.js";
import { getConfigStatus } from "./group-info.js";
import { getNameServer } from "../chat-zalo/chat-style/chat-style.js";

class SystemInfo {
  constructor() {
    this.platform = os.platform();
  }

  async getSystemStats() {
    try {
      if (this.platform === "win32") {
        return await this.getWindowsStats();
      } else if (this.platform === "linux") {
        return await this.getLinuxStats();
      } else if (this.platform === "darwin") {
        return await this.getMacStats();
      } else {
        throw new Error("Unsupported platform");
      }
    } catch (error) {
      console.error("Error getting system stats:", error);
      return null;
    }
  }

  // CMD
  // getWindowsStats() {
  //   return new Promise((resolve, reject) => {
  //     Promise.all([
  //       this.execCommand('tasklist | find /c /v ""'),
  //       this.execCommand("wmic process get threadcount /format:table"),
  //       this.execCommand("wmic process get handlecount /format:table"),
  //     ])
  //       .then((results) => {
  //         resolve({
  //           processes: this.parseWindowsProcessCount(results[0]),
  //           threads: this.parseWindowsThreadCount(results[1]),
  //           handles: this.parseWindowsHandleCount(results[2]),
  //         });
  //       })
  //       .catch(reject);
  //   });
  // }

  // PowerShell
  getWindowsStats() {
    return new Promise((resolve, reject) => {
      const ps ="powershell.exe";
      const script = '$procs = Get-Process; "{0}" -f ($procs.Count); "{0}" -f (($procs | ForEach-Object { $_.Threads.Count } | Measure-Object -Sum).Sum); "{0}" -f (($procs | Measure-Object -Property HandleCount -Sum).Sum)';

      this.execFileCommand(ps, ["-NoProfile", "-NonInteractive", "-Command", script])
        .then((stdout) => {
          const lines = stdout
            .trim()
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

          resolve({
            processes: lines[0],
            threads: lines[1],
            handles: lines[2],
          });
        })
        .catch(reject);
    });
  }

  getLinuxStats() {
    return new Promise((resolve, reject) => {
      Promise.all([
        this.execCommand("ps -e | wc -l"),
        this.execCommand("find /proc -name 'task' -type d 2>/dev/null | wc -l"),
        this.execCommand("lsof | wc -l"),
      ])
        .then((results) => {
          resolve({
            processes: parseInt(results[0].trim()) - 1, // Trừ header
            threads: parseInt(results[1].trim()),
            handles: parseInt(results[2].trim()),
          });
        })
        .catch(reject);
    });
  }

  getMacStats() {
    return new Promise((resolve, reject) => {
      Promise.all([
        this.execCommand("ps -e | wc -l"),
        this.execCommand("ps -eM | wc -l"),
        this.execCommand("lsof | wc -l"),
      ])
        .then((results) => {
          resolve({
            processes: parseInt(results[0].trim()) - 1,
            threads: parseInt(results[1].trim()) - 1,
            handles: parseInt(results[2].trim()),
          });
        })
        .catch(reject);
    });
  }

  execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      });
    });
  }

  execFileCommand(file, args = []) {
    return new Promise((resolve, reject) => {
      execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      });
    });
  }

  parseWindowsProcessCount(output) {
    const lines = output.trim().split("\n");
    return lines.length > 0 ? parseInt(lines[0].trim()) : 0;
  }

  parseWindowsThreadCount(output) {
    const lines = output.trim().split("\n");
    let totalThreads = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 1 && !isNaN(parts[0])) {
        totalThreads += parseInt(parts[0]);
      }
    }
    return totalThreads;
  }

  parseWindowsHandleCount(output) {
    const lines = output.trim().split("\n");
    let totalHandles = 0;
    for (let i = 1; i < lines.length; i++) {
      // Skip header
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 1 && !isNaN(parts[0])) {
        totalHandles += parseInt(parts[0]);
      }
    }
    return totalHandles;
  }

  getCurrentProcessInfo() {
    return {
      pid: process.pid,
      ppid: process.ppid,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      title: process.title,
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    };
  }

  startMonitoring(interval = 5000) {
    console.log("Starting system monitoring...");

    const monitor = async () => {
      try {
        const stats = await this.getSystemStats();
        const currentProcess = this.getCurrentProcessInfo();

        console.clear();
        console.log("=== SYSTEM STATISTICS ===");
        if (stats) {
          console.log(`Processes: ${stats.processes}`);
          console.log(`Threads: ${stats.threads}`);
          console.log(`Handles: ${stats.handles}`);
        }

        console.log("\n=== CURRENT NODE.JS PROCESS ===");
        console.log(`PID: ${currentProcess.pid}`);
        console.log(`Memory Usage: ${Math.round(currentProcess.memory.rss / 1024 / 1024)} MB`);
        console.log(`CPU Time: ${currentProcess.cpu.user + currentProcess.cpu.system} microseconds`);
        console.log(`Uptime: ${Math.round(currentProcess.uptime)} seconds`);

        console.log(`\nLast updated: ${new Date().toLocaleString()}`);
      } catch (error) {
        console.error("Monitoring error:", error);
      }
    };

    monitor();

    const intervalId = setInterval(monitor, interval);

    return () => {
      clearInterval(intervalId);
      console.log("Monitoring stopped.");
    };
  }
}

const systemInfo = new SystemInfo();

export async function getBotDetails(api, message, groupSettings) {
  const threadId = message.threadId;
  const uptime = getUptime(api);
  const uptimeOS = getUptimeOS();
  const osInfo = getOsInfo();
  const memoryUsage = getMemoryUsage();
  const { onConfigs, offConfigs } = getConfigStatus(threadId, groupSettings);
  const botVersion = getBotVersion();
  const botId = api.getBotId();
  const nameServer = getNameServer(api);

  const botInfo = await getUserInfoBasic(api, botId);

  const path = os.platform() === "win32" ? "C:\\" : "/";
  const [cpuData, diskData, network, stats] = await Promise.all([
    si.currentLoad(),
    disk.check(path).catch((error) => {
      console.error("Lỗi khi check dung lượng ổ đĩa:", error);
      return { total: 0, available: 0 };
    }),
    getNetworkTotals(),
    systemInfo
      .getSystemStats()
      .then((s) => s || { processes: "N/A", threads: "N/A", handles: "N/A" })
      .catch((error) => {
        console.error("Lỗi khi lấy system stats:", error);
        return { processes: "N/A", threads: "N/A", handles: "N/A" };
      }),
  ]);
  const [networkInterfaceDefault, networkInterfaces] = await Promise.all([
    si.networkInterfaceDefault(),
    si.networkInterfaces(),
  ]);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  const usedRam = ((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(1);
  const totalRam = (totalMem / 1024 / 1024 / 1024).toFixed(1);
  const freeRam = (freeMem / 1024 / 1024 / 1024).toFixed(1);
  const usedDisk = ((diskData.total - diskData.available) / 1024 / 1024 / 1024).toFixed(1);
  const totalDisk = (diskData.total / 1024 / 1024 / 1024).toFixed(1);
  const freeDisk = (diskData.available / 1024 / 1024 / 1024).toFixed(1);

  const diskUsage = diskData ? `${usedDisk}GB ` + `/` + ` ${totalDisk}GB` + ` (Free ${freeDisk}GB)` : "N/A";

  const networkDefault =
    networkInterfaces.find((iface) => iface.iface === networkInterfaceDefault) ||
    networkInterfaces.find((iface) => !iface.internal) ||
    networkInterfaces[0] ||
    { iface: "N/A", ifaceName: "N/A", type: "unknown", virtual: false };
  const networkStats = {
    iface: networkDefault.iface,
    driver: networkDefault.ifaceName,
    type: `${getDetailNetworkType(networkDefault.type)}`,
    networkActivity: `${network.tx_bytes} GB (Sent) / ${network.rx_bytes} GB (Received)`,
    virtual: networkDefault.virtual ? `Giao Thức Mạng Ảo` : `Real Network Interface Card`,
  };

  const imageBotStats = {
    memoryUsage,
    version: botVersion,
    os: osInfo,
    uptimeOS,
    cpuModel: os.cpus()[0].model.trim(),
    cpu: `${os.cpus().length} Cores - Utilization ${cpuData.currentLoad.toFixed(1)}% `,
    processes: `${stats.processes} Processes | ${stats.threads} Threads | ${stats.handles} Handles`,
    ram: `${usedRam} GB / ${totalRam} GB (Free ${freeRam} GB)`,
    disk: diskUsage,
    network: {
      interface: networkStats.iface,
      driver: networkStats.driver,
      protocol: networkStats.virtual,
      type: networkStats.type,
      traffic: networkStats.networkActivity,
    },
  };

  let imagePath = null;
  try {
    imagePath = await createBotInfoImage(api, botInfo, uptime, imageBotStats);
    await api.sendMessage({ msg: "", attachments: [imagePath], ttl: 600000, isUseProphylactic: true, }, threadId, message.type);
  } catch (error) {
    console.error("Lỗi khi tạo hình ảnh thông tin bot:", error);
  } finally {
    if (imagePath) await clearImagePath(imagePath);
  }
}

function getOsInfo() {
  const osType = os.type();
  let typeOs = "Unknown";
  switch (osType) {
    case "Linux":
      typeOs = "Linux";
      break;
    case "Darwin":
      typeOs = "macOS";
      break;
    case "Windows_NT":
      typeOs = "Windows";
      break;
  }
  return `(${typeOs}) ${osType} ${os.release()}`;
}

function getDetailNetworkType(type) {
  switch (type) {
    case "wired":
      return "Ethernet | Kết Nối Cáp";
    case "wireless":
      return "Wireless | Kết Nối Không Dây";
    case "loopback":
      return "Loopback | Giao Tiếp Nội Bộ";
    case "bridge":
      return "Bridge | Cầu Nối Layer 2";
    case "bond":
    case "team":
      return "Link Aggregation | Gộp NIC";
    case "vlan":
      return "VLAN | Mạng Ảo Phân Vùng";
    case "virtual":
      return "Virtual | Giao Diện Ảo (VM/Container)";
    case "tunnel":
      return "Tunnel | Giao Thức Tunnel/VPN";
    case "ppp":
      return "Point-to-Point (DSL/PPPoE)";
    default:
      return "Giao thức không xác định";
  }
}

function getUptime(api) {
  let uptimeInSeconds = process.uptime();
  if (!api.apiManager.isMainBot) {
    const timeStart = api.apiManager.timeStart;
    const now = Date.now();
    uptimeInSeconds = Math.floor((now - timeStart) / 1000);
  }
  const days = Math.floor(uptimeInSeconds / 86400);
  const hours = Math.floor((uptimeInSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeInSeconds % 60);

  return `${days} ngày, ${hours} giờ, ${minutes} phút, ${seconds} giây`;
}

export async function getNetworkTotals() {
  const stats = await si.networkStats();
  const totals = stats.reduce(
    (acc, s) => {
      acc.rx_bytes += Number((s.rx_bytes / 1024 / 1024 / 1024).toFixed(2)) || 0;
      acc.tx_bytes += Number((s.tx_bytes / 1024 / 1024 / 1024).toFixed(2)) || 0;
      return acc;
    },
    { rx_bytes: 0, tx_bytes: 0 }
  );
  return totals;
}

function getUptimeOS() {
  const uptimeInSeconds = os.uptime();
  const days = Math.floor(uptimeInSeconds / 86400);
  const hours = Math.floor((uptimeInSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeInSeconds % 60);

  return `${days} ngày, ${hours} giờ, ${minutes} phút, ${seconds} giây`;
}

function getMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  const usedMem = memoryUsage.heapUsed;
  const rss = memoryUsage.rss;
  return `${Math.round((usedMem / 1024 / 1024) * 100) / 100} MB on ${
    Math.round((rss / 1024 / 1024) * 100) / 100
  } MB (Mem)`;
}

function getBotVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    return packageJson.version || "Không xác định";
  } catch (error) {
    console.error("Lỗi khi đọc phiên bản bot:", error);
    return "Không xác định";
  }
}