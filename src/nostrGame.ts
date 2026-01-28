import { generateSecretKey, getPublicKey, finalizeEvent, SimplePool, type Event, nip44 } from 'nostr-tools';

// --- CONFIGURATION ---
// We use public relays. In a real app, you might let users choose.
const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
    'wss://relay.snort.social'
];

export interface GameHistoryItem {
    id: string;
    type?: 'local' | 'online';
    timestamp: string;
}

// Custom Tag to identify this specific app protocol
const GAME_TAG = 'cashu-monopoly-v1';

export class NostrGameManager {
    private pool: SimplePool;
    private sk: Uint8Array; // Secret Key
    public pk: string;     // Public Key (hex)
    public gameId: string | null = null;
    public isHost: boolean = false;
    public hostPubkey: string | null = null;
    
    
    // --- HISTORY MANAGEMENT ---
    
    getGameHistory(): GameHistoryItem[] {
        try {
            const raw = localStorage.getItem('monopoly_game_history');
            const history = raw ? JSON.parse(raw) : [];
            
            // Fix Legacy Data: If 'type' is missing, assume it is 'online'
            return history.map((item: any) => ({
                ...item,
                type: item.type || 'online'
            }));
        } catch (e) {
            return [];
        }
    }

    saveGameToHistory(gameId: string, type: 'local' | 'online' = 'online') {
        let history = this.getGameHistory();
        
        // 1. Remove this ID if it already exists (so we can move it to top)
        history = history.filter((item: any) => item.id !== gameId);
        
        // 2. Add to top with current time
        history.unshift({
            id: gameId,
            type: type,
            timestamp: new Date().toLocaleString()
        });
        
        // 3. Keep only last 10
        if (history.length > 10) history = history.slice(0, 10);
        
        localStorage.setItem('monopoly_game_history', JSON.stringify(history));
    }
    
    //Encrypts using NIP-44
    async encryptForPlayer(targetPubkey: string, message: string): Promise<string> {
        try {
            // 1. Generate the shared secret (Conversation Key)
            const conversationKey = nip44.v2.utils.getConversationKey(this.sk, targetPubkey);
            
            // 2. Encrypt
            return nip44.v2.encrypt(message, conversationKey);
        } catch (e) {
            console.error("NIP-44 Encryption failed:", e);
            throw e;
        }
    }

     //Decrypts using NIP-44.
    async decryptFromHost(ciphertext: string): Promise<string> {
        if (!this.hostPubkey) throw new Error("No Host pinned, cannot decrypt.");
        
        try {
            // 1. Generate the shared secret
            const conversationKey = nip44.v2.utils.getConversationKey(this.sk, this.hostPubkey);
            
            // 2. Decrypt
            return nip44.v2.decrypt(ciphertext, conversationKey);
        } catch (e) {
            console.error("NIP-44 Decryption failed:", e);
            throw e;
        }
    }
    
    // Callback to update the UI when data arrives
    public onGameStateReceived: ((state: any) => void) | null = null;
    public onSyncRequest: (() => void) | null = null;
    
    // --- REQUEST DATA (For Joiners) ---
    async requestGameState() {
        if (!this.gameId) return;
        console.log("❓ Requesting Game State from Host...");
        await this.broadcastGameUpdate({}, 'REQUEST_STATE');
    }
    
    async sendAction(actionName: string, payload: any = {}) {
    if (!this.gameId) return;
    console.log(`🚀 Sending Action: ${actionName}`);
    await this.broadcastGameUpdate({ action: actionName, ...payload }, 'ACTION');
    }

    constructor() {
        this.pool = new SimplePool();
        
        // 1. Generate Identity (Ephemeral for now, or save to localStorage)
        const storedKey = localStorage.getItem('nostr_sk');
        if (storedKey) {
            this.sk = hexToBytes(storedKey);
            console.log("🔑 Loaded existing identity.");
        } else {
            this.sk = generateSecretKey();
            localStorage.setItem('nostr_sk', bytesToHex(this.sk));
            console.log("🔑 Generated NEW identity.");
        }
        this.pk = getPublicKey(this.sk);
        
        console.log("🔑 My Nostr Pubkey:", this.pk);
    }

    // --- HOSTING A GAME ---
    async startHosting(gameId?: string) {
        this.isHost = true;
        // The Host trusts themselves
        this.hostPubkey = this.pk; 
        
        if (gameId) {
            // 1. Resume specific existing game (passed as arg)
            if (!/^[a-f0-9]{8}$/.test(gameId)) {
                alert("Invalid game ID format");
                return null;
            }
            this.gameId = gameId.toLowerCase();
            console.log("🔄 Resuming Game ID:", this.gameId);
        } 
        else if (this.gameId) {
            // 2. FIX: ID already exists in memory? Reuse it!
            // This prevents the ID from changing if this function is called twice.
            console.log("ℹ️ Continued hosting existing ID:", this.gameId);
        } 
        else {
            // 3. Start fresh game (Only if we don't have an ID yet)
            this.gameId = bytesToHex(generateSecretKey()).slice(0, 8);
            console.log("🎲 Hosting New Game ID:", this.gameId);
        }
        
        this.subscribeToGame();
        return this.gameId;
    }

    // --- JOINING A GAME ---
    async joinGame(gameId: string) {
        this.isHost = false;
        this.gameId = gameId;
        
        // Reset host pinning when joining a new game
        this.hostPubkey = null; 
        
        console.log("👋 Joining Game ID:", this.gameId);
        this.subscribeToGame();
    }
    
    resetGame() {
        this.gameId = null;
        this.isHost = false;
    }

    // --- SUBSCRIPTION LOGIC ---
    private currentSubscription: ReturnType<SimplePool['subscribeMany']> | null = null;
    
    private subscribeToGame() {
        if (!this.gameId) return;
        
        // Cleanup previous subscription
        if (this.currentSubscription) {
	this.currentSubscription.close();
        }

        // We filter for Kind 1 (Text) events that have our specific Game ID tag
	this.currentSubscription = this.pool.subscribeMany(
	  RELAYS,
	  { // ✅ Single filter object
	   kinds: [31987],
	  '#d': [this.gameId], // ← Filter by game ID
	  '#g': [GAME_TAG],
	  },
	  {
	    onevent: (event: Event) => {
	      this.handleIncomingEvent(event);
	    },
	  }
	);
    }

    // --- SENDING DATA ---
    async broadcastGameUpdate(payload: any, type: 'STATE' | 'ACTION' | 'REQUEST_STATE' | 'JOIN_REQUEST' | 'LOBBY_UPDATE') {
        if (!this.gameId) return;

        // Create the event
	const eventTemplate = {
	  kind: 31987, // ← Custom replaceable kind
	  created_at: Math.floor(Date.now() / 1000),
	  tags: [
	    ['d', this.gameId], // ← REQUIRED for replaceable events
	    ['g', GAME_TAG],
	  ],
	  content: JSON.stringify({
	    type: type,
	    data: payload,
	    sender: this.pk,
	    version: Date.now() // Optional: helps detect stale updates
	  }),
	};

        // Sign it
        const signedEvent = finalizeEvent(eventTemplate, this.sk);

        // Publish to relays
	try {
	  await Promise.any(this.pool.publish(RELAYS, signedEvent));
	} catch (publishErrors) {
	  console.warn("Failed to publish to all relays:", publishErrors);
	  // Optionally retry or notify user
	}
        console.log(`📡 Broadcasted ${type}`);
    }

    // --- RECEIVING DATA ---
    private handleIncomingEvent(event: Event) {
    if (event.pubkey === this.pk) return; 

    try {
        const parsed = JSON.parse(event.content);
        
        // 1. SECURITY: HOST PINNING LOGIC
            // If we are a Joiner, we need to know who the real Host is.
            
            // A. If we haven't pinned a host yet, pin the first one we see sending valid STATE/LOBBY data
            if (!this.isHost && !this.hostPubkey) {
                if (parsed.type === 'STATE' || parsed.type === 'LOBBY_UPDATE') {
                    console.log("🔒 Host Pinned:", event.pubkey);
                    this.hostPubkey = event.pubkey;
                }
            }

            // B. If the event claims to be administrative (STATE, LOBBY, GAME_OVER), verify signature
            const isAdminEvent = ['STATE', 'LOBBY_UPDATE', 'GAME_OVER'].includes(parsed.type);
            
            if (!this.isHost && isAdminEvent) {
                if (this.hostPubkey && event.pubkey !== this.hostPubkey) {
                    console.warn(`🛡️ Security Alert: Ignoring fake ${parsed.type} from imposter ${event.pubkey}`);
                    return;
                }
            }
        
        // 1. STATE (For Joiners)
        if (!this.isHost && parsed.type === 'STATE') {
            if (this.onGameStateReceived) this.onGameStateReceived(parsed.data);
        }

        // 2. REQUEST_STATE (For Host)
        if (this.isHost && parsed.type === 'REQUEST_STATE') {
            if (this.onSyncRequest) this.onSyncRequest();
        }

        // 3. ACTIONS (For Host) - e.g. "Roll Dice"
        if (this.isHost && parsed.type === 'ACTION') {
            // --- SECURITY CHECK ---
            // We need to know WHICH player index sent this.
            // The game logic usually infers the index from whose turn it is, 
            // OR the payload might contain the claimed index.
        
            // Let's rely on the turn logic. 
            // If the game thinks it is Player 2's turn, only Player 2's Pubkey can act.
        
            // Get the global player list (from monopoly.js)
            const players = (window as any).connectedPlayers || [];
        
            // Find the player object associated with the SENDER'S Pubkey
            const senderPlayer = players.find((p: any) => p.pubkey === event.pubkey);

            if (!senderPlayer) {
                console.warn("⚠️ Action ignored: Sender is not in the lobby.", event.pubkey);
                return;
            }

            console.log(`🤖 Action from Player ${senderPlayer.index} (${senderPlayer.name})`);

            // OPTIONAL STRICT CHECK:
            // Is the person sending the action actually the person whose turn it is?
            // (You might want to skip this for things like 'Chat' or 'Resign', but for 'NEXT' it is good).
            const currentTurnIndex = (window as any).turn;
        
            // Only block game-critical moves out of turn.
            // Allow RESIGN or POPUP_CLOSE from anyone at any time (if valid player).
            const actionName = parsed.data.action;
        
            if (actionName === 'NEXT' || actionName === 'BUY' || actionName === 'PAY_FINE') {
                if (senderPlayer.index !== currentTurnIndex) {
                    console.warn(`⚠️ Action blocked: Player ${senderPlayer.index} tried to act out of turn.`);
                    return;
                }
            }

            // Pass to Game Engine
            if ((window as any).handleRemoteAction) {
                (window as any).handleRemoteAction(parsed.data.action, parsed.data, parsed.sender);
            }
        }

        // 4. JOIN_REQUEST (For Host) - e.g. "I am Bob, I pick Red"
        if (this.isHost && parsed.type === 'JOIN_REQUEST') {
            if ((window as any).handlePlayerJoin) {
                (window as any).handlePlayerJoin(parsed.data);
            }
        }
        // 5. LOBBY_UPDATE (For Everyone)
        if (parsed.type === 'LOBBY_UPDATE') {
            // Double check it came from Host (redundant but safe)
            if (!this.isHost && this.hostPubkey && event.pubkey !== this.hostPubkey) return;
            if ((window as any).updateLobbyUI) {
                (window as any).updateLobbyUI(parsed.data.players);
            }
        }

    } catch (e) { console.error(e); }
    }
}


function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
