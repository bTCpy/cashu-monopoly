# ⚡ Cashu Monopoly 🎩

**Play Monopoly with your friends and family using real Bitcoin (ecash) or test tokens over Nostr!**

This project transforms the classic board game into a Bitcoin experience. It uses the [Cashu](https://github.com/cashubtc) protocol to handle game funds, allowing players to buy in using a Lightning wallet, play the game, and cash out the pot at the end.
No trusted third party is needed. The game synchronizes between players using [Nostr](https://github.com/nostr-protocol/nostr).

---

## 👨‍👩‍👧‍👦 Why Play This?

This project is designed as a fun, interactive educational tool.

*   **Financial Literacy:** Teach children (and adults!) how to handle money, calculate inflows and outflows, and manage assets.
*   **Bitcoin Education:** It is the perfect safe sandbox to introduce friends and family to **Bitcoin, Lightning, and Ecash**.
*   **Micro-Stakes:** You can play with tiny amounts (e.g., 500 sats, which is a fraction of a Dollar). This makes the game feel "real" and exciting without huge financial risk.
*   **Math Skills:** The game dynamically scales prices based on your buy-in. If you buy in with 3000 sats, all rents, salaries, and fines double automatically!

---

## ✨ Features

*   **Mint Agnostic:** Connect to any Cashu Mint (Minibits, TestNut, or your own local Docker mint).
*   **Dynamic Scaling:** The game math adjusts automatically. Play a "High Roller" game with 1,000,000 sats or a "Micro" game with 500 sats.
*   **Automatic Invoices:** Generates Lightning invoices (BOLT11) for buy-ins.
*   **Cash Out:** At the end of the game, the winner receives a Cashu token containing the entire pot. Redeem it using your Cashu wallet of choice (e.g. [Cashu.me](https://wallet.cashu.me/))
*   **Offline Mode:** Play offline against a local AI.

---

## ⚠️ Disclaimer

**This software is in BETA.**

*   **Do not** play with amounts you cannot afford to lose.
*   **Do not** use this for high-stakes gambling.
*   Use the "TestNut" mint for risk-free testing.

---

## ❤️ Credits

*   **Game Logic & UI:** [Daniel Moyer (intrepidcoder)](https://github.com/intrepidcoder/monopoly)
*   **Ecash Protocol:** [Cashu](https://cashu.space)
