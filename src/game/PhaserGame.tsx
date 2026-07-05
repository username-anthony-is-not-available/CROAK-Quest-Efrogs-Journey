import { forwardRef, useEffect, useLayoutEffect, useRef, memo, useImperativeHandle } from 'react';
import { EventBus } from "./EventBus";
import StartGame from "./main";

export interface IPhaserGameRef {
    game: Phaser.Game | undefined;
    scene: Phaser.Scene | any | null;
}

interface IProps {
    currentActiveScene?: (sceneKey: string) => void;
    onGameOver?: () => void;
}

export const PhaserGame = memo(forwardRef<IPhaserGameRef, IProps>(function PhaserGame({ currentActiveScene, onGameOver }, ref) {
    const game = useRef<Phaser.Game>();

    // Create the game inside a useLayoutEffect hook to avoid the game being created outside the DOM
    useLayoutEffect(() => {

        if (game.current === undefined) {
            game.current = StartGame("game-container");
        }

        return () => {

            if (game.current) {
                game.current.destroy(true);
                game.current = undefined;
            }

        }
    }, []);

    useImperativeHandle(ref, () => ({
        game: game.current,
        scene: null
    }), []);

    const currentActiveSceneRef = useRef(currentActiveScene);
    const onGameOverRef = useRef(onGameOver);

    useEffect(() => {
        currentActiveSceneRef.current = currentActiveScene;
        onGameOverRef.current = onGameOver;
    }, [currentActiveScene, onGameOver]);

    useEffect(() => {

        EventBus.on('current-scene-ready', (currentScene: any) => {

            if (typeof currentActiveSceneRef.current === 'function') {
                currentActiveSceneRef.current(currentScene.scene.key);
            }
            if (ref && 'current' in ref && ref.current) {
                ref.current.scene = currentScene;
            }

        });

        EventBus.on('game-over', () => {
            if (typeof onGameOverRef.current === 'function') {
                onGameOverRef.current();
            }
        });

        return () => {

            EventBus.removeListener('current-scene-ready');
            EventBus.removeListener('game-over');

        }

    }, [ref]);

    return (
        <div id="game-container"></div>
    );

}));
