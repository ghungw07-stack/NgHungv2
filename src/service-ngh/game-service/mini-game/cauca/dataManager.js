import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');

const playerPath = path.join(dataDir, 'player_data.json');
const teamsPath = path.join(dataDir, 'teams.json');
const bossStatePath = path.join(dataDir, 'boss_state.json');
const configPath = path.join(__dirname, 'game_config.json');

// Đảm bảo thư mục data tồn tại bên trong thư mục fishing
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Tải dữ liệu người chơi
export function loadPlayerData() {
    if (!fs.existsSync(playerPath)) {
        return {};
    }
    try {
        const rawData = fs.readFileSync(playerPath, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Lỗi khi đọc file player_data.json:", error);
        return {};
    }
}

// Lưu dữ liệu người chơi
export function savePlayerData(data) {
    try {
        const stringData = JSON.stringify(data, null, 2);
        fs.writeFileSync(playerPath, stringData);
    } catch (error) {
        console.error("Lỗi khi lưu file player_data.json:", error);
    }
}

// Tải cấu hình game
export function loadGameConfig() {
    try {
        const rawData = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Lỗi nghiêm trọng: Không thể đọc file game_config.json!", error);
        process.exit(1);
    }
}
export function loadTeams() {
    if (!fs.existsSync(teamsPath)) {
        return {};
    }
    try {
        const rawData = fs.readFileSync(teamsPath, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Lỗi khi đọc teams.json:", error);
        return {};
    }
}

// Thêm: Lưu dữ liệu đội ngũ
export function saveTeams(teams) {
    try {
        fs.writeFileSync(teamsPath, JSON.stringify(teams, null, 2));
    } catch (error) {
        console.error("Lỗi khi lưu teams.json:", error);
    }
}

// Thêm: Tải trạng thái boss
export function loadBossState() {
    if (!fs.existsSync(bossStatePath)) {
        return { activeBoss: null, lastSpawnTime: 0 };
    }
    try {
        const rawData = fs.readFileSync(bossStatePath, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Lỗi khi đọc boss_state.json:", error);
        return { activeBoss: null, lastSpawnTime: 0 };
    }
}

// Thêm: Lưu trạng thái boss
export function saveBossState(state) {
    try {
        fs.writeFileSync(bossStatePath, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error("Lỗi khi lưu boss_state.json:", error);
    }
}
