import { connectToMint, requestMint, getEncodedToken, pollForPayment, getBalance, AVAILABLE_MINTS, cleanupSpentTokens } from './walletManager';
import QRCode from 'qrcode';

import { Clipboard } from '@capacitor/clipboard';


import { NostrGameManager } from './nostrGame';
export const nostrManager = new NostrGameManager();

// --- Global Variables needed for Legacy JS ---
// We need to tell TypeScript these exist in classicedition.js / monopoly.js
declare const initClassicEdition: (scale: number) => void;
declare const playernumber_onchange: () => void;
declare const square: any[];

// --- DOM Elements ---
const pInput = document.getElementById("player-count") as HTMLInputElement;
const aInput = document.getElementById("buyin-amount") as HTMLInputElement;
const tDisplay = document.getElementById("total-display") as HTMLElement;
const mintSelect = document.getElementById("mint-selector") as HTMLSelectElement;
const customInput = document.getElementById("custom-mint-input") as HTMLInputElement;
const startBtn = document.getElementById("btn-generate-invoice") as HTMLButtonElement;
//const configStep = document.getElementById("step-config") as HTMLElement;
//const paymentStep = document.getElementById("step-payment") as HTMLElement;
const qrImage = document.getElementById("qr-image") as HTMLImageElement;
//const statusText = document.getElementById("status") as HTMLElement;
const skipBtn = document.getElementById("btn-skip-payment") as HTMLButtonElement;

// --- State ---
let currentQuoteId: string | null = null;
let pollInterval: any = null;
export let cashOutPoll: any = null; // Exported so we can clear it if needed elsewhere

export function initUiLogic() {
    // Attach Event Listeners
    pInput.addEventListener('input', updateTotal);
    aInput.addEventListener('input', updateTotal);
    mintSelect.addEventListener('change', onMintChange);
    startBtn.addEventListener('click', confirmAndStart);
    skipBtn.addEventListener('click', skipPaymentDemo);
    
    // Attach Cashout Logic
    const copyBtn = document.getElementById("copy-btn");
    if(copyBtn) copyBtn.addEventListener('click', copyTokenToClipboard);
    (window as any).getEncodedToken = getEncodedToken;
    
    // Add the Resync Button
    addResyncButton();
    
    // Initial Calc
    updateTotal();
    
    // Expose for monopoly.js / nostrGame.ts to call
    (window as any).updateLobbyUI = function(players: any[]) {
    // Target BOTH lists
    const hostList = document.getElementById("lobby-player-list");
    const joinList = document.getElementById("join-player-list");
    const joinContainer = document.getElementById("join-lobby-container");

    // Clear both
    if (hostList) hostList.innerHTML = "";
    if (joinList) joinList.innerHTML = "";
    
    // Show the container for Joiners if data exists
    if (joinContainer) {
        joinContainer.style.display = players.length > 0 ? "block" : "none";
    }

    const myPubkey = (window as any).nostrManager.pk;

    players.forEach(p => {
        const liContent = document.createElement("li");
        liContent.style.borderBottom = "1px solid #444";
        liContent.style.padding = "5px";
        
        let labelText = `${p.index}. ${p.name}`;
        
        if (p.pubkey === myPubkey) {
            labelText += " (You)";
            (window as any).MY_PLAYER_INDEX = p.index;
            
            // --- SYNC INPUTS (Existing Logic) ---
            const nameInput = document.getElementById("player1name") as HTMLInputElement;
            const colorSelect = document.getElementById("player1color") as HTMLSelectElement;
            if (nameInput && document.activeElement !== nameInput) nameInput.value = p.name;
            if (colorSelect && colorSelect.value.toLowerCase() !== p.color) {
                for(let i=0; i<colorSelect.options.length; i++) {
                    if (colorSelect.options[i].value.toLowerCase() === p.color) {
                        colorSelect.selectedIndex = i;
                        if ((window as any).updateBorderColor) (window as any).updateBorderColor(1);
                        break;
                    }
                }
            }
            // ------------------------------------
        } else if (p.index === 1) {
            labelText += " (Host)";
        }
        
        liContent.innerText = `${labelText} [${p.color}]`;

        // Append Clone to Host List
        if (hostList) hostList.appendChild(liContent.cloneNode(true));
        // Append Clone to Join List
        if (joinList) joinList.appendChild(liContent.cloneNode(true));
    });
    
    // Update pcount hidden input
    const pCountInput = document.getElementById("playernumber") as HTMLInputElement;
    if (pCountInput) pCountInput.value = players.length.toString();
    
    // Update visual count
    const visCount = document.getElementById("visible-player-count");
    if (visCount) visCount.innerText = players.length.toString();

    // Clear the "Connection Timeout" if we successfully got data
    if ((window as any).connectTimeout) {
        clearTimeout((window as any).connectTimeout);
        (window as any).connectTimeout = null;
        updateStatus(`Connected! You are Player ${(window as any).MY_PLAYER_INDEX}`);
    }
};
(window as any).getEncodedToken = getEncodedToken;
}

function loadHistoryUI() {
    const historySelect = document.getElementById("history-select") as HTMLSelectElement;
    const resumePanel = document.getElementById("resume-panel");
    const manager = (window as any).nostrManager;
    
    if (!historySelect || !resumePanel || !manager) return;

    const history = manager.getGameHistory();

    // Hide panel if no history
    if (history.length === 0) {
        resumePanel.style.display = "none";
        return;
    }

    resumePanel.style.display = "block";
    historySelect.innerHTML = `<option value="">-- Select a Game --</option>`;
    
    history.forEach((item: any) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.innerText = `${item.timestamp} - ${item.id}`;
        historySelect.appendChild(opt);
    });
    
    const manualOpt = document.createElement("option");
    manualOpt.value = "MANUAL_ENTRY";
    manualOpt.innerText = "➕ Enter Game ID manually...";
    manualOpt.style.fontWeight = "bold"; // Make it stand out
    manualOpt.style.color = "#4CAF50";
    historySelect.appendChild(manualOpt);
}

export async function hostGameUI() {
    const gameId = await nostrManager.startHosting();
    alert(`Game Created!\n\nShare this Game ID with friends:\n\n${gameId}`);
    // Start the game immediately as Player 1
    // ... logic to start game ...
}

export async function joinGameUI() {
    const gameId = prompt("Enter Game ID:");
    if (gameId) {
        await nostrManager.joinGame(gameId);
        alert("Joined! Waiting for Host to start...");
    }
}

export async function performCashOut(showModal: boolean, winnerName?: string, remoteToken?: string) {
    // If we received a token from the Host (remoteToken), use it. 
    // Otherwise, try to generate it from local wallet (Host case).
    const token = remoteToken || getEncodedToken();
    
    // 1. Check Balance
    if (!token) {
        if (!showModal) alert("No funds to cash out. Wallet is empty.");
        return;
    }

    console.log("Cashing out. Token length:", token.length);

    // 2. Handle Modal
    const modal = document.getElementById("cashout-modal");
    const tokenBox = document.getElementById("token-display") as HTMLTextAreaElement;
    const title = document.getElementById("cashout-title");
    
    // Only show modal if requested AND it exists
    const isModalVisible = showModal && !!modal;

    if (isModalVisible && modal && tokenBox) {
        tokenBox.value = token;
        
        if (title) {
            if (winnerName) {
                title.textContent = `🎉 ${winnerName} WON! 🎉`;
            } else {
                title.textContent = "🎉 YOU WON! 🎉";
            }
        }
        
        modal.style.display = "flex";
        modal.style.zIndex = "2147483647"; // Max Int
        modal.style.visibility = "visible";
        modal.style.opacity = "1";
    }

    // 3. Auto-Copy
    try {
        await navigator.clipboard.writeText(token);
        // Only alert if we aren't showing the big modal
        if (!isModalVisible) {
            alert("Token copied! Paste it into your external wallet.");
        }
    } catch (err) {
        console.error('Copy failed:', err);
        // Fallback prompt only if modal isn't there to let them copy
        if (!isModalVisible) prompt("Copy this token:", token);
    }

    // 4. Polling Logic (Only run this on the machine that actually holds the wallet)
    // If we are using a remoteToken, we are the Joiner, so we can't poll the wallet state.
    if (!remoteToken) {
        if (cashOutPoll) clearInterval(cashOutPoll);
        
        const balanceDisplay = document.getElementById('cashu-balance');

        cashOutPoll = setInterval(async () => {
            try {
                const { spentCount, remainingBalance } = await cleanupSpentTokens();

                if (spentCount > 0) {
                    if (balanceDisplay) {
                        balanceDisplay.textContent = `Balance: ${remainingBalance} sats`;
                    }

                    if (remainingBalance === 0) {
                        clearInterval(cashOutPoll);
                        if (modal) modal.style.display = "none";
                        alert("Cash out successful! Your wallet is now empty.");
                        
                        if (showModal) {
                            window.location.reload();
                        }
                    }
                }
            } catch (e) {
                console.error("Polling error:", e);
            }
        }, 3000);
    }
}

// 1. UI: Calculate Totals
function updateTotal() {
    let players = parseInt(pInput.value) || 2;
    if (players > 8) { players = 8; pInput.value = "8"; }
    if (players < 2) { players = 2; }
    
    let amount = parseInt(aInput.value) || 0;
    const total = players * amount;

    let msg = `Total Pot: ${total} sats`;
    let isValid = true;

    if (amount < 1) { // Changed min to 1 for testing
        msg += " (Too low)";
        isValid = false;
    }

    tDisplay.innerText = msg;
    
    if (isValid) {
        startBtn.disabled = false;
        startBtn.style.opacity = "1";
        startBtn.style.cursor = "pointer";
    } else {
        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
        startBtn.style.cursor = "not-allowed";
    }
}

function onMintChange() {
    if (mintSelect.value === "custom") {
        customInput.style.display = "block";
        customInput.focus();
    } else {
        customInput.style.display = "none";
    }
}

// 2. Logic: Start Process
async function confirmAndStart() {
    const amount = parseInt(aInput.value);
    const mintUrl = mintSelect.value;
    const success = await connectToMint(mintUrl);
    if (success) {
        // 'quote' here is the OBJECT (MintQuoteBolt11Response)
        const { quote, request } = await requestMint(amount);
        
        // FIX: Extract the ID string from the quote object
        currentQuoteId = quote.quote; 
        
        // Display QR code for payment
        qrImage.src = await QRCode.toDataURL(request);
        
        // FIX: Pass the ID string, not the whole object
        pollForPayment(quote.quote, amount).then(() => {
            console.log("Payment successful, starting game...");
            // Trigger your success logic here, e.g.:
            // startGameSuccess(amount);
        }).catch((e: Error) => {
            console.error("Payment failed:", e);
        });
    }
}


// 4. Logic: Success & Game Launch
function startGameSuccess(totalSats: number) {
    const modal = document.getElementById("buyin-modal");
    const controlPanel = document.getElementById("control");
    
    if (modal) modal.style.display = "none";
    if (controlPanel) controlPanel.style.display = "none"; // Initially hidden

    const amountPerPlayer = parseInt(aInput.value) || 1500;
    const playerCount = parseInt(pInput.value) || 2;
    const newScale = amountPerPlayer / 1500;

    // --- TRIGGER LEGACY JS LOGIC ---
    // This calls the functions inside classicedition.js and monopoly.js
    if (typeof initClassicEdition === 'function') {
        initClassicEdition(newScale);
    }

    // Refresh Visual Prices
    // (We need to wait a tick for the legacy JS to populate the square array)
    setTimeout(() => {
        for (let i = 0; i < 40; i++) {
            const priceDiv = document.getElementById("enlarge" + i + "price");
            // @ts-ignore
            const squareData = typeof square !== 'undefined' ? square[i] : null;
            if (priceDiv && squareData) {
                priceDiv.textContent = squareData.pricetext;
            }
        }
    }, 100);

    // Update Player Count Inputs
    const gameInput = document.getElementById("playernumber") as HTMLInputElement;
    const visualCount = document.getElementById("visible-player-count");
    
    if (gameInput) {
        gameInput.value = playerCount.toString();
        if (visualCount) visualCount.innerText = playerCount.toString();
        // Call the legacy change handler
        if (typeof playernumber_onchange === 'function') playernumber_onchange();
    }

    alert(`⚡ PAYMENT RECEIVED! \n\nPot Size: ${totalSats} sats`);
}

// Demo Mode (Skip Payment)
async function skipPaymentDemo() {
    clearInterval(pollInterval);
    // You might want to mint "fake" tokens here or just start the game
    // For now, let's just trigger start:
    const playerCount = parseInt(pInput.value) || 2;
    const amountPerPlayer = parseInt(aInput.value) || 1500;
    startGameSuccess(playerCount * amountPerPlayer);
}

// Cashout Logic
function copyTokenToClipboard() {
    // 1. Get the text box element
    const tokenBox = document.getElementById("token-display") as HTMLTextAreaElement;
    
    // 2. PRIORITY: Check if there is already a token in the box (e.g., sent by Host)
    let tokenToCopy = tokenBox ? tokenBox.value.trim() : "";

    // 3. FALLBACK: If box is empty, try to generate from local wallet (e.g., Local Game or Host cashout)
    if (!tokenToCopy) {
        // @ts-ignore
        tokenToCopy = (typeof getEncodedToken === 'function') ? getEncodedToken() : null;
    }

    // 4. If still empty, THEN show error
    if (!tokenToCopy) {
        alert("No funds to cash out!");
        return;
    }
    
    // Ensure the box is populated (in case we generated it just now from local wallet)
    if (tokenBox) tokenBox.value = tokenToCopy;

    // 5. Perform the Copy
    navigator.clipboard.writeText(tokenToCopy).then(() => {
        const btn = document.getElementById("copy-btn");
        if (btn) {
            const originalText = btn.innerText;
            btn.innerText = "✅ Copied!";
            // Reset button text after 2 seconds
            setTimeout(() => { btn.innerText = originalText; }, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy: ', err);
        // Fallback for older webviews if needed
        if (tokenBox) {
            tokenBox.select();
            document.execCommand('copy');
            alert("Copied to clipboard!");
        }
    });
}

export function initWalletUi() {
    // Get Elements
    const mintSelect = document.getElementById('mint-select') as HTMLSelectElement;
    const customMintInput = document.getElementById('custom-mint-url') as HTMLInputElement;
    const connectButton = document.getElementById('btn-connect-mint');
    const mintButton = document.getElementById('btn-mint-tokens') as HTMLButtonElement; 
    const amountInput = document.getElementById('mint-amount') as HTMLInputElement;
    const balanceDisplay = document.getElementById('cashu-balance');
    const cashOutButton = document.getElementById('btn-cash-out');

    // 1. SETUP STATUS LABEL
    let statusLabel = document.getElementById('mint-connection-status');
    if (!statusLabel && mintSelect && mintSelect.parentNode) {
        statusLabel = document.createElement('p');
        statusLabel.id = 'mint-connection-status';
        Object.assign(statusLabel.style, {
            fontSize: '0.85rem', marginTop: '4px', marginBottom: '10px', fontWeight: 'bold'
        });
        mintSelect.parentNode.insertBefore(statusLabel, mintSelect.nextSibling);
    }
    
    // 2. HELPER: UPDATE UI STATE
    const updateConnectionState = (isConnected: boolean, currentUrl: string) => {
        const mintName = AVAILABLE_MINTS.find(m => m.url === currentUrl)?.name || "Custom Mint";
        
        if (isConnected) {
            if (statusLabel) {
                statusLabel.textContent = `✅ Connected to: ${mintName}`;
                statusLabel.style.color = '#2ecc71';
            }
            if (mintButton) {
                mintButton.disabled = false;
                mintButton.style.opacity = '1';
                mintButton.textContent = "Mint Tokens";
            }
            if (mintSelect && mintSelect.value !== 'custom' && mintSelect.value !== currentUrl) {
                mintSelect.value = currentUrl; 
            }
        } else {
            if (statusLabel) {
                statusLabel.textContent = `⚠️ Click 'Connect' to use ${mintName}`;
                statusLabel.style.color = '#f39c12';
            }
            if (mintButton) {
                mintButton.disabled = true;
                mintButton.style.opacity = '0.5';
                mintButton.textContent = "Connect to Mint First";
            }
        }
    };

    // 3. Populate dropdown
    if (mintSelect) {
        mintSelect.innerHTML = ''; 
        AVAILABLE_MINTS.forEach(mint => {
            const option = document.createElement('option');
            option.value = mint.url;
            option.textContent = mint.name;
            mintSelect.appendChild(option);
        });

        mintSelect.addEventListener('change', () => {
            if (mintSelect.value === 'custom') {
                customMintInput.style.display = 'block';
                customMintInput.value = 'https://';
                customMintInput.focus();
            } else {
                customMintInput.style.display = 'none';
            }
            updateConnectionState(false, mintSelect.value);
        });
    }

    // 4. Connect Button
    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            let mintUrl = mintSelect.value;
            if (mintUrl === 'custom') {
                mintUrl = customMintInput.value.trim();
                if (!mintUrl || !mintUrl.startsWith('http')) {
                    alert("Please enter a valid mint URL");
                    return;
                }
            }

            try {
                if(statusLabel) statusLabel.textContent = "⌛ Connecting...";
                
                const success = await connectToMint(mintUrl);
                if (success) {
                    updateConnectionState(true, mintUrl);
                    if (balanceDisplay) {
                        balanceDisplay.textContent = `Balance: ${getBalance()} sats`;
                    }
                    localStorage.setItem('selected_mint', mintUrl);
                    alert("Connected successfully!");
                }
            } catch (e) {
                console.error(e);
                if(statusLabel) {
                    statusLabel.textContent = "❌ Connection Failed";
                    statusLabel.style.color = '#e74c3c';
                }
                alert("Connection failed: " + (e instanceof Error ? e.message : 'Unknown'));
            }
        });
    }

    // 5. Mint Button
    if (mintButton && amountInput) {
        mintButton.disabled = true;
        mintButton.style.opacity = '0.5';
        
        mintButton.addEventListener('click', async () => {
            const amount = parseInt(amountInput.value, 10);
            if (isNaN(amount) || amount < 500) {
                alert("Please enter a valid amount (minimum 500 sats).");
                return;
            }
            
            const controller = new AbortController();

            try {
                const { quote, request } = await requestMint(amount);
                
                const modal = await showInvoiceModal(request, () => {
                    console.log("User closed modal. Stopping polling.");
                    controller.abort();
                });
                
                const statusText = document.getElementById('invoice-status');

                pollForPayment(quote.quote, amount, controller.signal).then((result: any) => {
                    if (result && result.success) {
                        if (statusText) {
                            statusText.innerText = "✅ Payment Received!";
                            statusText.style.color = "#2ecc71";
                        }
                        
                        setTimeout(() => {
                            if (document.body.contains(modal)) document.body.removeChild(modal);
                            alert(`Successfully minted ${amount} sats!`);
                            if (balanceDisplay) {
                                balanceDisplay.textContent = `Balance: ${getBalance()} sats`;
                            }
                        }, 1000);
                    }
                }).catch(e => {
                    if (e.message && e.message.includes("cancelled")) {
                        console.log("Polling stopped by user.");
                    } else {
                        console.error("Polling error:", e);
                        if (statusText) statusText.innerText = "Error: " + e.message;
                    }
                });

            } catch (e) {
                console.error("Error minting tokens:", e);
                alert("An error occurred: " + (e instanceof Error ? e.message : 'Unknown error'));
            }
        });
    }

    // 6. Cash Out Button (Main Menu)
    if (cashOutButton) {
        // Pass 'false' (Don't show modal)
        cashOutButton.addEventListener('click', () => performCashOut(false));
    }

    // 7. Auto-Connect Logic (Single, Clean Block)
    const savedMint = localStorage.getItem('selected_mint');
    if (savedMint && mintSelect) {
        const isStandardMint = AVAILABLE_MINTS.some(m => m.url === savedMint);

        if (isStandardMint) {
            mintSelect.value = savedMint;
            if (customMintInput) customMintInput.style.display = 'none';
        } else {
            mintSelect.value = 'custom';
            if (customMintInput) {
                customMintInput.style.display = 'block';
                customMintInput.value = savedMint;
            }
        }
        
        updateConnectionState(false, savedMint);
        if(statusLabel) statusLabel.textContent = "⌛ Auto-connecting...";

        setTimeout(async () => {
            try {
                console.log("Auto-connecting to saved mint:", savedMint);
                const success = await connectToMint(savedMint);
                
                if (success) {
                    updateConnectionState(true, savedMint);
                    
                    if (balanceDisplay) {
                        const balance = getBalance();
                        balanceDisplay.textContent = `Balance: ${balance} sats`;
                    
                        if (balance > 0) {
                            console.log(`Restored ${balance} sats from storage.`);
                        }
                    } 
                } 
            } catch (e) {
                console.warn("Auto-connect failed:", e);
                if(statusLabel) {
                    statusLabel.textContent = "⚠️ Auto-connect failed. Please retry.";
                    statusLabel.style.color = '#e74c3c';
                }
            }
        }, 100);
    }
}

export function setupLobbyUI() {
    loadHistoryUI();
    
    const btnLocal = document.getElementById('btn-local-game');
    const btnHost = document.getElementById('btn-host-game');
    const btnJoin = document.getElementById('btn-join-game');
    
    const hostPanel = document.getElementById('host-panel');
    const joinPanel = document.getElementById('join-panel');
    const startBtn = document.getElementById('btn-start-game');
    const p2AiSelect = document.getElementById('player2ai') as HTMLSelectElement;

    // 2. Resume Button Logic
    const btnResume = document.getElementById("btn-resume-game");
    const historySelect = document.getElementById("history-select") as HTMLSelectElement;
    
    const p1Name = document.getElementById("player1name") as HTMLInputElement;
    const p1Color = document.getElementById("player1color") as HTMLSelectElement;
    
    if (p1Name && p1Color) {
        const savedName = localStorage.getItem('pref_p1_name');
        const savedColor = localStorage.getItem('pref_p1_color');

        if (savedName) {
            p1Name.value = savedName;
        }
        
        if (savedColor) {
            p1Color.value = savedColor;
            // Update the visual border color immediately
            if ((window as any).updateBorderColor) {
                (window as any).updateBorderColor(1);
            }
        }
    }

    const broadcastHostUpdate = () => {
        // Only if I am Host
        if ((window as any).nostrManager && (window as any).nostrManager.isHost) {
            const players = (window as any).connectedPlayers;
            
            if (players && players.length > 0) {
                // 1. Update Host Entry with new Input Values
                const hostEntry = players.find((p: any) => p.index === 1);
                if (hostEntry) {
                    hostEntry.name = p1Name.value;
                    hostEntry.color = p1Color.value.toLowerCase();
                    
                    // 2. FIX: Run Conflict Solver
                    // This will move other players if the Host took their color
                    if ((window as any).resolveLobbyConflicts) {
                        (window as any).resolveLobbyConflicts();
                    }

                    // 3. Broadcast the (potentially modified) list
                    (window as any).nostrManager.broadcastGameUpdate({ players: players }, 'LOBBY_UPDATE');
                    
                    // 4. Update Host's own UI list to show changes
                    if ((window as any).updateLobbyUI) {
                        (window as any).updateLobbyUI(players);
                    }
                }
            }
        }
    };

    p1Name?.addEventListener('input', () => {
        // FIX: Save to storage
        localStorage.setItem('pref_p1_name', p1Name.value);
        
        // Trigger broadcast
        broadcastHostUpdate();
    });
    
    p1Color?.addEventListener('change', () => {
        // FIX: Save to storage
        localStorage.setItem('pref_p1_color', p1Color.value);
        
        // Trigger broadcast
        broadcastHostUpdate();
    });

    btnResume?.addEventListener('click', async () => {
        let selectedId = historySelect.value;
        if (!selectedId) return alert("Please select a game.");
        
        if (selectedId === "MANUAL_ENTRY") {
            const manualInput = prompt("Paste the Game ID you want to Host:");
            if (!manualInput) return; // Cancelled
            
            // Clean up input (remove whitespace)
            selectedId = manualInput.trim();
            
            // Basic validation
            if (selectedId.length < 8) {
                return alert("Invalid Game ID. It should be at least 8 characters.");
            }
        }

        // Switch UI to Host Mode
        if(hostPanel) hostPanel.style.display = 'block';
        if(joinPanel) joinPanel.style.display = 'none';
        if(startBtn) startBtn.style.display = 'block';
        
        // Reset Lobby
        const listHost = document.getElementById("lobby-player-list");
        if (listHost) listHost.innerHTML = "";
        (window as any).connectedPlayers = [];

        if ((window as any).nostrManager) {
            // DO NOT resetGame() here. We want to keep the selected ID.
            const gameId = await (window as any).nostrManager.startHosting(selectedId);
            
            const display = document.getElementById('game-id-display');
            if(display) display.innerText = gameId;

            // Trigger Self-Join
            const p1Name = (document.getElementById("player1name") as HTMLInputElement).value || "Host";
            const p1Color = (document.getElementById("player1color") as HTMLSelectElement).value;
            
            if ((window as any).handlePlayerJoin) {
                (window as any).handlePlayerJoin({
                    name: p1Name,
                    color: p1Color,
                    pubkey: (window as any).nostrManager.pk
                });
            }
            
            updateStatus(`Resumed: ${gameId}`);
        }
    });
    
    // --- LOCAL BOT MODE ---
    btnLocal?.addEventListener('click', () => {
        // UI
        if(hostPanel) hostPanel.style.display = 'none';
        if(joinPanel) joinPanel.style.display = 'none';
        if(startBtn) startBtn.style.display = 'block';

        // Logic: Set Player 2 to AI
        if(p2AiSelect) p2AiSelect.value = "1"; // 1 = Bot
        updateStatus("Local Game vs Bot. Click Start!");
    });
    
    // --- HOST MODE ---
    btnHost?.addEventListener('click', async () => {
        if(hostPanel) hostPanel.style.display = 'block';
        if(joinPanel) joinPanel.style.display = 'none';
        if(startBtn) startBtn.style.display = 'block';
        
        // FIX: Clear previous lobby data
        const listHost = document.getElementById("lobby-player-list");
        if (listHost) listHost.innerHTML = ""; // Clear HTML
        (window as any).connectedPlayers = []; // Clear Logic Array
        
        (window as any).MY_PLAYER_INDEX = 1;

        // Logic: Set Player 2 to Human (The remote player)
        if(p2AiSelect) p2AiSelect.value = "0"; // 0 = Human

        if ((window as any).nostrManager) {
            (window as any).nostrManager.resetGame(); 
            const gameId = await (window as any).nostrManager.startHosting();
            const display = document.getElementById('game-id-display');
            if(display) display.innerText = gameId;
            
            // Trigger self-join so "Host" appears in the list immediately
            // We fake a "JOIN_REQUEST" locally
            const p1Name = (document.getElementById("player1name") as HTMLInputElement).value || "Host";
            const p1Color = (document.getElementById("player1color") as HTMLSelectElement).value;
            
            if ((window as any).handlePlayerJoin) {
                (window as any).handlePlayerJoin({
                    name: p1Name,
                    color: p1Color,
                    pubkey: (window as any).nostrManager.pk
                });
            }
            
            updateStatus("Hosting... Waiting for opponent.");
        }
    });
    
     // --- COPY BUTTON ---
    const btnCopy = document.getElementById("btn-copy-id");
    btnCopy?.addEventListener('click', async () => {
        const idText = document.getElementById("game-id-display")?.innerText;
        
        if (idText && idText !== "Generating...") {
            await Clipboard.write({
                string: idText
            });
            
            // Visual Feedback
            const originalText = btnCopy.innerText;
            btnCopy.innerText = "✅";
            setTimeout(() => { btnCopy.innerText = originalText; }, 1500);
        }
    });


    // --- JOIN MODE ---
    btnJoin?.addEventListener('click', () => {
        if(joinPanel) joinPanel.style.display = 'block';
        if(hostPanel) hostPanel.style.display = 'none';
        if(startBtn) startBtn.style.display = 'none'; // Joiners wait for host
        
        (window as any).MY_PLAYER_INDEX = 2; 
        // Logic: Set Player 2 to Human (The host)
        if(p2AiSelect) p2AiSelect.value = "0";

        updateStatus("Enter Game ID to join.");
    });

    // CONNECT BUTTON
    document.getElementById('btn-connect-join')?.addEventListener('click', async () => {
        const input = document.getElementById('join-game-input') as HTMLInputElement;
        const gameId = input.value.trim();
        if(!gameId) return alert("Please enter a Game ID");

        if ((window as any).nostrManager) {
            // 1. Reset State
            (window as any).connectedPlayers = [];
            const joinContainer = document.getElementById("join-lobby-container");
            if(joinContainer) joinContainer.style.display = 'none';

            // 2. Start Logic
            updateStatus("Looking for Host...");
            await (window as any).nostrManager.joinGame(gameId);
            
            // 3. Send Hello
            const p1Name = (document.getElementById("player1name") as HTMLInputElement).value;
            const p1Color = (document.getElementById("player1color") as HTMLSelectElement).value;

            await (window as any).nostrManager.broadcastGameUpdate({
                name: p1Name,
                color: p1Color,
                pubkey: (window as any).nostrManager.pk 
            }, 'JOIN_REQUEST');

            // 4. Request State
            setTimeout(() => {
                 (window as any).nostrManager.requestGameState();
            }, 1000);

            // 5. SET TIMEOUT (The Fix for Invalid IDs)
            if ((window as any).connectTimeout) clearTimeout((window as any).connectTimeout);
            
            (window as any).connectTimeout = setTimeout(() => {
                // If updateLobbyUI hasn't run yet, this will fire
                const players = (window as any).connectedPlayers;
                if (!players || players.length === 0) {
                    updateStatus("❌ Host not responding. Wrong ID?");
                    alert("No Host found for this ID.\n\n1. Check the ID.\n2. Ensure Host is online.");
                }
            }, 6000); // 6 seconds timeout
        }
    });
}

startBtn.addEventListener('click', async () => {
    const amount = parseInt(aInput.value);
    const mintUrl = mintSelect.value;
    const success = await connectToMint(mintUrl);
    if (success) {
        const { quote, request } = await requestMint(amount);
        
        // FIX: Extract ID
        currentQuoteId = quote.quote;
        
        qrImage.src = await QRCode.toDataURL(request);
        
        // FIX: Pass ID string
        pollForPayment(quote.quote, amount).then(() => {
            console.log("Payment successful, starting game...");
        }).catch(e => {
            console.error("Payment failed:", e);
        });
    }
});


function updateStatus(msg: string) {
    const el = document.getElementById('network-status');
    if(el) el.innerText = msg;
}

async function showInvoiceModal(invoice: string, onClose?: () => void) {
    // 1. Create Modal Container
    const modal = document.createElement('div');
    modal.id = "custom-invoice-modal";
    // ... keep the rest of the styling and innerHTML logic exactly the same ...
    Object.assign(modal.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center',
        alignItems: 'center', zIndex: '9999'
    });

    const uri = `lightning:${invoice}`;
    const qrDataUrl = await QRCode.toDataURL(uri.toUpperCase());

    modal.innerHTML = `
        <div style="background:#1a1a1a; padding:25px; border-radius:12px; max-width:90%; width:350px; text-align:center; color:white; border: 2px solid #f39c12; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
            <h3 style="margin-top:0; color:#f39c12;">⚡ Pay Invoice</h3>
            <div style="background:white; padding:10px; border-radius:8px; display:inline-block; margin: 15px 0;">
                <img src="${qrDataUrl}" style="width:200px; height:200px; display:block;">
            </div>
            <p style="font-size:12px; color:#aaa; margin-bottom:15px; word-break:break-all; max-height:60px; overflow:hidden;">${invoice.substring(0, 30)}...</p>
            
            <div style="display:flex; gap:10px; justify-content:center;">
                <button id="btn-copy-ln" style="background:#f39c12; color:white; border:none; padding:12px 20px; border-radius:6px; font-weight:bold; flex:1;">📋 Copy</button>
                <button id="btn-close-ln" style="background:#444; color:white; border:none; padding:12px 20px; border-radius:6px; font-weight:bold; flex:1;">Close</button>
            </div>
            <p id="invoice-status" style="margin-top:15px; font-size:14px; color:#f39c12; min-height:20px;">Waiting for payment...</p>
        </div>
    `;

    document.body.appendChild(modal);

    const copyBtn = document.getElementById('btn-copy-ln');
    const closeBtn = document.getElementById('btn-close-ln');

    copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(invoice).then(() => {
            if (copyBtn) copyBtn.innerText = "✅ Copied!";
            setTimeout(() => { if (copyBtn) copyBtn.innerText = "📋 Copy"; }, 2000);
        });
    });

    closeBtn?.addEventListener('click', () => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
        if (onClose) {
            onClose();
        }
    });

    return modal;
}

function addResyncButton() {
    // Create the button
    const btn = document.createElement("button");
    btn.id = "btn-resync-game";
    btn.innerHTML = "🔄";
    btn.title = "Resync Game State (Fix Stuck Screen)";
    
    // Style it to float top-right, but below the money bar
    Object.assign(btn.style, {
        position: "fixed",
        top: "70px", // Below the money bar
        right: "10px",
        zIndex: "9000",
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        border: "2px solid #fff",
        background: "#2196F3",
        color: "white",
        fontSize: "20px",
        cursor: "pointer",
        boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
        display: "none" // Hidden by default (lobby)
    });

    // Hover effect
    btn.onmouseover = () => { btn.style.background = "#1976D2"; };
    btn.onmouseout = () => { btn.style.background = "#2196F3"; };

    // Click Action
    btn.onclick = () => {
        // Visual feedback
        btn.innerHTML = "⏳";
        btn.style.transform = "rotate(360deg)";
        btn.style.transition = "transform 1s";

        // Request State
        if ((window as any).nostrManager) {
            console.log("🔄 Manual Resync Requested...");
            (window as any).nostrManager.requestGameState();
        }

        // Reset icon after 1.5s
        setTimeout(() => {
            btn.innerHTML = "🔄";
            btn.style.transform = "none";
            btn.style.transition = "none";
        }, 1500);
    };

    document.body.appendChild(btn);

    // LOGIC TO SHOW/HIDE BUTTON
    // We only want to show this when the game board is visible
    setInterval(() => {
        const board = document.getElementById("board");
        const setup = document.getElementById("setup");
        
        if (board && setup) {
            if (board.style.display !== "none" && setup.style.display === "none") {
                btn.style.display = "block";
            } else {
                btn.style.display = "none";
            }
        }
    }, 1000);
}

console.log("Current Quote ID:", currentQuoteId);
(window as any).triggerCashout = function(name: string, token: string) {
     performCashOut(true, name, token); 
};


