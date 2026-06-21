import { GameProvider } from "./context/GameContext.jsx";
import GameView from "./components/GameView.jsx";
import mapData from "./maps/default.json";

/**
 * Application root: mounts the game context provider and renders the main play screen.
 */
export default function App() {
    return (
        <GameProvider mapData={mapData} randomizeDice={false}>
            <GameView />
        </GameProvider>
    );
}
