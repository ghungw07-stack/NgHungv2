/**
 * commandLoader.js
 * -----------------------------------------------------------------------------
 * T? d?ng quét thu m?c l?nh, load t?ng file có export `config`, và dang ký
 * vào registry trung tâm.
 *
 * Cách dùng trong command.js (ho?c b?t k? noi nào c?n dispatch l?nh):
 *
 *   import { loadCommands, dispatchCommand } from "./commandLoader.js";
 *
 *   // Kh?i d?ng m?t l?n khi bot start
 *   await loadCommands(new URL("../commands/modules", import.meta.url).pathname);
 *
 *   // Trong handler nh?n tin nh?n
 *   const handled = await dispatchCommand(commandName, api, message, ...extras);
 *
 * -----------------------------------------------------------------------------
 * C?u trúc file l?nh m?u  ?  xem  commands/modules/_template.js
 * -----------------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

// --- Registry trung tâm -------------------------------------------------------
//  key  = tên l?nh chính (lowercase)
//  value = { config, main, onReply?, onReaction?, filePath }
const _registry = new Map();

// map: alias ? tên l?nh chính
const _aliasMap = new Map();

// --- Load t?t c? l?nh t? m?t thu m?c (d? quy) -------------------------------
/**
 * @param {string} dir  Ðu?ng d?n tuy?t d?i d?n thu m?c ch?a file l?nh
 * @param {boolean} [reload=false]  true = xoá registry cu r?i load l?i
 */
export async function loadCommands(dir, reload = false) {
  if (reload) {
    _registry.clear();
    _aliasMap.clear();
  }

  if (!fs.existsSync(dir)) {
    console.warn(`[commandLoader] Thu m?c không t?n t?i: ${dir}`);
    return;
  }

  const files = _walkDir(dir);

  for (const filePath of files) {
    if (!filePath.endsWith(".js") || path.basename(filePath).startsWith("_")) {
      continue; // b? qua file b?t d?u b?ng _ (template, helper…)
    }

    try {
      // Dùng pathToFileURL d? tuong thích Windows + ESM
      const moduleURL = pathToFileURL(filePath).href;

      // Thêm ?t=... d? bypass ESM cache khi reload hot
      const importURL = reload ? `${moduleURL}?t=${Date.now()}` : moduleURL;
      const mod = await import(importURL);

      if (!mod.config) continue; // file không export config ? b? qua

      const cfg = mod.config;
      const name = cfg.name?.toLowerCase();
      const main = mod.main ?? cfg.main;

      if (!name || typeof main !== "function") {
        console.warn(`[commandLoader] Thi?u name ho?c main: ${filePath}`);
        continue;
      }

      // Giá tr? m?c d?nh
      cfg.permission  ??= "all";
      cfg.countdown   ??= 0;
      cfg.description ??= "";
      cfg.alias       ??= [];
      cfg.type        ??= 1;      // 1=l?nh thu?ng, 5=game, 3=admin, 7=support
      cfg.active      ??= true;

      _registry.set(name, {
        config: cfg,
        main,
        onReply:    mod.onReply    ?? cfg.onReply    ?? null,
        onReaction: mod.onReaction ?? cfg.onReaction ?? null,
        filePath,
      });

      // Ðang ký alias
      for (const alias of cfg.alias) {
        _aliasMap.set(alias.toLowerCase(), name);
      }

      // G?i onLoad n?u có
      if (typeof mod.onLoad === "function") {
        try {
          await mod.onLoad();
        } catch (e) {
          console.error(`[commandLoader] onLoad th?t b?i (${name}):`, e.message);
        }
      }
    } catch (err) {
      console.error(`[commandLoader] Load th?t b?i: ${filePath}`, err.message);
    }
  }

  console.log(`[commandLoader] Ðã load ${_registry.size} l?nh t? ${dir}`);
  return _registry;
}

// --- Resolve tên l?nh (h? tr? alias) -----------------------------------------
export function resolveCommand(nameOrAlias) {
  const key = nameOrAlias.toLowerCase();
  return _registry.get(key) ?? _registry.get(_aliasMap.get(key) ?? "");
}

// --- Dispatch l?nh ------------------------------------------------------------
/**
 * Ch?y l?nh tuong ?ng n?u tìm th?y trong registry.
 *
 * @returns {boolean}  true n?u dã x? lý, false n?u không tìm th?y l?nh
 */
export async function dispatchCommand(nameOrAlias, api, message, ...extras) {
  const entry = resolveCommand(nameOrAlias);
  if (!entry) return false;

  try {
    await entry.main(api, message, ...extras);
  } catch (err) {
    console.error(`[commandLoader] L?i khi ch?y l?nh "${nameOrAlias}":`, err);
  }
  return true;
}

// --- L?y danh sách l?nh (dùng cho help, menu…) -------------------------------
export function getCommandList() {
  return Array.from(_registry.values()).map((e) => e.config);
}

export function getCommandEntry(name) {
  return resolveCommand(name) ?? null;
}

export function isCommandRegistered(name) {
  return !!resolveCommand(name);
}

// --- Sync v?i command.json (gi?ng write_command_config c?a Python) ------------
/**
 * Ð?ng b? registry hi?n t?i vào file command.json.
 *   - L?nh m?i  ? thêm v?i config m?c d?nh
 *   - L?nh cu  ? gi? nguyên tu? ch?nh dã luu (permission, countdown…)
 *   - L?nh xoá ? lo?i b? kh?i file
 *
 * @param {Function} readCommandConfig   hàm d?c file hi?n t?i
 * @param {Function} writeCommandConfig  hàm ghi file
 */
export function syncCommandConfig(readCommandConfig, writeCommandConfig) {
  const current = readCommandConfig() ?? { commands: [] };
  const oldByName = Object.fromEntries(
    (current.commands ?? []).map((c) => [c.name, c])
  );

  const newCommands = [];
  for (const [name, entry] of _registry.entries()) {
    if (oldByName[name]) {
      // Gi? nguyên tu? ch?nh cu (admin dã ch?nh tay)
      newCommands.push(oldByName[name]);
    } else {
      const cfg = entry.config;
      newCommands.push({
        name:        cfg.name,
        permission:  cfg.permission,
        description: cfg.description,
        alias:       cfg.alias,
        countdown:   cfg.countdown,
        type:        cfg.type,
        active:      cfg.active,
      });
    }
  }

  writeCommandConfig({ ...current, commands: newCommands });
}

// --- Helpers n?i b? -----------------------------------------------------------
function _walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(..._walkDir(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}