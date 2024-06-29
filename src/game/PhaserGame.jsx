import PropTypes from 'prop-types';
import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import { EventBus } from "./EventBus.js";
import StartGame from "./main.js";

export const PhaserGame = forwardRef(function PhaserGame({ currentActiveScene, onGameOver }, ref) {
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

    useEffect(() => {

        EventBus.on('current-scene-ready', (currentScene) => {

            if (currentActiveScene instanceof Function) {
                currentActiveScene(currentScene);
            }
            ref.current.scene = currentScene;

        });

        return () => {

            EventBus.removeListener('current-scene-ready');

        }

    }, [currentActiveScene, ref])

    useEffect(() => {
        EventBus.on('game-over', () => {
            if (onGameOver instanceof Function) {
                onGameOver();
            }
        });

        return () => {
            EventBus.removeListener('game-over');
        }
    }, [onGameOver]);

    return (
        <div id="game-container"></div>
    );

});

// Props definitions
PhaserGame.propTypes = {
    currentActiveScene: PropTypes.func,
    onGameOver: PropTypes.func
}
