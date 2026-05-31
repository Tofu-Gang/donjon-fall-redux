import { DonjonToastProvider } from "style-guide-donjon-fall/donjon";
import { GameProvider } from "./context/GameContext.jsx";
import GameView from "./components/GameView.jsx";
import mapData from "./maps/default.json";

export default function App() {
    return (
        <DonjonToastProvider>
            <GameProvider mapData={mapData} randomizeDice={false}>
                <GameView />
            </GameProvider>
        </DonjonToastProvider>
    );
}
