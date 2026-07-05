import PropTypes from 'prop-types';
import { forwardRef, useEffect, useLayoutEffect, useRef, memo } from 'react';
import { EventBus } from "./EventBus.js";
import StartGame from "./main.js";

export const PhaserGame = memo(forwardRef(function PhaserGame({ currentActiveScene, onGameOver }, ref) {
    const game = useRef();

    // Create the game inside a useLayoutEffect hook to avoid the game being created outside the DOM
    useLayoutEffect(() => {

        if (game.current === undefined) {
            game.current = StartGame("game-container");

            if (ref !== null) {
                ref.current = { game: game.current, scene: null };
            }
        }

        return () => {

            if (game.current) {
                game.current.destroy(true);
                game.current = undefined;
            }

        }
    }, [ref]);

    const currentActiveSceneRef = useRef(currentActiveScene);
    const onGameOverRef = useRef(onGameOver);

    useEffect(() => {
        currentActiveSceneRef.current = currentActiveScene;
        onGameOverRef.current = onGameOver;
    }, [currentActiveScene, onGameOver]);

    useEffect(() => {

        EventBus.on('current-scene-ready', (currentScene) => {

            if (currentActiveSceneRef.current instanceof Function) {
                currentActiveSceneRef.current(currentScene.scene.key);
            }
            if (ref && ref.current) {
                ref.current.scene = currentScene;
            }

        });

        EventBus.on('game-over', () => {
            if (onGameOverRef.current instanceof Function) {
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

// Props definitions
PhaserGame.propTypes = {
    currentActiveScene: PropTypes.func,
    onGameOver: PropTypes.func
}
