import { Scene } from 'phaser';
import { EventBus } from '../EventBus.js';

export class MainMenu extends Scene {

    constructor() {
        super('MainMenu');
    }

    create() {
        const centerX = this.cameras.main.width / 2
        const centerY = this.cameras.main.height / 2

        this.add.image(centerX, centerY, 'loading_screen');

        this.add.text(centerX, centerY, 'CROAK Quest: Efrogs\' Journey', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setDepth(100).setOrigin(0.5);

        EventBus.emit('current-scene-ready', this);
    }

    changeScene(hasPlayerWon, efrogsNFTBodyBase) {
        this.scene.start('Game', {
            hasPlayerWon: hasPlayerWon,
            efrogsNFTBodyBase: efrogsNFTBodyBase
        });
    }
}
