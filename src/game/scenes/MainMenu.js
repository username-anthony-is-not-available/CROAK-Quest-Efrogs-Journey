"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainMenu = void 0;
const phaser_1 = require("phaser");
const EventBus_1 = require("../EventBus");
class MainMenu extends phaser_1.Scene {
    constructor() {
        super('MainMenu');
    }
    create() {
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;
        this.add.image(centerX, centerY, 'loading_screen');
        this.add.text(centerX, centerY, 'CROAK Quest: Efrogs\' Journey', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setDepth(100).setOrigin(0.5);
        EventBus_1.EventBus.emit('current-scene-ready', this);
    }
    changeScene(hasPlayerWon, efrogsNFTBodyBase, isOptimistic) {
        this.scene.start('Game', {
            hasPlayerWon: hasPlayerWon,
            efrogsNFTBodyBase: efrogsNFTBodyBase,
            isOptimistic: isOptimistic
        });
    }
}
exports.MainMenu = MainMenu;
