import { generateSecretKey, getPublicKey, finalizeEvent, SimplePool, type Event } from 'nostr-tools';

// --- CONFIGURATION ---
// We use public relays. In a real app, you might let users choose.
const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
    'wss://relay.snort.social'
];

// Custom Tag to identify this specific app protocol
const GAME_TAG = 'cashu-monopoly-v1';

export class NostrGameManager {
    private pool: SimplePool;
    private sk: Uint8Array; // Secret Key
    public pk: string;     // Public Key (hex)
    public gameId: string | null = null;
    public isHost: boolean = false;
    
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
        } else {
            this.sk = generateSecretKey();
            localStorage.setItem('nostr_sk', bytesToHex(this.sk));
        }
        this.pk = getPublicKey(this.sk);
        
        console.log("🔑 My Nostr Pubkey:", this.pk);
    }

    // --- HOSTING A GAME ---
    async startHosting(gameId?: string) {
        this.isHost = true;
        
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
    
        // Store for later resume
        localStorage.setItem('lastGameId', this.gameId!);
        
        this.subscribeToGame();
        return this.gameId;
    }

    // --- JOINING A GAME ---
    async joinGame(gameId: string) {
        this.isHost = false;
        this.gameId = gameId;
        console.log("👋 Joining Game ID:", this.gameId);
        
        // Subscribe to game state updates
        this.subscribeToGame();
    }
    
    resetGame() {
        this.gameId = null;
        this.isHost = false;
        // Optionally unsubscribe/close pool if needed, 
        // but clearing the ID is enough to trigger a new generation next time.
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
            // We need a callback for this
            if ((window as any).handleRemoteAction) {
                (window as any).handleRemoteAction(parsed.data.action, parsed.data);
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
