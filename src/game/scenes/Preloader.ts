import { Scene } from 'phaser';

export class Preloader extends Scene {
    constructor() {
        super('Preloader');
    }

    preload() {
        this.load.setPath('assets');
        this.load.image('frog', 'frog.png');
        this.load.image('lily_pad', 'lily_pad.png');
        this.load.image('loading_screen', 'loading_screen.jpeg');
        this.load.image('water', 'water.png');

        this.load.spritesheet('splash', 'splash.png', {
            frameWidth: 200,
            frameHeight: 200
        });
    }

    create() {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start('MainMenu');
    }
}
