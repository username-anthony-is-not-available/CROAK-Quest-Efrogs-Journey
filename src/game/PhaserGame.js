"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhaserGame = void 0;
const react_1 = require("react");
const EventBus_1 = require("./EventBus");
const main_1 = __importDefault(require("./main"));
exports.PhaserGame = (0, react_1.memo)((0, react_1.forwardRef)(function PhaserGame({ currentActiveScene, onGameOver }, ref) {
    const game = (0, react_1.useRef)();
    // Create the game inside a useLayoutEffect hook to avoid the game being created outside the DOM
    (0, react_1.useLayoutEffect)(() => {
        if (game.current === undefined) {
            game.current = (0, main_1.default)("game-container");
        }
        return () => {
            if (game.current) {
                game.current.destroy(true);
                game.current = undefined;
            }
        };
    }, []);
    (0, react_1.useImperativeHandle)(ref, () => ({
        game: game.current,
        scene: null
    }), []);
    const currentActiveSceneRef = (0, react_1.useRef)(currentActiveScene);
    const onGameOverRef = (0, react_1.useRef)(onGameOver);
    (0, react_1.useEffect)(() => {
        currentActiveSceneRef.current = currentActiveScene;
        onGameOverRef.current = onGameOver;
    }, [currentActiveScene, onGameOver]);
    (0, react_1.useEffect)(() => {
        EventBus_1.EventBus.on('current-scene-ready', (currentScene) => {
            if (typeof currentActiveSceneRef.current === 'function') {
                currentActiveSceneRef.current(currentScene.scene.key);
            }
            if (ref && 'current' in ref && ref.current) {
                ref.current.scene = currentScene;
            }
        });
        EventBus_1.EventBus.on('game-over', () => {
            if (typeof onGameOverRef.current === 'function') {
                onGameOverRef.current();
            }
        });
        return () => {
            EventBus_1.EventBus.removeListener('current-scene-ready');
            EventBus_1.EventBus.removeListener('game-over');
        };
    }, [ref]);
    return (<div id="game-container"></div>);
}));
