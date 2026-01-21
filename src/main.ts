import $ from 'jquery';
(window as any).$ = $;
(window as any).jQuery = $;

import './style.css'
import './classicedition.js'
import './ai.js'
import './monopoly.js'
import { initUiLogic, setupLobbyUI, nostrManager, initWalletUi } from './uiLogic'; 

// Declare legacy functions that exist on window
declare global {
  interface Window {
    initMonopoly?: () => void;
    setup?: () => void;
    loadRemoteGameState?: (state: any) => void;
  }
}

(window as any).nostrManager = nostrManager;

// Track host mode: 'new' or 'resume'
let hostMode: 'new' | 'resume' = 'new';

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Cashu Monopoly Starting...");
    
    // Initialize the Wallet UI listeners (Buy-in, Mint selection, etc.)
    initUiLogic();
    setupLobbyUI(); 
    initWalletUi();
    
    if ((window as any).initMonopoly) {
        (window as any).initMonopoly();
    }
    
    // Host mode toggle logic
    const btnHostNew = document.getElementById('btn-host-new');
    const btnHostResume = document.getElementById('btn-host-resume');
    const resumeInputSection = document.getElementById('resume-input-section');
    const hostInstructions = document.getElementById('host-instructions');
    const gameIdDisplay = document.getElementById('game-id-display');

    if (btnHostNew && btnHostResume) {
        btnHostNew.addEventListener('click', () => {
            hostMode = 'new';
            if (resumeInputSection) resumeInputSection.style.display = 'none';
            if (hostInstructions) hostInstructions.textContent = 'Generating new game...';
            if (gameIdDisplay) gameIdDisplay.textContent = 'Generating...';
            
            nostrManager.startHosting().then(id => {
                if (gameIdDisplay) gameIdDisplay.textContent = id;
            }).catch(e => {
                console.error("Failed to generate game ID:", e);
                if (gameIdDisplay) gameIdDisplay.textContent = 'Error';
            });
        });

        btnHostResume.addEventListener('click', () => {
            hostMode = 'resume';
            if (resumeInputSection) resumeInputSection.style.display = 'block';
            if (hostInstructions) hostInstructions.textContent = 'Enter an existing Game ID to resume.';
            if (gameIdDisplay) gameIdDisplay.textContent = '—';
        });
    }

    const hostResumeInput = document.getElementById('host-resume-input') as HTMLInputElement;
    if (hostResumeInput) {
        hostResumeInput.addEventListener('input', () => {
            const gameId = hostResumeInput.value.trim().toLowerCase();
            if (gameId && /^[a-f0-9]{8}$/.test(gameId)) {
                if (gameIdDisplay) gameIdDisplay.textContent = gameId;
            } else {
                if (gameIdDisplay) gameIdDisplay.textContent = '—';
            }
        });
    }

    // Start Game button handler
    const btnStart = document.getElementById("btn-start-game");
    if (btnStart) {
        btnStart.addEventListener('click', async () => {
            const hostPanel = document.getElementById('host-panel');
            const joinPanel = document.getElementById('join-panel');
            
            let currentMode = 'local';
            if (hostPanel?.style.display === 'block') {
                currentMode = 'host';
            } else if (joinPanel?.style.display === 'block') {
                currentMode = 'join';
            }

            if (currentMode === 'host') {
                const gameId = hostMode === 'resume' 
                    ? (document.getElementById('host-resume-input') as HTMLInputElement)?.value.trim().toLowerCase()
                    : null;

                if (hostMode === 'resume') {
                    if (!gameId || !/^[a-f0-9]{8}$/.test(gameId)) {
                        alert("Please enter a valid 8-character game ID.");
                        return;
                    }
                }

                try {
                    await nostrManager.startHosting(gameId ?? undefined);
                    console.log("✅ Game hosted successfully");
                } catch (e) {
                    console.error("Failed to host game:", e);
                    alert("Failed to start game: " + (e instanceof Error ? e.message : 'Unknown error'));
                    return;
                }
            } else if (currentMode === 'join') {
                const gameId = (document.getElementById('join-game-input') as HTMLInputElement)?.value.trim().toLowerCase();
                if (!gameId || !/^[a-f0-9]{8}$/.test(gameId)) {
                    alert("Please enter a valid 8-character game ID.");
                    return;
                }
                await nostrManager.joinGame(gameId);
            }

            if (window.setup) {
                window.setup();
            } else {
                console.error("❌ setup() function not found. Did you expose it in monopoly.js?");
            }
        });
    }
});


nostrManager.onGameStateReceived = (state) => {
    console.log("Syncing board from Host...");
    // Call the legacy JS function we exposed above
    // @ts-ignore
    if (window.loadRemoteGameState) window.loadRemoteGameState(state);
};

nostrManager.onSyncRequest = () => {
    const setupDiv = document.getElementById("setup");
    
    // Check if Game is Running (Setup is hidden)
    if (setupDiv && setupDiv.style.display === "none") {
        // Game Running: Send Board State
        // @ts-ignore
        if (window.broadcastGameState) {
            console.log("🔄 Re-broadcasting GAME STATE...");
            // @ts-ignore
            window.broadcastGameState();
        }
    } else {
        // Lobby Open: Send Player List
        console.log("🔄 Re-broadcasting LOBBY LIST...");
        const players = (window as any).connectedPlayers;
        if (players && nostrManager.broadcastGameUpdate) {
            nostrManager.broadcastGameUpdate({ players: players }, 'LOBBY_UPDATE');
        }
    }
};
