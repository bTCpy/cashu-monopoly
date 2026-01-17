import { Mint, Wallet, Proof } from '@cashu/cashu-ts';

// Store wallet in memory
let wallet: Wallet | undefined;
let proofs: Proof[] = [];

// List of available mints
export const AVAILABLE_MINTS = [
    { name: "Testnut (Test)", url: "https://testnut.cashu.space" },
    { name: "Minibits (Bitcoin)", url: "https://mint.minibits.cash/Bitcoin" },
    { name: "Custom URL", url: "custom" }
];

// 1. Connect to Mint
export async function connectToMint(mintUrl: string) {
    if (!mintUrl || mintUrl === 'custom') {
        throw new Error("Please provide a valid mint URL");
    }
    
    try {
        console.log("Connecting to mint:", mintUrl);
        const mint = new Mint(mintUrl);
        wallet = new Wallet(mint);
        
        // This automatically loads keysets and sets the default unit (usually sats)
        await wallet.loadMint();
        
        loadProofsLocally();

        console.log("Connected to Mint:", mintUrl);
        return true;
    } catch (e) {
        console.error("Connection failed", e);
        throw e;
    }
}

// 2. Request Mint
export async function requestMint(amount: number) {
    if (!wallet) throw new Error("Wallet not initialized");
    if (amount < 500) throw new Error("Minimum buy-in is 500 sats");
    
    // Create the quote
    const mintQuote = await wallet.createMintQuoteBolt11(amount);
    
    // RETURN THE WHOLE OBJECT. The UI must handle extracting the ID.
    // mintQuote structure is usually: { quote: "id_string", request: "lnbc...", ... }
    return { quote: mintQuote, request: mintQuote.request };
}

// 3. Check Status and Mint Tokens
export async function checkAndMint(quoteId: string, amount: number) {
    if (!wallet) throw new Error("Wallet not initialized");

    try {
        const newProofs = await wallet.mintProofs(amount, quoteId);
        proofs.push(...newProofs);
        saveProofsLocally();
        return { success: true, balance: getBalance() };
    } catch (e: any) {
        // FIX: Don't log "not paid" errors as Errors. It's just a status.
        // Minibits says "quote not paid", others might say "pending".
        const msg = e.message || "";
        if (msg.includes("not paid") || msg.includes("pending") || msg.includes("Quote not paid")) {
             // Just return false, keep the console clean
             return { success: false, error: msg };
        }

        // Only log actual unexpected errors
        console.error("Minting failed:", e);
        return { success: false, error: msg };
    }
}

// 4. Cashout (Generate Token String)
export function getEncodedToken() {
    if (proofs.length === 0 || !wallet) {
        console.warn("No proofs or wallet to cash out");
        return null;
    }

    try {
        // Log data for debugging
        console.log("Cashing out:", { 
            mint: wallet.mint.mintUrl, 
            proofsCount: proofs.length,
            sampleProof: proofs[0] 
        });

        // 1. Construct the Token Object (Standard V3 Format)
        const tokenObj = {
            token: [{
                mint: wallet.mint.mintUrl,
                proofs: proofs
            }]
        };

        // 2. Convert to JSON
        const jsonString = JSON.stringify(tokenObj);

        // 3. Base64 Encode (URL Safe)
        // btoa() is available in Android WebView
        const base64 = btoa(jsonString)
            .replace(/\+/g, '-') // Convert '+' to '-'
            .replace(/\//g, '_') // Convert '/' to '_'
            .replace(/=+$/, ''); // Remove trailing '=' padding

        // 4. Return with Prefix
        return 'cashuA' + base64;

    } catch (e) {
        console.error("Error manually encoding token:", e);
        return null;
    }
}

// 5. Polling for Payment Status
export async function pollForPayment(quoteId: string, amount: number, signal?: AbortSignal, interval: number = 3000) {
    return new Promise((resolve, reject) => {
        // 1. If already cancelled, stop immediately
        if (signal?.aborted) {
            return reject(new Error("Polling cancelled by user"));
        }

        const poll = setInterval(async () => {
            // 2. Check cancellation at the start of every tick
            if (signal?.aborted) {
                clearInterval(poll);
                reject(new Error("Polling cancelled by user"));
                return;
            }

            const result = await checkAndMint(quoteId, amount);

            if (result.success) {
                clearInterval(poll);
                resolve(result);
            } else if (result.error) {
                const err = result.error.toLowerCase();
                // Stop on fatal errors (quote deleted/expired)
                if (err.includes("quote not found") || err.includes("not exist") || err.includes("expired")) {
                    console.warn("Quote invalid, stopping polling:", result.error);
                    clearInterval(poll);
                    reject(new Error(result.error));
                }
            }
        }, interval);

        // 3. Attach Abort Listener to kill the loop externally
        if (signal) {
            signal.addEventListener('abort', () => {
                console.log("Abort signal received. Stopping poll.");
                clearInterval(poll);
                reject(new Error("Polling cancelled by user"));
            });
        }
    });
}


export function getBalance() {
    return proofs.reduce((total, p) => total + p.amount, 0);
}

function saveProofsLocally() {
    localStorage.setItem('monopoly_proofs', JSON.stringify(proofs));
}

// 6. Check for Spent Tokens (Poll logic for Cash Out)
export async function cleanupSpentTokens() {
    if (!wallet || proofs.length === 0) return { spentCount: 0, remainingBalance: getBalance() };

    try {
        // Ask Mint for status
        const states = await wallet.checkProofsStates(proofs);
        
        // Safety check: Ensure response length matches request
        if (!states || states.length !== proofs.length) {
            console.warn("Mint returned mismatched state count. Skipping cleanup.");
            return { spentCount: 0, remainingBalance: getBalance() };
        }

        const unspentProofs: Proof[] = [];
        let spentCount = 0;

        // Iterate through proofs and check corresponding state by index
        for (let i = 0; i < proofs.length; i++) {
            const stateData = states[i];
            
            // Check for SPENT or PENDING (in-flight)
            if (stateData.state === 'SPENT' || stateData.state === 'PENDING') {
                spentCount++;
                // We do NOT add this proof to unspentProofs, effectively deleting it
            } else {
                unspentProofs.push(proofs[i]);
            }
        }

        if (spentCount > 0) {
            proofs = unspentProofs;
            saveProofsLocally();
            console.log(`Success! Cleaned up ${spentCount} spent tokens.`);
            return { spentCount: spentCount, remainingBalance: getBalance() };
        }

        return { spentCount: 0, remainingBalance: getBalance() };

    } catch (e) {
        console.error("Error checking spent tokens:", e);
        // On error, do nothing to the wallet
        return { spentCount: 0, remainingBalance: getBalance() };
    }
}

function loadProofsLocally() {
    try {
        const stored = localStorage.getItem('monopoly_proofs');
        if (stored) {
            const loadedProofs = JSON.parse(stored);
            if (Array.isArray(loadedProofs) && loadedProofs.length > 0) {
                proofs = loadedProofs;
                console.log(`Loaded ${proofs.length} proofs from storage.`);
            }
        }
    } catch (e) {
        console.error("Failed to load proofs from local storage", e);
    }
}
