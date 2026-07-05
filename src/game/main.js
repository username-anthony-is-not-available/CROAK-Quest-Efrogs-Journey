"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const phaser_1 = __importDefault(require("phaser"));
const Game_1 = require("./scenes/Game");
const MainMenu_1 = require("./scenes/MainMenu");
const Preloader_1 = require("./scenes/Preloader");
// Find out more information about the Game Config at:
// https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config = {
    type: phaser_1.default.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0, x: 0 },
            debug: false
        }
    },
    audio: {
        disableWebAudio: true
    },
    scale: {
        mode: phaser_1.default.Scale.FIT,
        autoCenter: phaser_1.default.Scale.CENTER_BOTH
    },
    parent: 'game-container',
    backgroundColor: '#111111',
    scene: [
        Preloader_1.Preloader,
        MainMenu_1.MainMenu,
        Game_1.Game
    ]
};
const StartGame = (parent) => {
    return new phaser_1.default.Game({ ...config, parent });
};
exports.default = StartGame;
