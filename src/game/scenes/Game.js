"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = void 0;
const phaser_1 = __importDefault(require("phaser"));
const EventBus_1 = require("../EventBus");
class Game extends phaser_1.default.Scene {
    constructor() {
        super('Game');
        this.isGameOver = false;
        this.lilyPadCount = 0;
        this.safeZoneWidth = 200;
        this.lilyPadSpeed = 200;
        this.spawnInterval = 250;
        this.spawnedLilyPads = 0;
        this.totalGameTime = 4000; // 4 seconds in milliseconds
        this.colors = {
            "Black": [0x4b4755],
            "Grey": [0x998aa1],
            "Red": [0xfe5165],
            "Blue": [0x00b8e6],
            "Green": [0x31a076],
            "Orange": [0xff745b],
            "Furry": [0x712e59],
            "Ninja": [0x2d3548],
            "Spotted": [0x905a72],
            "Crystal": [0x0092b7],
            "Puffer Fish": [0xff5738],
            "Skeleton": [0x9aabb2],
            "Psychedelic Wave": [0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff, 0x4b0082, 0x8b00ff],
            "Snow Camouflage": [0x9aabb2],
            "Alien": [0x0093bb],
            "Desert": [0x968072],
            "Not found": [0xade890]
        };
        this.efrogsNFTBodyBase = this.colors["Not found"];
        this.hasPlayerWon = false;
        this.isOptimistic = false;
        this.isResolutionPending = false;
        this.centerX = 0;
        this.centerY = 0;
        this.twentyPercentY = 0;
        this.ninetyPercentY = 0;
        this.winningLilyPad = null;
        this.tintIndex = 0;
        this.isFinalActionStarted = false;
        this.finalActionDuration = 0;
        this.finalActionStartTime = 0;
    }
    init(data) {
        this.isGameOver = false;
        this.lilyPadCount = phaser_1.default.Math.Between(5, 10);
        this.hasPlayerWon = data.hasPlayerWon;
        this.isOptimistic = data.isOptimistic || false;
        this.isResolutionPending = this.isOptimistic;
        if (data.efrogsNFTBodyBase !== undefined) {
            this.efrogsNFTBodyBase = this.colors[data.efrogsNFTBodyBase] || this.colors["Not found"];
        }
        this.centerX = this.cameras.main.width / 2;
        this.centerY = this.cameras.main.height / 2;
        this.twentyPercentY = this.cameras.main.height * 0.2;
        this.ninetyPercentY = this.cameras.main.height * 0.9;
    }
    create() {
        this.createWater();
        this.createLilyPads();
        this.createFrog();
        this.createSplashes();
        this.startGame();
        EventBus_1.EventBus.emit('current-scene-ready', this);
    }
    createSplashes() {
        if (!this.splashes) {
            this.splashes = this.add.group({
                classType: phaser_1.default.GameObjects.Sprite,
                maxSize: 5
            });
        }
    }
    createWater() {
        if (this.waterTexture) {
            this.waterTexture.tilePositionX = 0;
            this.waterTexture.tilePositionY = 0;
        }
        else {
            this.waterTexture = this.add.tileSprite(0, 0, this.cameras.main.width, this.cameras.main.height, 'water')
                .setOrigin(0, 0);
        }
    }
    createFrog() {
        if (this.frog) {
            this.frog.setPosition(this.centerX, this.ninetyPercentY);
            this.frog.setVisible(true);
            this.frog.setAlpha(1);
            this.frog.setGravityY(0);
            this.frog.setVelocity(0, 0);
            this.frog.body.allowGravity = false;
        }
        else {
            this.frog = this.physics.add.sprite(this.centerX, this.ninetyPercentY, 'frog')
                .setDepth(2);
        }
        if (this.efrogsNFTBodyBase.length === 1) {
            this.frog.setTint(this.efrogsNFTBodyBase[0]);
        }
        else {
            this.tintIndex = 0;
            // Only add the timer if it doesn't exist yet to avoid multiple timers on reset
            // However, Phaser.Scene.time.addEvent returns a TimerEvent, but we don't store it.
            // Let's just check if we already have a tint timer.
            // Wait, we don't have a reference to it. Let's just create it once.
            this.time.addEvent({
                delay: 500,
                callback: this.changeTint,
                callbackScope: this,
                loop: true
            });
        }
    }
    changeTint() {
        if (this.frog && this.frog.active) {
            this.frog.setTint(this.efrogsNFTBodyBase[this.tintIndex]);
            this.tintIndex = (this.tintIndex + 1) % this.efrogsNFTBodyBase.length;
        }
    }
    createLilyPads() {
        if (!this.lilyPads) {
            this.lilyPads = this.physics.add.group({
                classType: phaser_1.default.Physics.Arcade.Image,
                maxSize: 20,
                runChildUpdate: false
            });
        }
        else {
            this.lilyPads.children.entries.forEach(child => {
                const lilyPad = child;
                this.lilyPads.killAndHide(lilyPad);
                lilyPad.body.enable = false;
            });
        }
        this.startLilyPad = this.spawnLilyPadInstance(this.centerX, this.ninetyPercentY);
        this.startLilyPad.setDepth(1);
        this.startLilyPad.setVelocity(0, 0);
    }
    spawnLilyPadInstance(x, y) {
        const lilyPad = this.lilyPads.get(x, y, 'lily_pad');
        if (lilyPad) {
            lilyPad.setActive(true);
            lilyPad.setVisible(true);
            lilyPad.setPosition(x, y);
            lilyPad.body.enable = true;
            lilyPad.setTint(0xffffff); // Reset tint
            lilyPad.setAngle(0); // Reset angle
            if (lilyPad.body) {
                lilyPad.body.reset(x, y);
            }
        }
        return lilyPad;
    }
    update() {
        if (this.isGameOver)
            return;
        this.waterTexture.tilePositionY -= 1;
        const waveSpeed = 2;
        const waveAmplitude = 2;
        const waveFrequency = 0.05;
        // Calculate the new X position using a sine wave
        const waveOffset = waveFrequency;
        this.waterTexture.tilePositionX -= waveAmplitude * Math.sin(waveOffset) * waveSpeed;
        if (this.frog.y <= this.twentyPercentY) {
            this.gameOver();
        }
        else if (this.frog.y > this.cameras.main.height) {
            this.gameOver();
        }
        this.lilyPads.children.entries.forEach(child => {
            const lilyPad = child;
            if (lilyPad.active && lilyPad.y > this.cameras.main.height) {
                this.lilyPads.killAndHide(lilyPad);
                lilyPad.body.enable = false;
                this.tweens.killTweensOf(lilyPad);
            }
        });
    }
    startGame() {
        const regularLilyPadTime = this.spawnInterval * this.lilyPadCount;
        const finalActionDelay = regularLilyPadTime + 250;
        const finalActionDuration = this.totalGameTime - finalActionDelay;
        this.time.addEvent({
            delay: this.spawnInterval,
            callback: this.spawnLilyPad,
            callbackScope: this,
            repeat: this.lilyPadCount - 1
        });
        this.time.delayedCall(finalActionDelay, this.startFinalAction, [finalActionDuration], this);
    }
    spawnLilyPad() {
        this.spawnedLilyPads++;
        let x;
        do {
            x = phaser_1.default.Math.Between(0, this.cameras.main.width);
        } while (Math.abs(x - this.centerX) < this.safeZoneWidth / 2);
        const lilyPad = this.spawnLilyPadInstance(x, -50);
        if (lilyPad) {
            lilyPad.setVelocityY(this.lilyPadSpeed);
            this.tweens.add({
                targets: lilyPad,
                angle: { from: -5, to: 5 },
                duration: 3000,
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1
            });
        }
    }
    startFinalAction(duration) {
        this.isFinalActionStarted = true;
        this.finalActionDuration = duration;
        this.finalActionStartTime = this.time.now;
        if (this.hasPlayerWon) {
            this.spawnWinningLilyPad(duration);
        }
        this.jump(duration);
        this.startLilyPad.setVelocityY(this.lilyPadSpeed);
    }
    spawnWinningLilyPad(duration) {
        this.winningLilyPad = this.spawnLilyPadInstance(this.centerX, -50);
        if (this.winningLilyPad) {
            this.winningLilyPad.setTint(0xffff00);
            this.tweens.add({
                targets: this.winningLilyPad,
                y: this.twentyPercentY,
                duration: duration,
                ease: 'Linear',
                onComplete: () => {
                    if (this.winningLilyPad && this.winningLilyPad.active) {
                        this.winningLilyPad.setVelocityY(0);
                    }
                }
            });
        }
    }
    jump(duration) {
        this.tweens.add({
            targets: this.frog,
            y: this.twentyPercentY,
            duration: duration,
            ease: 'Power2',
            onComplete: () => {
                if (this.isResolutionPending) {
                    // Still waiting for resolution at the peak, wait a bit or just treat as loss for now?
                    // Let's wait another 2 seconds maximum for resolution before falling
                    this.time.delayedCall(2000, () => {
                        if (this.isResolutionPending || !this.hasPlayerWon) {
                            this.fall();
                        }
                        else {
                            this.gameOver();
                        }
                    });
                }
                else if (!this.hasPlayerWon) {
                    this.fall();
                }
                else {
                    this.gameOver();
                }
            }
        });
    }
    fall() {
        this.frog.setGravityY(300);
        if (!this.anims.exists('frog_jump_splash')) {
            this.anims.create({
                key: 'frog_jump_splash',
                frames: this.anims.generateFrameNumbers('splash', { start: 0, end: 3 }),
                frameRate: 10,
                repeat: 0
            });
        }
        const splash = this.splashes.get(this.frog.x, this.frog.y, 'splash');
        if (splash) {
            splash.setActive(true);
            splash.setVisible(true);
            splash.setPosition(this.frog.x, this.frog.y);
            splash.play('frog_jump_splash');
            splash.once('animationcomplete', () => {
                this.splashes.killAndHide(splash);
            });
        }
        // Game over will be triggered by update() when frog falls below screen height
    }
    gameOver() {
        this.isGameOver = true;
        this.frog.setVelocity(0, 0);
        this.frog.body.allowGravity = false;
        if (!this.hasPlayerWon) {
            this.frog.setVisible(false);
        }
        this.lilyPads.children.entries.forEach(child => {
            const lilyPad = child;
            lilyPad.setVelocity(0, 0);
        });
        const gameOverText = this.hasPlayerWon ? 'Victory!' : 'Better Luck Next Time!';
        this.add.text(this.centerX, this.centerY, gameOverText, {
            fontFamily: 'Arial Black',
            fontSize: 64,
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5).setDepth(100);
        EventBus_1.EventBus.emit('game-over', this);
    }
    resolveOptimisticBet(won) {
        this.hasPlayerWon = won;
        this.isResolutionPending = false;
        // If we are already in final action phase and won, we need to spawn the winning lily pad if it's not there
        if (this.isFinalActionStarted && this.hasPlayerWon && !this.winningLilyPad) {
            const remainingDuration = this.finalActionDuration - (this.time.now - this.finalActionStartTime);
            if (remainingDuration > 0) {
                this.spawnWinningLilyPad(remainingDuration);
            }
        }
    }
    cancelOptimisticBet() {
        this.hasPlayerWon = false;
        this.isResolutionPending = false;
    }
    resetGame(hasPlayerWon, efrogsNFTBodyBase, isOptimistic) {
        this.isGameOver = false;
        this.lilyPadCount = phaser_1.default.Math.Between(5, 10);
        this.hasPlayerWon = hasPlayerWon;
        this.isOptimistic = isOptimistic || false;
        this.isResolutionPending = this.isOptimistic;
        this.isFinalActionStarted = false;
        this.winningLilyPad = null;
        if (efrogsNFTBodyBase !== undefined) {
            this.efrogsNFTBodyBase = this.colors[efrogsNFTBodyBase] || this.colors["Not found"];
        }
        this.createWater();
        this.createLilyPads();
        this.createFrog();
        this.startGame();
    }
}
exports.Game = Game;
