// --- GLOBAL SCALING FACTOR ---
var GAME_SCALE = 1; // Default to 1 (Standard 1500 game)

// --- IMPORT CARD ACTIONS FROM MONOPOLY.JS ---
// These map local calls to the global functions defined in monopoly.js
var addamount = function(a, b) { if(window.addamount) window.addamount(a, b); };
var subtractamount = function(a, b) { if(window.subtractamount) window.subtractamount(a, b); };
var collectfromeachplayer = function(a, b) { if(window.collectfromeachplayer) window.collectfromeachplayer(a, b); };
var payeachplayer = function(a, b) { if(window.payeachplayer) window.payeachplayer(a, b); };
var advance = function(a, b) { if(window.advance) window.advance(a, b); };
var advanceToNearestUtility = function() { if(window.advanceToNearestUtility) window.advanceToNearestUtility(); };
var advanceToNearestRailroad = function() { if(window.advanceToNearestRailroad) window.advanceToNearestRailroad(); };
var streetrepairs = function(a, b) { if(window.streetrepairs) window.streetrepairs(a, b); };
var gotojail = function() { if(window.gotojail) window.gotojail(); };
var gobackthreespaces = function() { if(window.gobackthreespaces) window.gobackthreespaces(); };
var updateOwned = function() { if(window.updateOwned) window.updateOwned(); };
var addAlert = function(t) { if(window.addAlert) window.addAlert(t); };
// ---------------------------------------------

function Square(name, pricetext, color, price, groupNumber, baserent, rent1, rent2, rent3, rent4, rent5) {
	this.name = name;
	this.pricetext = pricetext;
	this.color = color;
	this.owner = 0;
	this.mortgage = false;
	this.house = 0;
	this.hotel = 0;
	this.groupNumber = groupNumber || 0;
	this.price = (price || 0);
	this.baserent = (baserent || 0);
	this.rent1 = (rent1 || 0);
	this.rent2 = (rent2 || 0);
	this.rent3 = (rent3 || 0);
	this.rent4 = (rent4 || 0);
	this.rent5 = (rent5 || 0);
	this.landcount = 0;

    // --- FIX: Rounding house prices to nearest integer ---
	if (groupNumber === 3 || groupNumber === 4) {
		this.houseprice = Math.round(50 * GAME_SCALE);
	} else if (groupNumber === 5 || groupNumber === 6) {
		this.houseprice = Math.round(100 * GAME_SCALE);
	} else if (groupNumber === 7 || groupNumber === 8) {
		this.houseprice = Math.round(150 * GAME_SCALE);
	} else if (groupNumber === 9 || groupNumber === 10) {
		this.houseprice = Math.round(200 * GAME_SCALE);
	} else {
		this.houseprice = 0;
	}
}

function Card(text, action) {
	this.text = text;
	this.action = action;
}

function corrections() {
	document.getElementById("cell1name").textContent = "Mediter-ranean Avenue";
	document.getElementById("enlarge5token").innerHTML += '<img src="/images/train_icon.png" height="60" width="65" alt="" style="position: relative; bottom: 20px;" />';
	document.getElementById("enlarge15token").innerHTML += '<img src="/images/train_icon.png" height="60" width="65" alt="" style="position: relative; top: -20px;" />';
	document.getElementById("enlarge25token").innerHTML += '<img src="/images/train_icon.png" height="60" width="65" alt="" style="position: relative; top: -20px;" />';
	document.getElementById("enlarge35token").innerHTML += '<img src="/images/train_icon.png" height="60" width="65" alt="" style="position: relative; top: -20px;" />';
	document.getElementById("enlarge12token").innerHTML += '<img src="/images/electric_icon.png" height="60" width="48" alt="" style="position: relative; top: -20px;" />';
	document.getElementById("enlarge28token").innerHTML += '<img src="/images/water_icon.png" height="60" width="78" alt="" style="position: relative; top: -20px;" />';
}

function utiltext() {
    var lowMult = Math.round(4 * GAME_SCALE);
    var highMult = Math.round(10 * GAME_SCALE);
    
	return '&nbsp;&nbsp;&nbsp;&nbsp;If one "Utility" is owned rent is ' + lowMult + ' times amount shown on dice.<br /><br />&nbsp;&nbsp;&nbsp;&nbsp;If both "Utilitys" are owned rent is ' + highMult + ' times amount shown on dice.';
}

function transtext() {
	return '<div style="font-size: 14px; line-height: 1.5;">Rent<span style="float: right;">⚡₿' + Math.round(25 * GAME_SCALE) + '.</span><br />If 2 Railroads are owned<span style="float: right;">' + Math.round(50 * GAME_SCALE) + '.</span><br />If 3 &nbsp; &nbsp; " &nbsp; &nbsp; " &nbsp; &nbsp; "<span style="float: right;">' + Math.round(100 * GAME_SCALE) + '.</span><br />If 4 &nbsp; &nbsp; " &nbsp; &nbsp; " &nbsp; &nbsp; "<span style="float: right;">' + Math.round(200 * GAME_SCALE) + '.</span></div>';
}

function luxurytax() {
    var cost = Math.round(100 * GAME_SCALE);
    // Use window.player and window.turn explicitly
    var p = window.player[window.turn]; 
    
    addAlert(p.name + " paid ⚡₿" + cost + " for landing on Luxury Tax.");
    p.pay(cost, 0);
    
    if(window.jQuery) {
        window.jQuery("#landed").show().text("You landed on Luxury Tax. Pay ⚡₿" + cost + ".");
    }
}

function citytax() {
    var cost = Math.round(200 * GAME_SCALE);
    // Use window.player and window.turn explicitly
    var p = window.player[window.turn];

    addAlert(p.name + " paid ⚡₿" + cost + " for landing on City Tax.");
    p.pay(cost, 0);
    
    if(window.jQuery) {
        window.jQuery("#landed").show().text("You landed on City Tax. Pay ⚡₿" + cost + ".");
    }
}

var square = [];
var communityChestCards = [];
var chanceCards = [];

function initClassicEdition(scaleFactor) {
	GAME_SCALE = scaleFactor || 1;
	window.GAME_SCALE = GAME_SCALE; 
	square = [];
	communityChestCards = [];
	chanceCards = [];

	function p(val) { return Math.round(val * GAME_SCALE); }
	function pt(val) { return "⚡₿" + Math.round(val * GAME_SCALE); }

	square[0] = new Square("GO", "COLLECT " + pt(200) + " SALARY AS YOU PASS.", "#FFFFFF");
	square[1] = new Square("Mediterranean Avenue", pt(60), "#8B4513", p(60), 3, p(2), p(10), p(30), p(90), p(160), p(250));
	square[2] = new Square("Community Chest", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
	square[3] = new Square("Baltic Avenue", pt(60), "#8B4513", p(60), 3, p(4), p(20), p(60), p(180), p(320), p(450));
	square[4] = new Square("City Tax", "Pay " + pt(200), "#FFFFFF");
	square[5] = new Square("Reading Railroad", pt(200), "#FFFFFF", p(200), 1);
	square[6] = new Square("Oriental Avenue", pt(100), "#87CEEB", p(100), 4, p(6), p(30), p(90), p(270), p(400), p(550));
	square[7] = new Square("Chance", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
	square[8] = new Square("Vermont Avenue", pt(100), "#87CEEB", p(100), 4, p(6), p(30), p(90), p(270), p(400), p(550));
	square[9] = new Square("Connecticut Avenue", pt(120), "#87CEEB", p(120), 4, p(8), p(40), p(100), p(300), p(450), p(600));
	square[10] = new Square("Just Visiting", "", "#FFFFFF");
	square[11] = new Square("St. Charles Place", pt(140), "#FF0080", p(140), 5, p(10), p(50), p(150), p(450), p(625), p(750));
	square[12] = new Square("Electric Company", pt(150), "#FFFFFF", p(150), 2);
	square[13] = new Square("States Avenue", pt(140), "#FF0080", p(140), 5, p(10), p(50), p(150), p(450), p(625), p(750));
	square[14] = new Square("Virginia Avenue", pt(160), "#FF0080", p(160), 5, p(12), p(60), p(180), p(500), p(700), p(900));
	square[15] = new Square("Pennsylvania Railroad", pt(200), "#FFFFFF", p(200), 1);
	square[16] = new Square("St. James Place", pt(180), "#FFA500", p(180), 6, p(14), p(70), p(200), p(550), p(750), p(950));
	square[17] = new Square("Community Chest", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
	square[18] = new Square("Tennessee Avenue", pt(180), "#FFA500", p(180), 6, p(14), p(70), p(200), p(550), p(750), p(950));
	square[19] = new Square("New York Avenue", pt(200), "#FFA500", p(200), 6, p(16), p(80), p(220), p(600), p(800), p(1000));
	square[20] = new Square("Free Parking", "", "#FFFFFF");
	square[21] = new Square("Kentucky Avenue", pt(220), "#FF0000", p(220), 7, p(18), p(90), p(250), p(700), p(875), p(1050));
	square[22] = new Square("Chance", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
	square[23] = new Square("Indiana Avenue", pt(220), "#FF0000", p(220), 7, p(18), p(90), p(250), p(700), p(875), p(1050));
	square[24] = new Square("Illinois Avenue", pt(240), "#FF0000", p(240), 7, p(20), p(100), p(300), p(750), p(925), p(1100));
	square[25] = new Square("B&O Railroad", pt(200), "#FFFFFF", p(200), 1);
	square[26] = new Square("Atlantic Avenue", pt(260), "#FFFF00", p(260), 8, p(22), p(110), p(330), p(800), p(975), p(1150));
	square[27] = new Square("Ventnor Avenue", pt(260), "#FFFF00", p(260), 8, p(22), p(110), p(330), p(800), p(975), p(1150));
	square[28] = new Square("Water Works", pt(150), "#FFFFFF", p(150), 2);
	square[29] = new Square("Marvin Gardens", pt(280), "#FFFF00", p(280), 8, p(24), p(120), p(360), p(850), p(1025), p(1200));
	square[30] = new Square("Go to Jail", "Go directly to Jail. Do not pass GO. Do not collect " + pt(200) + ".", "#FFFFFF");
	square[31] = new Square("Pacific Avenue", pt(300), "#008000", p(300), 9, p(26), p(130), p(390), p(900), p(1100), p(1275));
	square[32] = new Square("North Carolina Avenue", pt(300), "#008000", p(300), 9, p(26), p(130), p(390), p(900), p(1100), p(1275));
	square[33] = new Square("Community Chest", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
	square[34] = new Square("Pennsylvania Avenue", pt(320), "#008000", p(320), 9, p(28), p(150), p(450), p(1000), p(1200), p(1400));
	square[35] = new Square("Short Line", pt(200), "#FFFFFF", p(200), 1);
	square[36] = new Square("Chance", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
	square[37] = new Square("Park Place", pt(350), "#0000FF", p(350), 10, p(35), p(175), p(500), p(1100), p(1300), p(1500));
	square[38] = new Square("LUXURY TAX", "Pay " + pt(100), "#FFFFFF");
	square[39] = new Square("Boardwalk", pt(400), "#0000FF", p(400), 10, p(50), p(200), p(600), p(1400), p(1700), p(2000));

	communityChestCards[0] = new Card("Get out of Jail, Free. This card may be kept until needed or sold.", function(p) { p.communityChestJailCard = true; updateOwned();});
	communityChestCards[1] = new Card("You have won second prize in a beauty contest. Collect " + pt(10) + ".", function() { addamount(p(10), 'Community Chest');});
	communityChestCards[2] = new Card("From sale of stock, you get " + pt(50) + ".", function() { addamount(p(50), 'Community Chest');});
	communityChestCards[3] = new Card("Life insurance matures. Collect " + pt(100) + ".", function() { addamount(p(100), 'Community Chest');});
	communityChestCards[4] = new Card("Income tax refund. Collect " + pt(20) + ".", function() { addamount(p(20), 'Community Chest');});
	communityChestCards[5] = new Card("Holiday fund matures. Receive " + pt(100) + ".", function() { addamount(p(100), 'Community Chest');});
	communityChestCards[6] = new Card("You inherit " + pt(100) + ".", function() { addamount(p(100), 'Community Chest');});
	communityChestCards[7] = new Card("Receive " + pt(25) + " consultancy fee.", function() { addamount(p(25), 'Community Chest');});
	communityChestCards[8] = new Card("Pay hospital fees of " + pt(100) + ".", function() { subtractamount(p(100), 'Community Chest');});
	communityChestCards[9] = new Card("Bank error in your favor. Collect " + pt(200) + ".", function() { addamount(p(200), 'Community Chest');});
	communityChestCards[10] = new Card("Pay school fees of " + pt(50) + ".", function() { subtractamount(p(50), 'Community Chest');});
	communityChestCards[11] = new Card("Doctor's fee. Pay " + pt(50) + ".", function() { subtractamount(p(50), 'Community Chest');});
	communityChestCards[12] = new Card("It is your birthday. Collect " + pt(10) + " from every player.", function() { collectfromeachplayer(p(10), 'Community Chest');});
	communityChestCards[13] = new Card("Advance to \"GO\" (Collect " + pt(200) + ").", function() { advance(0);});
	communityChestCards[14] = new Card("You are assessed for street repairs. " + pt(40) + " per house. " + pt(115) + " per hotel.", function() { streetrepairs(p(40), p(115));});
	communityChestCards[15] = new Card("Go to Jail. Go directly to Jail. Do not pass \"GO\". Do not collect " + pt(200) + ".", function() { gotojail();});

	chanceCards[0] = new Card("GET OUT OF JAIL FREE. This card may be kept until needed or traded.", function(p) { p.chanceJailCard=true; updateOwned();});
	chanceCards[1] = new Card("Make General Repairs on All Your Property. For each house pay " + pt(25) + ". For each hotel " + pt(100) + ".", function() { streetrepairs(p(25), p(100));});
	chanceCards[2] = new Card("Speeding fine " + pt(15) + ".", function() { subtractamount(p(15), 'Chance');});
	chanceCards[3] = new Card("You have been elected chairman of the board. Pay each player " + pt(50) + ".", function() { payeachplayer(p(50), 'Chance');});
	chanceCards[4] = new Card("Go back three spaces.", function() { gobackthreespaces();});
	chanceCards[5] = new Card("ADVANCE TO THE NEAREST UTILITY. IF UNOWNED, you may buy it from the Bank. IF OWNED, throw dice and pay owner a total ten times the amount thrown.", function() { advanceToNearestUtility();});
	chanceCards[6] = new Card("Bank pays you dividend of " + pt(50) + ".", function() { addamount(p(50), 'Chance');});
	chanceCards[7] = new Card("ADVANCE TO THE NEAREST RAILROAD. If UNOWNED, you may buy it from the Bank. If OWNED, pay owner twice the rental to which they are otherwise entitled.", function() { advanceToNearestRailroad();});
	chanceCards[8] = new Card("Pay poor tax of " + pt(15) + ".", function() { subtractamount(p(15), 'Chance');});
	chanceCards[9] = new Card("Take a trip to Reading Rail Road. If you pass \"GO\" collect " + pt(200) + ".", function() { advance(5);});
	chanceCards[10] = new Card("ADVANCE to Boardwalk.", function() { advance(39);});
	chanceCards[11] = new Card("ADVANCE to Illinois Avenue. If you pass \"GO\" collect " + pt(200) + ".", function() { advance(24);});
	chanceCards[12] = new Card("Your building loan matures. Collect " + pt(150) + ".", function() { addamount(p(150), 'Chance');});
	chanceCards[13] = new Card("ADVANCE TO THE NEAREST RAILROAD. If UNOWNED, you may buy it from the Bank. If OWNED, pay owner twice the rental to which they are otherwise entitled.", function() { advanceToNearestRailroad();});
	chanceCards[14] = new Card("ADVANCE to St. Charles Place. If you pass \"GO\" collect " + pt(200) + ".", function() { advance(11);});
	chanceCards[15] = new Card("Go to Jail. Go Directly to Jail. Do not pass \"GO\". Do not collect " + pt(200) + ".", function() { gotojail();});
	

    // Re-link color groups
    var groupPropertyArray = [];
	var groupNumber;
	for (var i = 0; i < 40; i++) {
		groupNumber = square[i].groupNumber;
		if (groupNumber > 0) {
			if (!groupPropertyArray[groupNumber]) {
				groupPropertyArray[groupNumber] = [];
			}
			groupPropertyArray[groupNumber].push(i);
		}
	}
	for (var i = 0; i < 40; i++) {
		groupNumber = square[i].groupNumber;
		if (groupNumber > 0) {
			square[i].group = groupPropertyArray[groupNumber];
		}
		square[i].index = i;
	}
	
    // We must rebuild the deck properties because we wiped the arrays above.
    
    communityChestCards.index = 0;
    chanceCards.index = 0;
    communityChestCards.deck = [];
    chanceCards.deck = [];

    for (var i = 0; i < 16; i++) {
        chanceCards.deck[i] = i;
        communityChestCards.deck[i] = i;
    }

    // Shuffle Chance and Community Chest decks.
    chanceCards.deck.sort(function() {return Math.random() - 0.5;});
    communityChestCards.deck.sort(function() {return Math.random() - 0.5;});
}

// ==========================================
// EXPOSE ALL HELPER FUNCTIONS TO WINDOW
// ==========================================
window.Square = Square;
window.Card = Card;
window.square = square;
window.communityChestCards = communityChestCards;
window.chanceCards = chanceCards;

// Visual corrections & Text helpers
window.corrections = corrections;
window.utiltext = utiltext;
window.transtext = transtext;

// Tax Logic
window.citytax = citytax;
window.luxurytax = luxurytax;

// Init Function
window.initClassicEdition = function(scale) {
    initClassicEdition(scale);
    // Refresh globals after init runs
    window.square = square; 
    window.communityChestCards = communityChestCards;
    window.chanceCards = chanceCards;
};

// Run once on load
window.initClassicEdition(1);
