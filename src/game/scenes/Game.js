import Phaser from 'phaser';
import { EventBus } from '../EventBus.js';

export class Game extends Phaser.Scene {
    constructor() {
        super('Game');
        this.isGameOver = false;
        this.lilyPadCount = Phaser.Math.Between(5, 10);
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
    }

    init(data) {
        this.hasPlayerWon = data.hasPlayerWon;

        if (data.efrogsNFTBodyBase !== undefined) {
            this.efrogsNFTBodyBase = this.colors[data.efrogsNFTBodyBase];
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
        this.startGame();

        EventBus.emit('current-scene-ready', this);
    }

    createWater() {
        this.waterTexture = this.add.tileSprite(0, 0, this.cameras.main.width, this.cameras.main.height, 'water')
            .setOrigin(0, 0);
    }

    createFrog() {
        this.frog = this.physics.add.sprite(this.centerX, this.ninetyPercentY, 'frog')
            .setDepth(2);
        if (this.efrogsNFTBodyBase.length === 1) {
            this.frog.setTint(this.efrogsNFTBodyBase[0]);
        } else {
            this.tintIndex = 0;
            this.time.addEvent({
                delay: 500,
                callback: this.changeTint,
                callbackScope: this,
                loop: true
            });
        }
    }

    changeTint() {
        this.frog.setTint(this.efrogsNFTBodyBase[this.tintIndex]);
        this.tintIndex = (this.tintIndex + 1) % this.efrogsNFTBodyBase.length;
    }

    createLilyPads() {
        this.lilyPads = this.physics.add.group();
        this.startLilyPad = this.lilyPads.create(this.centerX, this.ninetyPercentY, 'lily_pad')
            .setDepth(1);
    }

    update() {
        if (this.isGameOver) return;

        this.waterTexture.tilePositionY -= 1;

        const waveSpeed = 2;
        const waveAmplitude = 2;
        const waveFrequency = 0.05;

        // Calculate the new X position using a sine wave
        const waveOffset = waveFrequency;
        this.waterTexture.tilePositionX -= waveAmplitude * Math.sin(waveOffset) * waveSpeed;

        if (this.frog.y <= this.twentyPercentY) {
            this.gameOver();
        } else if (this.frog.y > this.cameras.main.height) {
            this.gameOver();
        }

        this.lilyPads.children.entries.forEach(lilyPad => {
            if (lilyPad.y > this.cameras.main.height) {
                lilyPad.destroy();
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
            x = Phaser.Math.Between(0, this.cameras.main.width);
        } while (Math.abs(x - this.centerX) < this.safeZoneWidth / 2);

        const lilyPad = this.lilyPads.create(x, -50, 'lily_pad');
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

    startFinalAction(duration) {
        if (this.hasPlayerWon) {
            this.spawnWinningLilyPad(duration);
        }
        this.jump(duration);

        this.startLilyPad.setVelocityY(this.lilyPadSpeed);
    }

    spawnWinningLilyPad(duration) {
        const winningLilyPad = this.lilyPads.create(this.centerX, -50, 'lily_pad');
        winningLilyPad.setTint(0xffff00);

        this.tweens.add({
            targets: winningLilyPad,
            y: this.twentyPercentY,
            duration: duration,
            ease: 'Linear',
            onComplete: () => {
                winningLilyPad.setVelocityY(0);
            }
        });
    }

    jump(duration) {
        this.tweens.add({
            targets: this.frog,
            y: this.twentyPercentY,
            duration: duration,
            ease: 'Power2',
            onComplete: () => {
                if (!this.hasPlayerWon) {
                    this.frog.setGravityY(300);
                    this.anims.create({
                        key: 'frog_jump_splash',
                        frames: this.anims.generateFrameNumbers('splash', { start: 0, end: 3 }),
                        frameRate: 10,
                        repeat: 0
                    });
                    const splash = this.add.sprite(this.frog.x, this.frog.y, 'splash');
                    splash.play('frog_jump_splash');
                }
            }
        });
    }

    gameOver() {
        this.isGameOver = true;
        this.frog.setVelocity(0, 0);
        this.frog.body.allowGravity = false;

        if (!this.hasPlayerWon) {
            this.frog.setVisible(false);
        }

        this.lilyPads.children.entries.forEach(lilyPad => lilyPad.setVelocity(0, 0));

        const gameOverText = this.hasPlayerWon ? 'Victory!' : 'Better Luck Next Time!';
        this.add.text(this.centerX, this.centerY, gameOverText, {
            fontFamily: 'Arial Black',
            fontSize: 64,
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5).setDepth(100);

        EventBus.emit('game-over', this);
    }

    resetGame(hasPlayerWon) {
        this.isGameOver = false;
        this.lilyPadCount = Phaser.Math.Between(5, 10);
        this.hasPlayerWon = hasPlayerWon;

        this.frog.destroy();

        this.createWater();
        this.createLilyPads();
        this.createFrog();
        this.startGame();
    }
}