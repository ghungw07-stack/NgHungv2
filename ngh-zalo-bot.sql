/*
 Navicat Premium Data Transfer

 Source Server         : ngh
 Source Server Type    : MySQL
 Source Server Version : 100432
 Source Host           : localhost:3306
 Source Schema         : bot-zalo-ngh

 Target Server Type    : MySQL
 Target Server Version : 100432
 File Encoding         : 65001

 Date: 07/04/2025 20:02:58
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for account
-- ----------------------------
DROP TABLE IF EXISTS `account`;
CREATE TABLE `account`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `create_time` timestamp NULL DEFAULT current_timestamp,
  `update_time` timestamp NULL DEFAULT current_timestamp,
  `ban` smallint NOT NULL DEFAULT 0,
  `point_post` int NOT NULL DEFAULT 0,
  `last_post` int NOT NULL DEFAULT 0,
  `role` int NOT NULL DEFAULT -1,
  `is_admin` tinyint(1) NOT NULL DEFAULT 0,
  `last_time_login` timestamp NOT NULL DEFAULT '2002-05-07 14:00:00',
  `last_time_logout` timestamp NOT NULL DEFAULT '2002-05-07 14:00:00',
  `ip_address` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL,
  `active` int NOT NULL DEFAULT 0,
  `thoi_vang` int NOT NULL DEFAULT 0,
  `server_login` int NOT NULL DEFAULT -1,
  `bd_player` double NULL DEFAULT 1,
  `is_gift_box` tinyint(1) NULL DEFAULT 0,
  `gift_time` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT '0',
  `reward` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `vnd` varchar(360) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0',
  `tongnap` int NOT NULL,
  `account_count` int NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `username`(`username` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of account
-- ----------------------------
INSERT INTO `account` VALUES (1, 'ngh', 'ngh', '2024-10-29 09:44:05', '2024-10-29 09:44:05', 0, 0, 0, -1, 0, '2002-05-07 14:00:00', '2002-05-07 14:00:00', NULL, 0, 0, -1, 1, 0, '0', NULL, '0', 0, NULL);

-- ----------------------------
-- Table structure for players_zalo
-- ----------------------------
DROP TABLE IF EXISTS `players_zalo`;
CREATE TABLE `players_zalo`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `idUserZalo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '-1',
  `playerName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `balance` DECIMAL(65,0) NULL DEFAULT 10000,
  `registrationTime` datetime NULL DEFAULT NULL,
  `totalWinnings` decimal(65, 0) NULL DEFAULT 0,
  `totalLosses` decimal(65, 0) NULL DEFAULT 0,
  `netProfit` bigint NULL DEFAULT 0,
  `totalWinGames` bigint NULL DEFAULT 0,
  `totalGames` bigint NULL DEFAULT 0,
  `winRate` decimal(5, 2) NULL DEFAULT 0.00,
  `lastDailyReward` datetime NULL DEFAULT NULL,
  `isBanned` tinyint(1) NULL DEFAULT 0,
  `serverId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `username`(`username` ASC) USING BTREE,
  INDEX `idUserZalo`(`idUserZalo` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of players_zalo
-- ----------------------------
INSERT INTO `players_zalo` VALUES (1, 'ngh', '2287924542876122296', 'N D Q', '109968536000', '2024-10-29 09:44:05', 0, 0, 0, 0, 0, 0.00, '2025-03-25 15:27:53', 0, '2287924542876122296');

SET FOREIGN_KEY_CHECKS = 1;
