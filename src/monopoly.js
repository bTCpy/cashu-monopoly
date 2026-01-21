var GAME_SCALE = 1; // Prevent crash on load

// Track P2P Lobby
window.connectedPlayers = [];

// --- IMPORT HELPERS FROM CLASSICEDITION ---
// These are defined in the other file but used here.
// We map them to local variables so the existing code works without changes.
var corrections = function() { if(window.corrections) window.corrections(); };
var utiltext = function() { return window.utiltext ? window.utiltext() : ""; };
var transtext = function() { return window.transtext ? window.transtext() : ""; };
var citytax = function() { if(window.citytax) window.citytax(); };
var luxurytax = function() { if(window.luxurytax) window.luxurytax(); };
// ------------------------------------------
// Define event handlers:

window.tradeMoneyOnKeyDown = function (e) {
	var key = 0;
	var isCtrl = false;
	var isShift = false;

	if (window.event) {
		key = window.event.keyCode;
		isCtrl = window.event.ctrlKey;
		isShift = window.event.shiftKey;
	} else if (e) {
		key = e.keyCode;
		isCtrl = e.ctrlKey;
		isShift = e.shiftKey;
	}

	if (isNaN(key)) {
		return true;
	}

	if (key === 13) {
		return false;
	}

	// Allow backspace, tab, delete, arrow keys, or if control was pressed, respectively.
	if (key === 8 || key === 9 || key === 46 || (key >= 35 && key <= 40) || isCtrl) {
		return true;
	}

	if (isShift) {
		return false;
	}

	// Only allow number keys.
	return (key >= 48 && key <= 57) || (key >= 96 && key <= 105);
};

window.tradeMoneyOnFocus = function () {
	this.style.color = "black";
	if (isNaN(this.value) || this.value === "0") {
		this.value = "";
	}
};

window.tradeMoneyOnChange = function(e) {
	$("#proposetradebutton").show();
	$("#canceltradebutton").show();
	$("#accepttradebutton").hide();
	$("#rejecttradebutton").hide();

	var amount = this.value;

	if (isNaN(amount)) {
		this.value = "This value must be a number.";
		this.style.color = "red";
		return false;
	}

	amount = Math.round(amount) || 0;
	this.value = amount;

	if (amount < 0) {
		this.value = "This value must be greater than 0.";
		this.style.color = "red";
		return false;
	}

	return true;
};


function Game() {
	var die1;
	var die2;
	var areDiceRolled = false;

	var auctionQueue = [];
	var highestbidder;
	var highestbid;
	var currentbidder = 1;
	var auctionproperty;

	this.rollDice = function() {
		die1 = Math.floor(Math.random() * 6) + 1;
		die2 = Math.floor(Math.random() * 6) + 1;
		areDiceRolled = true;
	};

	this.resetDice = function() {
		areDiceRolled = false;
	};

	this.next = function() {
		// P2P INTERCEPTION
		var myIndex = window.MY_PLAYER_INDEX;
		// If I am NOT the host (I am Joiner), and I have a network connection...
		if (window.nostrManager && window.nostrManager.gameId && myIndex !== 1) {
		    // ...Send the signal instead of running logic
		    window.nostrManager.sendAction('NEXT');
		    return; // <--- STOP LOCAL EXECUTION
		}
		
		var p = player[turn];
		if (!p.human && p.money < 0) {
			p.AI.payDebt();

			if (p.money < 0) {
				popup("<p>" + p.name + " is bankrupt. All of its assets will be turned over to " + player[p.creditor].name + ".</p>", game.bankruptcy);
			} else {
				roll();
			}
		} else if (areDiceRolled && doublecount === 0) {
			play();
		} else {
			roll();
		}
		setTimeout(broadcastGameState, 100);
	};

	this.getDie = function(die) {
		if (die === 1) {

			return die1;
		} else {

			return die2;
		}

	};
	
	this.getAuctionState = function() {
		// These variables are private inside Game, so we expose them via this getter
		return {
			bidder: currentbidder,
			property: auctionproperty,
			highestbid: highestbid,
            		highestbidder: highestbidder
		};
	};
	
	this.setAuctionState = function(data) {
        	if (!data) return;
			currentbidder = data.bidder;
			auctionproperty = data.property;
        	highestbid = data.highestbid;
        	highestbidder = data.highestbidder;
	};


	// Auction functions:
	

	var finalizeAuction = function() {
		var p = player[highestbidder];
		var sq = square[auctionproperty];

		if (highestbid > 0) {
			p.pay(highestbid, 0);
			sq.owner = highestbidder;
			addAlert(p.name + " bought " + sq.name + " for ⚡₿" + highestbid + ".");
		}

		for (var i = 1; i <= pcount; i++) {
			player[i].bidding = true;
		}

		$("#popupbackground").hide();
		$("#popupwrap").hide();
		
	        if (isMobile()) {
            	$("#control").show();
        	}

		if (!game.auction()) {
			play();
		}
	};

	this.addPropertyToAuctionQueue = function(propertyIndex) {
		auctionQueue.push(propertyIndex);
	};

	this.auction = function() {
		if (auctionQueue.length === 0) {
			return false;
		}

		var index = auctionQueue.shift();

		var s = square[index];

		if (s.price === 0 || s.owner !== 0) {
			return game.auction();
		}

		auctionproperty = index;
		highestbidder = 0;
		highestbid = 0;
		currentbidder = turn + 1;

		if (currentbidder > pcount) {
			currentbidder -= pcount;
		}

		popup("<div style='font-weight: bold; font-size: 16px; margin-bottom: 10px;'>Auction <span id='propertyname'></span></div><div>Highest Bid = ⚡₿<span id='highestbid'></span> (<span id='highestbidder'></span>)</div><div><span id='currentbidder'></span>, it is your turn to bid.</div<div><input id='bid' title='Enter an amount to bid on " + s.name + ".' style='width: 291px;' /></div><div><input type='button' value='Bid' onclick='game.auctionBid();' title='Place your bid.' /><input type='button' value='Pass' title='Skip bidding this time.' onclick='game.auctionPass();' /><input type='button' value='Exit Auction' title='Stop bidding on " + s.name + " altogether.' onclick='if (confirm(\"Are you sure you want to stop bidding on this property altogether?\")) game.auctionExit();' /></div>", "blank");

		document.getElementById("propertyname").innerHTML = "<a href='javascript:void(0);' onmouseover='showdeed(" + auctionproperty + ");' onmouseout='hidedeed();' class='statscellcolor'>" + s.name + "</a>";
		document.getElementById("highestbid").innerHTML = "0";
		document.getElementById("highestbidder").innerHTML = "N/A";
		document.getElementById("currentbidder").innerHTML = player[currentbidder].name;
		document.getElementById("bid").onkeydown = function (e) {
			var key = 0;
			var isCtrl = false;
			var isShift = false;

			if (window.event) {
				key = window.event.keyCode;
				isCtrl = window.event.ctrlKey;
				isShift = window.event.shiftKey;
			} else if (e) {
				key = e.keyCode;
				isCtrl = e.ctrlKey;
				isShift = e.shiftKey;
			}

			if (isNaN(key)) {
				return true;
			}

			if (key === 13) {
				game.auctionBid();
				return false;
			}

			// Allow backspace, tab, delete, arrow keys, or if control was pressed, respectively.
			if (key === 8 || key === 9 || key === 46 || (key >= 35 && key <= 40) || isCtrl) {
				return true;
			}

			if (isShift) {
				return false;
			}

			// Only allow number keys.
			return (key >= 48 && key <= 57) || (key >= 96 && key <= 105);
		};

		document.getElementById("bid").onfocus = function () {
			this.style.color = "black";
			if (isNaN(this.value)) {
				this.value = "";
			}
		};

		updateMoney();

		if (!player[currentbidder].human) {
			currentbidder = turn; // auctionPass advances currentbidder.
			this.auctionPass();
		}
		return true;
	};

	this.auctionPass = function() {
		// P2P INTERCEPTION
        	var myIndex = window.MY_PLAYER_INDEX || 1;
        	if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
            	    if (currentbidder !== myIndex) return;

            	    if (myIndex !== 1) {
                	window.nostrManager.sendAction('AUCTION_PASS');
                	return;
            		}
        	    }
        
		if (highestbidder === 0) {
			highestbidder = currentbidder;
		}

		while (true) {
			currentbidder++;

			if (currentbidder > pcount) {
				currentbidder -= pcount;
			}

			if (currentbidder == highestbidder) {
				finalizeAuction();
				return;
			} else if (player[currentbidder].bidding) {
				var p = player[currentbidder];

				if (!p.human) {
					var bid = p.AI.bid(auctionproperty, highestbid);

					if (bid === -1 || highestbid >= p.money) {
						p.bidding = false;

						window.alert(p.name + " exited the auction.");
						continue;

					} else if (bid === 0) {
						window.alert(p.name + " passed.");
						continue;

					} else if (bid > 0) {
						this.auctionBid(bid);
						window.alert(p.name + " bid ⚡₿" + bid + ".");
						continue;
					}
					return;
				} else {
					break;
				}
			}

		}

		document.getElementById("currentbidder").innerHTML = player[currentbidder].name;
		document.getElementById("bid").value = "";
		document.getElementById("bid").style.color = "black";
		
		if(window.broadcastGameState) window.broadcastGameState();
	};

	this.auctionBid = function(bid) {
		// P2P INTERCEPTION
        	var myIndex = window.MY_PLAYER_INDEX || 1;
        	if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
            	    // 1. If not my turn to bid, ignore
            	    if (currentbidder !== myIndex) return;

            	    // 2. If Joiner, send action
            	    if (myIndex !== 1) {
                	var val = bid || parseInt(document.getElementById("bid").value, 10);
                	window.nostrManager.sendAction('AUCTION_BID', { amount: val });
                	return;
    			}
        	    }
		
		bid = bid || parseInt(document.getElementById("bid").value, 10);

		if (bid === "" || bid === null) {
			document.getElementById("bid").value = "Please enter a bid.";
			document.getElementById("bid").style.color = "red";
		} else if (isNaN(bid)) {
			document.getElementById("bid").value = "Your bid must be a number.";
			document.getElementById("bid").style.color = "red";
		} else {

			if (bid > player[currentbidder].money) {
				document.getElementById("bid").value = "You don't have enough money to bid ⚡₿" + bid + ".";
				document.getElementById("bid").style.color = "red";
			} else if (bid > highestbid) {
				highestbid = bid;
				document.getElementById("highestbid").innerHTML = parseInt(bid, 10);
				highestbidder = currentbidder;
				document.getElementById("highestbidder").innerHTML = player[highestbidder].name;

				document.getElementById("bid").focus();

				if (player[currentbidder].human) {
					this.auctionPass();
				}
			} else {
				document.getElementById("bid").value = "Your bid must be greater than highest bid. (⚡₿" + highestbid + ")";
				document.getElementById("bid").style.color = "red";
			}
		}
	if(window.broadcastGameState) window.broadcastGameState();
	};

	this.auctionExit = function() {
		// P2P INTERCEPTION
        	var myIndex = window.MY_PLAYER_INDEX || 1;
        	if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
            	    if (currentbidder !== myIndex) return;

            	    if (myIndex !== 1) {
                	window.nostrManager.sendAction('AUCTION_EXIT');
                	return;
            		}
        	    }
		
		player[currentbidder].bidding = false;
		this.auctionPass();
	};



	// Trade functions:



	var currentInitiator;
	var currentRecipient;



	var resetTrade = function(initiator, recipient, allowRecipientToBeChanged) {
		var currentSquare;
		var currentTableRow;
		var currentTableCell;
		var currentTableCellCheckbox;
		var nameSelect;
		var currentOption;
		var allGroupUninproved;
		var currentName;

		var tableRowOnClick = function(e) {
			var checkboxElement = this.firstChild.firstChild;

			if (checkboxElement !== e.srcElement) {
				checkboxElement.checked = !checkboxElement.checked;
			}

			$("#proposetradebutton").show();
			$("#canceltradebutton").show();
			$("#accepttradebutton").hide();
			$("#rejecttradebutton").hide();
		};

		var initiatorProperty = document.getElementById("trade-leftp-property");
		var recipientProperty = document.getElementById("trade-rightp-property");

		currentInitiator = initiator;
		currentRecipient = recipient;

		// Empty elements.
		while (initiatorProperty.lastChild) {
			initiatorProperty.removeChild(initiatorProperty.lastChild);
		}

		while (recipientProperty.lastChild) {
			recipientProperty.removeChild(recipientProperty.lastChild);
		}

		var initiatorSideTable = document.createElement("table");
		var recipientSideTable = document.createElement("table");


		for (var i = 0; i < 40; i++) {
			currentSquare = square[i];

			// A property cannot be traded if any properties in its group have been improved.
			if (currentSquare.house > 0 || currentSquare.groupNumber === 0) {
				continue;
			}

			allGroupUninproved = true;
			var max = currentSquare.group.length;
			for (var j = 0; j < max; j++) {

				if (square[currentSquare.group[j]].house > 0) {
					allGroupUninproved = false;
					break;
				}
			}

			if (!allGroupUninproved) {
				continue;
			}

			// Offered properties.
			if (currentSquare.owner === initiator.index) {
				currentTableRow = initiatorSideTable.appendChild(document.createElement("tr"));
				currentTableRow.onclick = tableRowOnClick;

				currentTableCell = currentTableRow.appendChild(document.createElement("td"));
				currentTableCell.className = "propertycellcheckbox";
				currentTableCellCheckbox = currentTableCell.appendChild(document.createElement("input"));
				currentTableCellCheckbox.type = "checkbox";
				currentTableCellCheckbox.id = "tradeleftcheckbox" + i;
				currentTableCellCheckbox.title = "Check this box to include " + currentSquare.name + " in the trade.";

				currentTableCell = currentTableRow.appendChild(document.createElement("td"));
				currentTableCell.className = "propertycellcolor";
				currentTableCell.style.backgroundColor = currentSquare.color;

				if (currentSquare.groupNumber == 1 || currentSquare.groupNumber == 2) {
					currentTableCell.style.borderColor = "grey";
				} else {
					currentTableCell.style.borderColor = currentSquare.color;
				}

				currentTableCell.propertyIndex = i;
				currentTableCell.onmouseover = function() {showdeed(this.propertyIndex);};
				currentTableCell.onmouseout = hidedeed;

				currentTableCell = currentTableRow.appendChild(document.createElement("td"));
				currentTableCell.className = "propertycellname";
				if (currentSquare.mortgage) {
					currentTableCell.title = "Mortgaged";
					currentTableCell.style.color = "grey";
				}
				currentTableCell.textContent = currentSquare.name;

			// Requested properties.
			} else if (currentSquare.owner === recipient.index) {
				currentTableRow = recipientSideTable.appendChild(document.createElement("tr"));
				currentTableRow.onclick = tableRowOnClick;

				currentTableCell = currentTableRow.appendChild(document.createElement("td"));
				currentTableCell.className = "propertycellcheckbox";
				currentTableCellCheckbox = currentTableCell.appendChild(document.createElement("input"));
				currentTableCellCheckbox.type = "checkbox";
				currentTableCellCheckbox.id = "traderightcheckbox" + i;
				currentTableCellCheckbox.title = "Check this box to include " + currentSquare.name + " in the trade.";

				currentTableCell = currentTableRow.appendChild(document.createElement("td"));
				currentTableCell.className = "propertycellcolor";
				currentTableCell.style.backgroundColor = currentSquare.color;

				if (currentSquare.groupNumber == 1 || currentSquare.groupNumber == 2) {
					currentTableCell.style.borderColor = "grey";
				} else {
					currentTableCell.style.borderColor = currentSquare.color;
				}

				currentTableCell.propertyIndex = i;
				currentTableCell.onmouseover = function() {showdeed(this.propertyIndex);};
				currentTableCell.onmouseout = hidedeed;

				currentTableCell = currentTableRow.appendChild(document.createElement("td"));
				currentTableCell.className = "propertycellname";
				if (currentSquare.mortgage) {
					currentTableCell.title = "Mortgaged";
					currentTableCell.style.color = "grey";
				}
				currentTableCell.textContent = currentSquare.name;
			}
		}

		if (initiator.communityChestJailCard) {
			currentTableRow = initiatorSideTable.appendChild(document.createElement("tr"));
			currentTableRow.onclick = tableRowOnClick;

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellcheckbox";
			currentTableCellCheckbox = currentTableCell.appendChild(document.createElement("input"));
			currentTableCellCheckbox.type = "checkbox";
			currentTableCellCheckbox.id = "tradeleftcheckbox40";
			currentTableCellCheckbox.title = "Check this box to include this Get Out of Jail Free Card in the trade.";

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellcolor";
			currentTableCell.style.backgroundColor = "white";
			currentTableCell.style.borderColor = "grey";

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellname";

			currentTableCell.textContent = "Get Out of Jail Free Card";
		} else if (recipient.communityChestJailCard) {
			currentTableRow = recipientSideTable.appendChild(document.createElement("tr"));
			currentTableRow.onclick = tableRowOnClick;

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellcheckbox";
			currentTableCellCheckbox = currentTableCell.appendChild(document.createElement("input"));
			currentTableCellCheckbox.type = "checkbox";
			currentTableCellCheckbox.id = "traderightcheckbox40";
			currentTableCellCheckbox.title = "Check this box to include this Get Out of Jail Free Card in the trade.";

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellcolor";
			currentTableCell.style.backgroundColor = "white";
			currentTableCell.style.borderColor = "grey";

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellname";

			currentTableCell.textContent = "Get Out of Jail Free Card";
		}

		if (initiator.chanceJailCard) {
			currentTableRow = initiatorSideTable.appendChild(document.createElement("tr"));
			currentTableRow.onclick = tableRowOnClick;

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellcheckbox";
			currentTableCellCheckbox = currentTableCell.appendChild(document.createElement("input"));
			currentTableCellCheckbox.type = "checkbox";
			currentTableCellCheckbox.id = "tradeleftcheckbox41";
			currentTableCellCheckbox.title = "Check this box to include this Get Out of Jail Free Card in the trade.";

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellcolor";
			currentTableCell.style.backgroundColor = "white";
			currentTableCell.style.borderColor = "grey";

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellname";

			currentTableCell.textContent = "Get Out of Jail Free Card";
		} else if (recipient.chanceJailCard) {
			currentTableRow = recipientSideTable.appendChild(document.createElement("tr"));
			currentTableRow.onclick = tableRowOnClick;

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellcheckbox";
			currentTableCellCheckbox = currentTableCell.appendChild(document.createElement("input"));
			currentTableCellCheckbox.type = "checkbox";
			currentTableCellCheckbox.id = "traderightcheckbox41";
			currentTableCellCheckbox.title = "Check this box to include this Get Out of Jail Free Card in the trade.";

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellcolor";
			currentTableCell.style.backgroundColor = "white";
			currentTableCell.style.borderColor = "grey";

			currentTableCell = currentTableRow.appendChild(document.createElement("td"));
			currentTableCell.className = "propertycellname";

			currentTableCell.textContent = "Get Out of Jail Free Card";
		}

		if (initiatorSideTable.lastChild) {
			initiatorProperty.appendChild(initiatorSideTable);
		} else {
			initiatorProperty.textContent = initiator.name + " has no properties to trade.";
		}

		if (recipientSideTable.lastChild) {
			recipientProperty.appendChild(recipientSideTable);
		} else {
			recipientProperty.textContent = recipient.name + " has no properties to trade.";
		}

		document.getElementById("trade-leftp-name").textContent = initiator.name;

		currentName = document.getElementById("trade-rightp-name");

		if (allowRecipientToBeChanged && pcount > 2) {
			// Empty element.
			while (currentName.lastChild) {
				currentName.removeChild(currentName.lastChild);
			}

			nameSelect = currentName.appendChild(document.createElement("select"));
			for (var i = 1; i <= pcount; i++) {
				if (i === initiator.index) {
					continue;
				}

				currentOption = nameSelect.appendChild(document.createElement("option"));
				currentOption.value = i + "";
				currentOption.style.color = player[i].color;
				currentOption.textContent = player[i].name;

				if (i === recipient.index) {
					currentOption.selected = "selected";
				}
			}

			nameSelect.onchange = function() {
				resetTrade(currentInitiator, player[parseInt(this.value, 10)], true);
			};

			nameSelect.title = "Select a player to trade with.";
		} else {
			currentName.textContent = recipient.name;
		}

		document.getElementById("trade-leftp-money").value = "0";
		document.getElementById("trade-rightp-money").value = "0";

	};

	var readTrade = function() {
		var initiator = currentInitiator;
		var recipient = currentRecipient;
		var property = new Array(40);
		var money;
		var communityChestJailCard;
		var chanceJailCard;

		for (var i = 0; i < 40; i++) {

			if (document.getElementById("tradeleftcheckbox" + i) && document.getElementById("tradeleftcheckbox" + i).checked) {
				property[i] = 1;
			} else if (document.getElementById("traderightcheckbox" + i) && document.getElementById("traderightcheckbox" + i).checked) {
				property[i] = -1;
			} else {
				property[i] = 0;
			}
		}

		if (document.getElementById("tradeleftcheckbox40") && document.getElementById("tradeleftcheckbox40").checked) {
			communityChestJailCard = 1;
		} else if (document.getElementById("traderightcheckbox40") && document.getElementById("traderightcheckbox40").checked) {
			communityChestJailCard = -1;
		} else {
			communityChestJailCard = 0;
		}

		if (document.getElementById("tradeleftcheckbox41") && document.getElementById("tradeleftcheckbox41").checked) {
			chanceJailCard = 1;
		} else if (document.getElementById("traderightcheckbox41") && document.getElementById("traderightcheckbox41").checked) {
			chanceJailCard = -1;
		} else {
			chanceJailCard = 0;
		}

		money = parseInt(document.getElementById("trade-leftp-money").value, 10) || 0;
		money -= parseInt(document.getElementById("trade-rightp-money").value, 10) || 0;

		var trade = new Trade(initiator, recipient, money, property, communityChestJailCard, chanceJailCard);

		return trade;
	};

	window.writeTrade = function(tradeObj) {
		resetTrade(tradeObj.getInitiator(), tradeObj.getRecipient(), false);

		for (var i = 0; i < 40; i++) {

			if (document.getElementById("tradeleftcheckbox" + i)) {
				document.getElementById("tradeleftcheckbox" + i).checked = false;
				if (tradeObj.getProperty(i) === 1) {
					document.getElementById("tradeleftcheckbox" + i).checked = true;
				}
			}

			if (document.getElementById("traderightcheckbox" + i)) {
				document.getElementById("traderightcheckbox" + i).checked = false;
				if (tradeObj.getProperty(i) === -1) {
					document.getElementById("traderightcheckbox" + i).checked = true;
				}
			}
		}

		if (document.getElementById("tradeleftcheckbox40")) {
			if (tradeObj.getCommunityChestJailCard() === 1) {
				document.getElementById("tradeleftcheckbox40").checked = true;
			} else {
				document.getElementById("tradeleftcheckbox40").checked = false;
			}
		}

		if (document.getElementById("traderightcheckbox40")) {
			if (tradeObj.getCommunityChestJailCard() === -1) {
				document.getElementById("traderightcheckbox40").checked = true;
			} else {
				document.getElementById("traderightcheckbox40").checked = false;
			}
		}

		if (document.getElementById("tradeleftcheckbox41")) {
			if (tradeObj.getChanceJailCard() === 1) {
				document.getElementById("tradeleftcheckbox41").checked = true;
			} else {
				document.getElementById("tradeleftcheckbox41").checked = false;
			}
		}

		if (document.getElementById("traderightcheckbox41")) {
			if (tradeObj.getChanceJailCard() === -1) {
				document.getElementById("traderightcheckbox41").checked = true;
			} else {
				document.getElementById("traderightcheckbox41").checked = false;
			}
		}

		if (tradeObj.getMoney() > 0) {
			document.getElementById("trade-leftp-money").value = tradeObj.getMoney() + "";
		} else {
			document.getElementById("trade-rightp-money").value = (-tradeObj.getMoney()) + "";
		}

	};

	this.trade = function(tradeObj) {
		$("#board").hide();
		$("#control").hide();
		$("#trade").show();
		$("#proposetradebutton").show();
		$("#canceltradebutton").show();
		$("#accepttradebutton").hide();
		$("#rejecttradebutton").hide();

		if (tradeObj instanceof Trade) {
			writeTrade(tradeObj);
			this.proposeTrade();
		} else {
			var initiator = player[turn];
			var recipient = turn === 1 ? player[2] : player[1];

			currentInitiator = initiator;
			currentRecipient = recipient;

			resetTrade(initiator, recipient, true);
		}
	};
	
	
	this.openRemoteTrade = function(tradeObj) {
		// Call the private writeTrade function
		writeTrade(tradeObj);
		
		// Save global state
		window.currentActiveTrade = tradeObj;
		
		// Update UI
		$("#proposetradebutton, #canceltradebutton").hide();
		$("#accepttradebutton").show();
		$("#rejecttradebutton").show();
		
		$("#trade").show();
		$("#board").hide();
		$("#control").hide();
	};


	this.cancelTrade = function() {
		// P2P INTERCEPTION
		if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
		    var myIndex = window.MY_PLAYER_INDEX || 1;

		    // CASE A: JOINER -> Send Action
		    if (myIndex !== 1) {
		        window.nostrManager.sendAction('TRADE_CANCEL');
		        return;
		    }
		    
		    // CASE B: HOST -> Execute Locally
		    // Fall through to standard logic below, but ensure we broadcast at the end.
		    // (We set a flag to trigger broadcast after the DOM updates)
		    var shouldBroadcast = true;
		}
		
		$("#board").show();
		$("#control").show();
		$("#trade").hide();


		if (!player[turn].human) {
			player[turn].AI.alertList = "";
			game.next();
		}
		
		window.currentActiveTrade = null;
		
		// Broadcast if Host
		if (shouldBroadcast && window.broadcastGameState) {
		    window.broadcastGameState();
		}

	};

	this.acceptTrade = function(tradeObj) {
		// P2P INTERCEPTION
		if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
		    var myIndex = window.MY_PLAYER_INDEX || 1;

		    // CASE A: JOINER -> Send Action
		    if (myIndex !== 1) {
		        window.nostrManager.sendAction('TRADE_ACCEPT');
		        return;
		    }
		    
		    // CASE B: HOST -> Execute Locally
		    // Fall through to standard logic.
		    var shouldBroadcast = true;
		}
		
		if (isNaN(document.getElementById("trade-leftp-money").value)) {
			document.getElementById("trade-leftp-money").value = "This value must be a number.";
			document.getElementById("trade-leftp-money").style.color = "red";
			return false;
		}

		if (isNaN(document.getElementById("trade-rightp-money").value)) {
			document.getElementById("trade-rightp-money").value = "This value must be a number.";
			document.getElementById("trade-rightp-money").style.color = "red";
			return false;
		}

		var showAlerts = true;
		var money;
		var initiator;
		var recipient;

		if (tradeObj) {
			showAlerts = false;
		} else {
			tradeObj = readTrade();
		}

		money = tradeObj.getMoney();
		initiator = tradeObj.getInitiator();
		recipient = tradeObj.getRecipient();


		if (money > 0 && money > initiator.money) {
			document.getElementById("trade-leftp-money").value = initiator.name + " does not have ⚡₿" + money + ".";
			document.getElementById("trade-leftp-money").style.color = "red";
			return false;
		} else if (money < 0 && -money > recipient.money) {
			document.getElementById("trade-rightp-money").value = recipient.name + " does not have ⚡₿" + (-money) + ".";
			document.getElementById("trade-rightp-money").style.color = "red";
			return false;
		}

		var isAPropertySelected = 0;

		// Ensure that some properties are selected.
		for (var i = 0; i < 40; i++) {
			isAPropertySelected |= tradeObj.getProperty(i);
		}

		isAPropertySelected |= tradeObj.getCommunityChestJailCard();
		isAPropertySelected |= tradeObj.getChanceJailCard();

		if (isAPropertySelected === 0) {
			popup("<p>One or more properties must be selected in order to trade.</p>");

			return false;
		}

		if (showAlerts && !confirm(initiator.name + ", are you sure you want to make this exchange with " + recipient.name + "?")) {
			return false;
		}

		// Exchange properties
		for (var i = 0; i < 40; i++) {

			if (tradeObj.getProperty(i) === 1) {
				square[i].owner = recipient.index;
				addAlert(recipient.name + " received " + square[i].name + " from " + initiator.name + ".");
			} else if (tradeObj.getProperty(i) === -1) {
				square[i].owner = initiator.index;
				addAlert(initiator.name + " received " + square[i].name + " from " + recipient.name + ".");
			}

		}

		if (tradeObj.getCommunityChestJailCard() === 1) {
			initiator.communityChestJailCard = false;
			recipient.communityChestJailCard = true;
			addAlert(recipient.name + ' received a "Get Out of Jail Free" card from ' + initiator.name + ".");
		} else if (tradeObj.getCommunityChestJailCard() === -1) {
			initiator.communityChestJailCard = true;
			recipient.communityChestJailCard = false;
			addAlert(initiator.name + ' received a "Get Out of Jail Free" card from ' + recipient.name + ".");
		}

		if (tradeObj.getChanceJailCard() === 1) {
			initiator.chanceJailCard = false;
			recipient.chanceJailCard = true;
			addAlert(recipient.name + ' received a "Get Out of Jail Free" card from ' + initiator.name + ".");
		} else if (tradeObj.getChanceJailCard() === -1) {
			initiator.chanceJailCard = true;
			recipient.chanceJailCard = false;
			addAlert(initiator.name + ' received a "Get Out of Jail Free" card from ' + recipient.name + ".");
		}

		// Exchange money.
		if (money > 0) {
			initiator.pay(money, recipient.index);
			recipient.money += money;

			addAlert(recipient.name + " received ⚡₿" + money + " from " + initiator.name + ".");
		} else if (money < 0) {
			money = -money;

			recipient.pay(money, initiator.index);
			initiator.money += money;

			addAlert(initiator.name + " received ⚡₿" + money + " from " + recipient.name + ".");
		}

		updateOwned();
		updateMoney();

		$("#board").show();
		$("#control").show();
		$("#trade").hide();

		if (!player[turn].human) {
			player[turn].AI.alertList = "";
			game.next();
		}
		
		// Clear Global
		window.currentActiveTrade = null;

		// Broadcast Result
		if (shouldBroadcast && window.broadcastGameState) {
		    window.broadcastGameState();
		}
	};

	this.proposeTrade = function() {
		console.log("Propose Trade Clicked..."); // Debug Log
		
		// P2P INTERCEPTION
		if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
		    
		    // 1. Validate Inputs
		    if (isNaN(document.getElementById("trade-leftp-money").value) || 
		        isNaN(document.getElementById("trade-rightp-money").value)) {
		        return; 
		    }

		    var myIndex = window.MY_PLAYER_INDEX || 1;

		    // --- CASE A: JOINER (Player 2+) ---
		    // Send request to Host and stop.
		    if (myIndex !== 1) {
		        try {
		            var localTrade = readTrade();
		            var payload = window.serializeTrade(localTrade);
		            window.nostrManager.sendAction('TRADE_PROPOSE', payload);
		        } catch(e) { console.error(e); }
		        return;
		    }

		    // --- CASE B: HOST (Player 1) ---
		    // Execute locally, set global state, and broadcast.
		    // We do NOT use the standard fallthrough logic because that is for Hotseat (swapping turns).
		    // We want to lock the Host UI and show the proposal to the Joiner.
		    try {
		        var hostTrade = readTrade();
		        
		        // 1. Save as Active Trade
		        window.currentActiveTrade = hostTrade;
		        
		        // 2. Update Host UI to "Waiting" state (Can only Cancel)
		        $("#proposetradebutton").hide();
		        $("#accepttradebutton").hide();
		        $("#rejecttradebutton").hide();
		        $("#canceltradebutton").show().prop("disabled", false);
		        
		        // 3. Broadcast so Joiner sees the window open
		        broadcastGameState();
		        
		    } catch(e) { console.error("Host Trade Error", e); }
		    
		    return; // Stop standard logic
		}

		
		if (isNaN(document.getElementById("trade-leftp-money").value)) {
			document.getElementById("trade-leftp-money").value = "This value must be a number.";
			document.getElementById("trade-leftp-money").style.color = "red";
			return false;
		}

		if (isNaN(document.getElementById("trade-rightp-money").value)) {
			document.getElementById("trade-rightp-money").value = "This value must be a number.";
			document.getElementById("trade-rightp-money").style.color = "red";
			return false;
		}

		var tradeObj = readTrade();
		var money = tradeObj.getMoney();
		var initiator = tradeObj.getInitiator();
		var recipient = tradeObj.getRecipient();
		var reversedTradeProperty = [];

		if (money > 0 && money > initiator.money) {
			document.getElementById("trade-leftp-money").value = initiator.name + " does not have ⚡₿" + money + ".";
			document.getElementById("trade-leftp-money").style.color = "red";
			return false;
		} else if (money < 0 && -money > recipient.money) {
			document.getElementById("trade-rightp-money").value = recipient.name + " does not have ⚡₿" + (-money) + ".";
			document.getElementById("trade-rightp-money").style.color = "red";
			return false;
		}

		var isAPropertySelected = 0;

		// Ensure that some properties are selected.
		for (var i = 0; i < 40; i++) {
			reversedTradeProperty[i] = -tradeObj.getProperty(i);
			isAPropertySelected |= tradeObj.getProperty(i);
		}

		isAPropertySelected |= tradeObj.getCommunityChestJailCard();
		isAPropertySelected |= tradeObj.getChanceJailCard();

		if (isAPropertySelected === 0) {
			popup("<p>One or more properties must be selected in order to trade.</p>");

			return false;
		}

		if (initiator.human && !confirm(initiator.name + ", are you sure you want to make this offer to " + recipient.name + "?")) {
			return false;
		}

		var reversedTrade = new Trade(recipient, initiator, -money, reversedTradeProperty, -tradeObj.getCommunityChestJailCard(), -tradeObj.getChanceJailCard());

		if (recipient.human) {

			writeTrade(reversedTrade);

			$("#proposetradebutton").hide();
			$("#canceltradebutton").hide();
			$("#accepttradebutton").show();
			$("#rejecttradebutton").show();

			addAlert(initiator.name + " initiated a trade with " + recipient.name + ".");
			popup("<p>" + initiator.name + " has proposed a trade with you, " + recipient.name + ". You may accept, reject, or modify the offer.</p>");
		} else {
			var tradeResponse = recipient.AI.acceptTrade(tradeObj);

			if (tradeResponse === true) {
				popup("<p>" + recipient.name + " has accepted your offer.</p>");
				this.acceptTrade(reversedTrade);
			} else if (tradeResponse === false) {
				popup("<p>" + recipient.name + " has declined your offer.</p>");
				return;
			} else if (tradeResponse instanceof Trade) {
				popup("<p>" + recipient.name + " has proposed a counteroffer.</p>");
				writeTrade(tradeResponse);

				$("#proposetradebutton, #canceltradebutton").hide();
				$("#accepttradebutton").show();
				$("#rejecttradebutton").show();
			}
		}
	};



	// Bankrupcy functions:




	this.eliminatePlayer = function() {
		var p = player[turn];

		for (var i = p.index; i < pcount; i++) {
			player[i] = player[i + 1];
			player[i].index = i;

		}

		for (var i = 0; i < 40; i++) {
			if (square[i].owner >= p.index) {
				square[i].owner--;
			}
		}

		pcount--;
		turn--;

		if (pcount === 2) {
			document.getElementById("stats").style.width = "454px";
		} else if (pcount === 3) {
			document.getElementById("stats").style.width = "686px";
		}

		if (pcount === 1) {
			updateMoney();
			$("#control").hide();
			$("#board").hide();
			
			// 1. Get the winner's name from the remaining player object.
			var winnerName = player[1].name;

			//$("#refresh").show();

			// // Display land counts for survey purposes.
			// var text;
			// for (var i = 0; i < 40; i++) {
				// if (i === 0)
					// text = square[i].landcount;
				// else
					// text += " " + square[i].landcount;
			// }
			// document.getElementById("refresh").innerHTML += "<br><br><div><textarea type='text' style='width: 980px;' onclick='javascript:select();' />" + text + "</textarea></div>";

			//popup("<p>Congratulations, " + player[1].name + ", you have won the game.</p><div>");
			triggerCashout(winnerName);

		} else {
			play();
		}
	};

	this.bankruptcyUnmortgage = function() {
		var p = player[turn];

		if (p.creditor === 0) {
			game.eliminatePlayer();
			return;
		}

		var HTML = "<p>" + player[p.creditor].name + ", you may unmortgage any of the following properties, interest free, by clicking on them. Click OK when finished.</p><table>";
		var price;

		for (var i = 0; i < 40; i++) {
			var sq = square[i];
			if (sq.owner == p.index && sq.mortgage) {
				price = Math.round(sq.price * 0.5);

				HTML += "<tr><td class='propertycellcolor' style='background: " + sq.color + ";";

				if (sq.groupNumber == 1 || sq.groupNumber == 2) {
					HTML += " border: 1px solid grey;";
				} else {
					HTML += " border: 1px solid " + sq.color + ";";
				}

				// Player already paid interest, so they can unmortgage for the mortgage price.
				HTML += "' onmouseover='showdeed(" + i + ");' onmouseout='hidedeed();'></td><td class='propertycellname'><a href='javascript:void(0);' title='Unmortgage " + sq.name + " for ⚡₿" + price + ".' onclick='if (" + price + " <= player[" + p.creditor + "].money) {player[" + p.creditor + "].pay(" + price + ", 0); square[" + i + "].mortgage = false; addAlert(\"" + player[p.creditor].name + " unmortgaged " + sq.name + " for ⚡₿" + price + ".\");} this.parentElement.parentElement.style.display = \"none\";'>Unmortgage " + sq.name + " (⚡₿" + price + ")</a></td></tr>";

				sq.owner = p.creditor;

			}
		}

		HTML += "</table>";

		popup(HTML, game.eliminatePlayer);
	};

	this.resign = function() {
		popup("<p>Are you sure you want to resign?</p>", game.bankruptcy, "Yes/No");
	};

	this.bankruptcy = function() {
		var p = player[turn];
		var pcredit = player[p.creditor];
		var bankruptcyUnmortgageFee = 0;


		if (p.money >= 0) {
			return;
		}

		addAlert(p.name + " is bankrupt.");

		if (p.creditor !== 0) {
			pcredit.money += p.money;
		}

		for (var i = 0; i < 40; i++) {
			var sq = square[i];
			if (sq.owner == p.index) {
				// Mortgaged properties will be tranfered by bankruptcyUnmortgage();
				if (!sq.mortgage) {
					sq.owner = p.creditor;
				} else {
					bankruptcyUnmortgageFee += Math.round(sq.price * 0.1);
				}

				if (sq.house > 0) {
					if (p.creditor !== 0) {
						pcredit.money += Math.round(sq.houseprice * 0.5 * sq.house);
					}
					sq.hotel = 0;
					sq.house = 0;
				}

				if (p.creditor === 0) {
					sq.mortgage = false;
					game.addPropertyToAuctionQueue(i);
					sq.owner = 0;
				}
			}
		}

		updateMoney();

		if (p.chanceJailCard) {
			p.chanceJailCard = false;
			pcredit.chanceJailCard = true;
		}

		if (p.communityChestJailCard) {
			p.communityChestJailCard = false;
			pcredit.communityChestJailCard = true;
		}

		if (pcount === 2 || bankruptcyUnmortgageFee === 0 || p.creditor === 0) {
			game.eliminatePlayer();
		} else {
			addAlert(pcredit.name + " paid ⚡₿" + bankruptcyUnmortgageFee + " interest on the mortgaged properties received from " + p.name + ".");
			popup("<p>" + pcredit.name + ", you must pay ⚡₿" + bankruptcyUnmortgageFee + " interest on the mortgaged properties you received from " + p.name + ".</p>", function() {player[pcredit.index].pay(bankruptcyUnmortgageFee, 0); game.bankruptcyUnmortgage();});
		}
	};

}

var game;


function Player(name, color) {
	this.name = name;
	this.color = color;
	this.position = 0;
	this.money = Math.round(1500 * GAME_SCALE);
	this.creditor = -1;
	this.jail = false;
	this.jailroll = 0;
	this.communityChestJailCard = false;
	this.chanceJailCard = false;
	this.bidding = true;
	this.human = true;
	// this.AI = null;

	this.pay = function (amount, creditor) {
		if (amount <= this.money) {
			this.money -= amount;

			updateMoney();

			return true;
		} else {
			this.money -= amount;
			this.creditor = creditor;

			updateMoney();

			return false;
		}
	};
}

// paramaters:
// initiator: object Player
// recipient: object Player
// money: integer, positive for offered, negative for requested
// property: array of integers, length: 40
// communityChestJailCard: integer, 1 means offered, -1 means requested, 0 means neither
// chanceJailCard: integer, 1 means offered, -1 means requested, 0 means neither
function Trade(initiator, recipient, money, property, communityChestJailCard, chanceJailCard) {
	// For each property and get out of jail free cards, 1 means offered, -1 means requested, 0 means neither.

	this.getInitiator = function() {
		return initiator;
	};

	this.getRecipient = function() {
		return recipient;
	};

	this.getProperty = function(index) {
		return property[index];
	};

	this.getMoney = function() {
		return money;
	};

	this.getCommunityChestJailCard = function() {
		return communityChestJailCard;
	};

	this.getChanceJailCard = function() {
		return chanceJailCard;
	};
}

var player = [];
var pcount;
var turn = 0, doublecount = 0;
// Overwrite an array with numbers from one to the array's length in a random order.
Array.prototype.randomize = function(length) {
	length = (length || this.length);
	var num;
	var indexArray = [];

	for (var i = 0; i < length; i++) {
		indexArray[i] = i;
	}

	for (var i = 0; i < length; i++) {
		// Generate random number between 0 and indexArray.length - 1.
		num = Math.floor(Math.random() * indexArray.length);
		this[i] = indexArray[num] + 1;

		indexArray.splice(num, 1);
	}
};

// function show(element) {
	// // Element may be an HTML element or the id of one passed as a string.
	// if (element.constructor == String) {
		// element = document.getElementById(element);
	// }

	// if (element.tagName == "INPUT" || element.tagName == "SPAN" || element.tagName == "LABEL") {
		// element.style.display = "inline";
	// } else {
		// element.style.display = "block";
	// }
// }

// function hide(element) {
	// // Element may be an HTML element or the id of one passed as a string.
	// if (element.constructor == String) {
		// document.getElementById(element).style.display = "none";
	// } else {
		// element.style.display = "none";
	// }
// }

function addAlert(alertText) {
	var $alert = $("#alert"); // <--- Added 'var'

	$(document.createElement("div")).text(alertText).appendTo($alert);

	// Animate scrolling down alert element.
	$alert.stop().animate({"scrollTop": $alert.prop("scrollHeight")}, 1000);

	if (player[turn] && !player[turn].human && player[turn].AI) {
		player[turn].AI.alertList += "<div>" + alertText + "</div>";
	}
}

function popup(HTML, action, option) {
	window.currentPopupAction = action; 
	
	document.getElementById("popuptext").innerHTML = HTML;
	document.getElementById("popup").style.width = "300px";
	document.getElementById("popup").style.top = "0px";
	document.getElementById("popup").style.left = "0px";

	if (!option && typeof action === "string") {
		option = action;
	}

	option = option ? option.toLowerCase() : "";

	if (typeof action !== "function") {
		action = null;
	}

	// Yes/No
	if (option === "yes/no") {
		document.getElementById("popuptext").innerHTML += "<div><input type=\"button\" value=\"Yes\" id=\"popupyes\" /><input type=\"button\" value=\"No\" id=\"popupno\" /></div>";

		$("#popupyes, #popupno").on("click", function() {
			$("#popupwrap").hide();
			$("#popupbackground").fadeOut(400);
			
		if (isMobile()) $("#control").show();
		
		//setTimeout to wait for game logic
		setTimeout(centerOnPlayer, 100);
		
		centerOnPlayer();
		
		});

		$("#popupyes").on("click", action);

	// Ok
	} else if (option !== "blank") {
		$("#popuptext").append("<div><input type='button' value='OK' id='popupclose' /></div>");
		$("#popupclose").focus();

		$("#popupclose").on("click", function() {
			$("#popupwrap").hide();
			$("#popupbackground").fadeOut(400);
		if (isMobile()) $("#control").show();
		
		//setTimeout to wait for game logic
		setTimeout(centerOnPlayer, 100);
		
		centerOnPlayer();
		
		}).on("click", action);

	}

	// 4. SHOW POPUP (Explicit Display Mode)
	var pWrap = document.getElementById("popupwrap");
	
	if (window.innerWidth <= 1000) {
        // Mobile: Force Flexbox for centering
		pWrap.style.display = "flex";
		$("#control").hide();
	} else {
        // Desktop: Force Block
		pWrap.style.display = "block";
	}

        // 5. Animate Background
	$("#popupbackground").fadeIn(400, function() {
        // Callback: Broadcast AGAIN after animation finishes
        // This catches cases where the first broadcast might have been missed or overwritten
        if (window.broadcastGameState) {
            window.broadcastGameState();
        	}
    	});

        // 6. Manage Button States (P2P Locking)
        if (window.nostrManager && window.nostrManager.gameId) {
        var myIndex = window.MY_PLAYER_INDEX || 1;
        
        // If there is a local action (e.g. Card Effect), ENABLE buttons.
        if (window.currentPopupAction) {
             $("#popupclose, #popupyes, #popupno").prop("disabled", false).css("opacity", 1.0);
        } else {
            // Passive popup: Only enable if it's my turn
            if (turn !== myIndex) {
                $("#popupclose, #popupyes, #popupno").prop("disabled", true).css("opacity", 0.5);
            } else {
                $("#popupclose, #popupyes, #popupno").prop("disabled", false).css("opacity", 1.0);
            }
        }
    }

    // 7. Broadcast Immediately
    // Now that pWrap.style.display is explicitly set, the broadcaster will catch it.
    if (window.broadcastGameState) {
        setTimeout(window.broadcastGameState, 50);
    
	}
	  // --- AUTO-SCROLL TO POPUP ON MOBILE (Capacitor-safe) ---
	  /*$("#popupwrap").show();
	  if (isMobile()) {
	    const popupElement = document.getElementById("popupwrap");
	    if (popupElement) {
	      const rect = popupElement.getBoundingClientRect();
	      const targetX = window.scrollX + rect.left + rect.width / 2 - window.innerWidth / 2;
	      const targetY = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
	      smoothScrollTo(targetX, targetY, 300); // Reuse your smooth scroll helper!
	    }
	    $("#control").hide();
	  }
	}); */
}


function updatePosition() {
	// Reset borders
	document.getElementById("jail").style.border = "1px solid black";
	document.getElementById("jailpositionholder").innerHTML = "";
	for (var i = 0; i < 40; i++) {
		document.getElementById("cell" + i).style.border = "1px solid black";
		document.getElementById("cell" + i + "positionholder").innerHTML = "";

	}

	var sq, left, top;

	for (var x = 0; x < 40; x++) {
		sq = square[x];
		left = 0;
		top = 0;

		for (var y = turn; y <= pcount; y++) {

			if (player[y].position == x && !player[y].jail) {

				document.getElementById("cell" + x + "positionholder").innerHTML += "<div class='cell-position' title='" + player[y].name + "' style='background-color: " + player[y].color + "; left: " + left + "px; top: " + top + "px;'></div>";
				if (left == 36) {
					left = 0;
					top = 12;
				} else
					left += 12;
			}
		}

		for (var y = 1; y < turn; y++) {

			if (player[y].position == x && !player[y].jail) {
				document.getElementById("cell" + x + "positionholder").innerHTML += "<div class='cell-position' title='" + player[y].name + "' style='background-color: " + player[y].color + "; left: " + left + "px; top: " + top + "px;'></div>";
				if (left == 36) {
					left = 0;
					top = 12;
				} else
					left += 12;
			}
		}
	}

	left = 0;
	top = 53;
	for (var i = turn; i <= pcount; i++) {
		if (player[i].jail) {
			document.getElementById("jailpositionholder").innerHTML += "<div class='cell-position' title='" + player[i].name + "' style='background-color: " + player[i].color + "; left: " + left + "px; top: " + top + "px;'></div>";

			if (left === 36) {
				left = 0;
				top = 41;
			} else {
				left += 12;
			}
		}
	}

	for (var i = 1; i < turn; i++) {
		if (player[i].jail) {
			document.getElementById("jailpositionholder").innerHTML += "<div class='cell-position' title='" + player[i].name + "' style='background-color: " + player[i].color + "; left: " + left + "px; top: " + top + "px;'></div>";
			if (left === 36) {
				left = 0;
				top = 41;
			} else
				left += 12;
		}
	}

	var p = player[turn];

	if (p.jail) {
		document.getElementById("jail").style.border = "1px solid " + p.color;
	} else {
		document.getElementById("cell" + p.position).style.border = "1px solid " + p.color;
	}

	// for (var i=1; i <= pcount; i++) {
	// document.getElementById("enlarge"+player[i].position+"token").innerHTML+="<img src='"+tokenArray[i].src+"' height='30' width='30' />";
	// }
}

function updateMoney() {
	var p = player[turn];

	document.getElementById("pmoney").innerHTML = "⚡₿" + p.money;
	$(".money-bar-row").hide();

	for (var i = 1; i <= pcount; i++) {
		var p_i = player[i];

		$("#moneybarrow" + i).show();
		document.getElementById("p" + i + "moneybar").style.border = "2px solid " + p_i.color;
		document.getElementById("p" + i + "money").innerHTML = p_i.money;
		document.getElementById("p" + i + "moneyname").innerHTML = p_i.name;
	}

	if (document.getElementById("landed").innerHTML === "") {
		$("#landed").hide();
	}

	document.getElementById("quickstats").style.borderColor = p.color;

	if (p.money < 0) {
		// document.getElementById("nextbutton").disabled = true;
		$("#resignbutton").show();
		$("#nextbutton").hide();
	} else {
		// document.getElementById("nextbutton").disabled = false;
		$("#resignbutton").hide();
		$("#nextbutton").show();
	}
	
	// --- VISUAL LOCK FOR P2P ---
        if (window.nostrManager && window.nostrManager.gameId) {
            var myIndex = window.MY_PLAYER_INDEX || 1;
            var isMyTurn = (turn === myIndex);
            var landedBox = document.getElementById("landed");
        
            // 1. Lock/Unlock the "Landed" Box (Buy/Pay Buttons)
            if (landedBox) {
                if (!isMyTurn) {
                    $(landedBox).find("input, button")
                        .prop("disabled", true)
                        .css("opacity", "0.5");
                } else {
                    $(landedBox).find("input, button")
                        .prop("disabled", false)
                        .css("opacity", "1.0");
                }
            }

            // 2. Lock/Unlock Menu Tabs (Manage & Trade)
            var manageTab = $("#manage-menu-item a, #manage-menu-item");
            var tradeTab = $("#trade-menu-item a, #trade-menu-item");

            if (!isMyTurn) {
                // DISABLE TABS
                manageTab.css({ "opacity": "0.5", "pointer-events": "none", "cursor": "not-allowed" });
                tradeTab.css({ "opacity": "0.5", "pointer-events": "none", "cursor": "not-allowed" });
            
                manageTab.attr("title", "You can only manage properties on your turn.");
                tradeTab.attr("title", "You can only trade on your turn.");

                // FORCE CLOSE: If they are currently inside a forbidden tab, kick them back to 'Buy'
                if ($("#manage").is(":visible") || $("#trade").is(":visible")) {
                    $("#buy").show();
                    $("#manage").hide();
                    $("#trade").hide();
                }
            } else {
                // ENABLE TABS
                manageTab.css({ "opacity": "1.0", "pointer-events": "auto", "cursor": "pointer" });
                tradeTab.css({ "opacity": "1.0", "pointer-events": "auto", "cursor": "pointer" });
            
                manageTab.attr("title", "View, mortgage, and improve your property.");
                tradeTab.attr("title", "Exchange property with other players.");
            }
        }
    
}

function updateDice() {
	var die0 = game.getDie(1);
	var die1 = game.getDie(2);

	$("#die0").show();
	$("#die1").show();

	if (document.images) {
		var element0 = document.getElementById("die0");
		var element1 = document.getElementById("die1");

		element0.classList.remove("die-no-img");
		element1.classList.remove("die-no-img");

		element0.title = "Die (" + die0 + " spots)";
		element1.title = "Die (" + die1 + " spots)";

		if (element0.firstChild) {
			element0 = element0.firstChild;
		} else {
			element0 = element0.appendChild(document.createElement("img"));
		}

		element0.src = "/images/Die_" + die0 + ".png";
		element0.alt = die0;

		if (element1.firstChild) {
			element1 = element1.firstChild;
		} else {
			element1 = element1.appendChild(document.createElement("img"));
		}

		element1.src = "/images/Die_" + die1 + ".png";
		element1.alt = die0;
	} else {
		document.getElementById("die0").textContent = die0;
		document.getElementById("die1").textContent = die1;

		document.getElementById("die0").title = "Die";
		document.getElementById("die1").title = "Die";
	}
}

function updateOwned() {
	var p = player[turn];
	var checkedproperty = getCheckedProperty();
	$("#option").show();
	$("#owned").show();

	var HTML = "",
	firstproperty = -1;

	var mortgagetext = "",
	housetext = "";
	var sq;

	for (var i = 0; i < 40; i++) {
		sq = square[i];
		if (sq.groupNumber && sq.owner === 0) {
			$("#cell" + i + "owner").hide();
		} else if (sq.groupNumber && sq.owner > 0) {
			var currentCellOwner = document.getElementById("cell" + i + "owner");

			currentCellOwner.style.display = "block";
			currentCellOwner.style.backgroundColor = player[sq.owner].color;
			currentCellOwner.title = player[sq.owner].name;
		}
	}

	for (var i = 0; i < 40; i++) {
		sq = square[i];
		if (sq.owner == turn) {

			mortgagetext = "";
			if (sq.mortgage) {
				mortgagetext = "title='Mortgaged' style='color: grey;'";
			}

			housetext = "";
			if (sq.house >= 1 && sq.house <= 4) {
				for (var x = 1; x <= sq.house; x++) {
					housetext += "<img src='/images/house.png' alt='' title='House' class='house' />";
				}
			} else if (sq.hotel) {
				housetext += "<img src='/images/hotel.png' alt='' title='Hotel' class='hotel' />";
			}

			if (HTML === "") {
				HTML += "<table>";
				firstproperty = i;
			}

			HTML += "<tr class='property-cell-row'><td class='propertycellcheckbox'><input type='checkbox' id='propertycheckbox" + i + "' /></td><td class='propertycellcolor' style='background: " + sq.color + ";";

			if (sq.groupNumber == 1 || sq.groupNumber == 2) {
				HTML += " border: 1px solid grey; width: 18px;";
			}

			HTML += "' onmouseover='showdeed(" + i + ");' onmouseout='hidedeed();'></td><td class='propertycellname' " + mortgagetext + ">" + sq.name + housetext + "</td></tr>";
		}
	}

	if (p.communityChestJailCard) {
		if (HTML === "") {
			firstproperty = 40;
			HTML += "<table>";
		}
		HTML += "<tr class='property-cell-row'><td class='propertycellcheckbox'><input type='checkbox' id='propertycheckbox40' /></td><td class='propertycellcolor' style='background: white;'></td><td class='propertycellname'>Get Out of Jail Free Card</td></tr>";

	}
	if (p.chanceJailCard) {
		if (HTML === "") {
			firstproperty = 41;
			HTML += "<table>";
		}
		HTML += "<tr class='property-cell-row'><td class='propertycellcheckbox'><input type='checkbox' id='propertycheckbox41' /></td><td class='propertycellcolor' style='background: white;'></td><td class='propertycellname'>Get Out of Jail Free Card</td></tr>";
	}

	if (HTML === "") {
		HTML = p.name + ", you don't have any properties.";
		$("#option").hide();
	} else {
		HTML += "</table>";
	}

	document.getElementById("owned").innerHTML = HTML;

	// Select previously selected property.
	if (checkedproperty > -1 && document.getElementById("propertycheckbox" + checkedproperty)) {
		document.getElementById("propertycheckbox" + checkedproperty).checked = true;
	} else if (firstproperty > -1) {
		document.getElementById("propertycheckbox" + firstproperty).checked = true;
	}
	$(".property-cell-row").click(function() {
		var row = this;

		// Toggle check the current checkbox.
		$(this).find(".propertycellcheckbox > input").prop("checked", function(index, val) {
			return !val;
		});

		// Set all other checkboxes to false.
		$(".propertycellcheckbox > input").prop("checked", function(index, val) {
			if (!$.contains(row, this)) {
				return false;
			}
		});

		updateOption();
	});
	updateOption();
}

function updateOption() {
	$("#option").show();

	var allGroupUninproved = true;
	var allGroupUnmortgaged = true;
	var checkedproperty = getCheckedProperty();

	if (checkedproperty < 0 || checkedproperty >= 40) {
		$("#buyhousebutton").hide();
		$("#sellhousebutton").hide();
		$("#mortgagebutton").hide();


		var housesum = 32;
		var hotelsum = 12;

		for (var i = 0; i < 40; i++) {
			var s = square[i]; 
			if (s.hotel == 1)
				hotelsum--;
			else
				housesum -= s.house;
		}

		$("#buildings").show();
		document.getElementById("buildings").innerHTML = "<img src='/images/house.png' alt='' title='House' class='house' />:&nbsp;" + housesum + "&nbsp;&nbsp;<img src='/images/hotel.png' alt='' title='Hotel' class='hotel' />:&nbsp;" + hotelsum;

		return;
	}

	$("#buildings").hide();
	var sq = square[checkedproperty];

	var buyhousebutton = document.getElementById("buyhousebutton");
	var sellhousebutton = document.getElementById("sellhousebutton");

	$("#mortgagebutton").show();
	document.getElementById("mortgagebutton").disabled = false;

	if (sq.mortgage) {
		document.getElementById("mortgagebutton").value = "Unmortgage (⚡₿" + Math.round(sq.price * 0.55) + ")";
		document.getElementById("mortgagebutton").title = "Unmortgage " + sq.name + " for ⚡₿" + Math.round(sq.price * 0.55) + ".";
		$("#buyhousebutton").hide();
		$("#sellhousebutton").hide();

		allGroupUnmortgaged = false;
	} else {
		document.getElementById("mortgagebutton").value = "Mortgage (⚡₿" + Math.round(sq.price * 0.5) + ")";
		document.getElementById("mortgagebutton").title = "Mortgage " + sq.name + " for ⚡₿" + Math.round(sq.price * 0.5) + ".";

		if (sq.groupNumber >= 3) {
			$("#buyhousebutton").show();
			$("#sellhousebutton").show();
			buyhousebutton.disabled = false;
			sellhousebutton.disabled = false;

			buyhousebutton.value = "Buy house (⚡₿" + sq.houseprice + ")";
			sellhousebutton.value = "Sell house (⚡₿" + Math.round(sq.houseprice * 0.5) + ")";
			buyhousebutton.title = "Buy a house for ⚡₿" + sq.houseprice;
			sellhousebutton.title = "Sell a house for ⚡₿" + Math.round(sq.houseprice * 0.5);

			if (sq.house == 4) {
				buyhousebutton.value = "Buy hotel (⚡₿" + sq.houseprice + ")";
				buyhousebutton.title = "Buy a hotel for ⚡₿" + sq.houseprice;
			}
			if (sq.hotel == 1) {
				$("#buyhousebutton").hide();
				sellhousebutton.value = "Sell hotel (⚡₿" + Math.round(sq.houseprice * 0.5) + ")";
				sellhousebutton.title = "Sell a hotel for ⚡₿" + Math.round(sq.houseprice * 0.5);
			}

			var maxhouse = 0;
			var minhouse = 5;

			for (var j = 0; j < max; j++) {

				if (square[currentSquare.group[j]].house > 0) {
					allGroupUninproved = false;
					break;
				}
			}

			var max = sq.group.length;
			for (var i = 0; i < max; i++) {
				var s = square[sq.group[i]];

				if (s.owner !== sq.owner) {
					buyhousebutton.disabled = true;
					sellhousebutton.disabled = true;
					buyhousebutton.title = "Before you can buy a house, you must own all the properties of this color-group.";
				} else {

					if (s.house > maxhouse) {
						maxhouse = s.house;
					}

					if (s.house < minhouse) {
						minhouse = s.house;
					}

					if (s.house > 0) {
						allGroupUninproved = false;
					}

					if (s.mortgage) {
						allGroupUnmortgaged = false;
					}
				}
			}

			if (!allGroupUnmortgaged) {
				buyhousebutton.disabled = true;
				buyhousebutton.title = "Before you can buy a house, you must unmortgage all the properties of this color-group.";
			}

			// Force even building
			if (sq.house > minhouse) {
				buyhousebutton.disabled = true;

				if (sq.house == 1) {
					buyhousebutton.title = "Before you can buy another house, the other properties of this color-group must all have one house.";
				} else if (sq.house == 4) {
					buyhousebutton.title = "Before you can buy a hotel, the other properties of this color-group must all have 4 houses.";
				} else {
					buyhousebutton.title = "Before you can buy a house, the other properties of this color-group must all have " + sq.house + " houses.";
				}
			}
			if (sq.house < maxhouse) {
				sellhousebutton.disabled = true;

				if (sq.house == 1) {
					sellhousebutton.title = "Before you can sell house, the other properties of this color-group must all have one house.";
				} else {
					sellhousebutton.title = "Before you can sell a house, the other properties of this color-group must all have " + sq.house + " houses.";
				}
			}

			if (sq.house === 0 && sq.hotel === 0) {
				$("#sellhousebutton").hide();

			} else {
				$("#mortgagebutton").hide();

			}

			// Before a property can be mortgaged or sold, all the properties of its color-group must unimproved.
			if (!allGroupUninproved) {
				document.getElementById("mortgagebutton").title = "Before a property can be mortgaged, all the properties of its color-group must unimproved.";
				document.getElementById("mortgagebutton").disabled = true;
			}

		} else {
			$("#buyhousebutton").hide();
			$("#sellhousebutton").hide();
		}
	}
}

function chanceCommunityChest() {
	var p = player[turn];

	// --- COMMUNITY CHEST ---
	if (p.position === 2 || p.position === 17 || p.position === 33) {
		var communityChestIndex = communityChestCards.deck[communityChestCards.index];

		// Remove "Get Out of Jail Free" from deck
		if (communityChestIndex === 0) {
			communityChestCards.deck.splice(communityChestCards.index, 1);
		}

		// Prepare the logic to run the card
		var runCard = function() {
			communityChestAction(communityChestIndex);
		};

		// Increment deck index
		communityChestCards.index++;
		if (communityChestCards.index >= communityChestCards.deck.length) {
			communityChestCards.index = 0;
		}

		// VISUALS:
		var msg = "<img src='/images/community_chest_icon.png' style='height: 50px; width: 53px; float: left; margin: 8px 8px 8px 0px;' /><div style='font-weight: bold; font-size: 16px; '>Community Chest:</div><div style='text-align: justify;'>" + communityChestCards[communityChestIndex].text + "</div>";

		if (p.human) {
		// FIX: If P2P Game, show immediately. If Local Game, add delay for UX.
            	var delay = (window.nostrManager && window.nostrManager.gameId) ? 0 : 800;
		
			setTimeout(function() {
			    popup(msg, runCard);
            }, delay);
		} else {
			// AI: Show the popup for X ms so the human can read it, then run the card
			popup(msg); // Show it (no callback yet)
			setTimeout(function() {
				$("#popupbackground").fadeOut(400);
				$("#popupwrap").hide();
				runCard(); // Execute Logic
			}, 4000);
		}

	// --- CHANCE ---
	} else if (p.position === 7 || p.position === 22 || p.position === 36) {
		var chanceIndex = chanceCards.deck[chanceCards.index];

		// Remove "Get Out of Jail Free" from deck
		if (chanceIndex === 0) {
			chanceCards.deck.splice(chanceCards.index, 1);
		}

		// Prepare logic
		var runCard = function() {
			chanceAction(chanceIndex);
		};

		// Increment deck index
		chanceCards.index++;
		if (chanceCards.index >= chanceCards.deck.length) {
			chanceCards.index = 0;
		}

		// VISUALS:
		var msg = "<img src='/images/chance_icon.png' style='height: 50px; width: 26px; float: left; margin: 8px 8px 8px 0px;' /><div style='font-weight: bold; font-size: 16px; '>Chance:</div><div style='text-align: justify;'>" + chanceCards[chanceIndex].text + "</div>";

		if (p.human) {
		// FIX: If P2P Game, show immediately. If Local Game, add delay for UX.
            	var delay = (window.nostrManager && window.nostrManager.gameId) ? 0 : 800;
		
			setTimeout(function() {
			    popup(msg, runCard);
            }, delay);
		} else {
			// AI: Show popup for X ms, then run
			popup(msg);
			setTimeout(function() {
				$("#popupbackground").fadeOut(400);
				$("#popupwrap").hide();
				runCard();
			}, 4000);
		}

	// --- NEITHER (Just End Turn) ---
	} else {
		if (!p.human) {
			p.AI.alertList = "";
			if (!p.AI.onLand()) {
				game.next();
			}
		}
	}
}

function chanceAction(chanceIndex) {
	var p = player[turn]; // This is needed for reference in action() method.

	// $('#popupbackground').hide();
	// $('#popupwrap').hide();
	chanceCards[chanceIndex].action(p);

	updateMoney();

	if (chanceIndex !== 15 && !p.human) {
        // FIX: Show the full summary (Landed + Card Effect) now
        if (p.AI.alertList !== "") {
            setTimeout(function() {
                popup(p.AI.alertList, game.next);
                p.AI.alertList = "";
            }, 1000);} else {
		    setTimeout(game.next, 1000);
        }
	}
}

function communityChestAction(communityChestIndex) {
	var p = player[turn]; // This is needed for reference in action() method.

	// $('#popupbackground').hide();
	// $('#popupwrap').hide();
	communityChestCards[communityChestIndex].action(p);

	updateMoney();

	if (communityChestIndex !== 15 && !p.human) {
        // FIX: Show the full summary (Landed + Card Effect) now
        if (p.AI.alertList !== "") {
            setTimeout(function() {
                popup(p.AI.alertList, game.next);
                p.AI.alertList = "";
            }, 1000);
        } else {
		    setTimeout(game.next, 1000);
        }
	}
}

function addamount(amount, cause) {
	var p = player[turn];

	p.money += amount;

	addAlert(p.name + " received ⚡₿" + amount + " from " + cause + ".");
}

function subtractamount(amount, cause) {
	var p = player[turn];

	p.pay(amount, 0);

	addAlert(p.name + " lost ⚡₿" + amount + " from " + cause + ".");
}

function gotojail() {
	var p = player[turn];
	addAlert(p.name + " was sent directly to jail.");
	document.getElementById("landed").innerHTML = "You are in jail.";

	p.jail = true;
	doublecount = 0;

	document.getElementById("nextbutton").value = "End turn";
	document.getElementById("nextbutton").title = "End turn and advance to the next player.";

	if (p.human) {
		document.getElementById("nextbutton").focus();
	}

	updatePosition(); // This moves the token HTML to the #jail div
	updateOwned();

    // FIX: Force camera to find the NEW location (The Jail Cell)
    // Since p.jail is now true, centerOnPlayer will look for #jail, not #cell30
    if (window.centerOnPlayer) {
        // Tiny timeout to ensure the DOM has updated the token position
        setTimeout(function() { 
            window.centerOnPlayer(); 
        }, 50);
    }

	if (!p.human) {
		popup(p.AI.alertList, game.next);
		p.AI.alertList = "";
	}
}

function gobackthreespaces() {
	var p = player[turn];

	p.position -= 3;

	land();
}

function payeachplayer(amount, cause) {
	var p = player[turn];
	var total = 0;

	for (var i = 1; i <= pcount; i++) {
		if (i != turn) {
			player[i].money += amount;
			total += amount;
			var creditor = p.money >= 0 ? i : creditor; 

			p.pay(amount, creditor);
		}
	}

	addAlert(p.name + " lost ⚡₿" + total + " from " + cause + ".");
}

function collectfromeachplayer(amount, cause) {
	var p = player[turn];
	var total = 0;

	for (var i = 1; i <= pcount; i++) {
		if (i != turn) {
			var money = player[i].money; 
			if (money < amount) {
				p.money += money;
				total += money;
				player[i].money = 0;
			} else {
				player[i].pay(amount, turn);
				p.money += amount;
				total += amount;
			}
		}
	}

	addAlert(p.name + " received ⚡₿" + total + " from " + cause + ".");
}

function advance(destination, pass) {
	var p = player[turn];

	if (typeof pass === "number") {
		if (p.position < pass) {
			p.position = pass;
		} else {
			p.position = pass;
			p.money += Math.round(200 * GAME_SCALE);
			addAlert(p.name + " collected a ⚡₿" + Math.round(200 * GAME_SCALE) + " salary for passing GO.");
		}
	}
	if (p.position < destination) {
		p.position = destination;
	} else {
		p.position = destination;
		p.money += Math.round(200 * GAME_SCALE);
		addAlert(p.name + " collected a ⚡₿" + Math.round(200 * GAME_SCALE) + " salary for passing GO.");
	}

	land(false, true);
	
	if (window.centerOnPlayer) {
        setTimeout(window.centerOnPlayer, 50);}
}

function advanceToNearestUtility() {
	var p = player[turn];

	if (p.position < 12) {
		p.position = 12;
	} else if (p.position >= 12 && p.position < 28) {
		p.position = 28;
	} else if (p.position >= 28) {
		p.position = 12;
		p.money += Math.round(200 * GAME_SCALE);
		addAlert(p.name + " collected a ⚡₿" + Math.round(200 * GAME_SCALE) + " salary for passing GO.");
	}

	land(true, true);
}

function advanceToNearestRailroad() {
	var p = player[turn];

	updatePosition();

	if (p.position < 15) {
		p.position = 15;
	} else if (p.position >= 15 && p.position < 25) {
		p.position = 25;
	} else if (p.position >= 35) {
		p.position = 5;
		p.money += Math.round(200 * GAME_SCALE);
		addAlert(p.name + " collected a ⚡₿" + Math.round(200 * GAME_SCALE) + " salary for passing GO.");
	}

	land(true, true);
}

function streetrepairs(houseprice, hotelprice) {
	var cost = 0;
	for (var i = 0; i < 40; i++) {
		var s = square[i];
		if (s.owner == turn) {
			if (s.hotel == 1)
				cost += hotelprice;
			else
				cost += s.house * houseprice;
		}
	}

	var p = player[turn];

	if (cost > 0) {
		p.pay(cost, 0);

		// If function was called by Community Chest.
		if (houseprice === 40) {
			addAlert(p.name + " lost ⚡₿" + cost + " to Community Chest.");
		} else {
			addAlert(p.name + " lost ⚡₿" + cost + " to Chance.");
		}
	}

}

function payfifty() {
        var myIndex = window.MY_PLAYER_INDEX || 1;
        
        // P2P GUARD:
        if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
            if (turn !== myIndex) return; 

            if (myIndex !== 1) {
                window.nostrManager.sendAction('PAY_FINE');
                return;
            }
        }
        
	var p = player[turn];
	var fine = Math.round(50 * GAME_SCALE);

	document.getElementById("jail").style.border = '1px solid black';
	document.getElementById("cell11").style.border = '2px solid ' + p.color;

	$("#landed").hide();
	doublecount = 0;

	p.jail = false;
	p.jailroll = 0;
	p.position = 10;
	p.pay(fine, 0);

	addAlert(p.name + " paid the ⚡₿" + fine + " fine to get out of jail.");
	updateMoney();
	updatePosition();
}

function useJailCard() {
	var myIndex = window.MY_PLAYER_INDEX || 1;

        // P2P GUARD:
        if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
            if (turn !== myIndex) return; 

            if (myIndex !== 1) {
                window.nostrManager.sendAction('USE_CARD');
                return;
            }
        }
        
	var p = player[turn];

	document.getElementById("jail").style.border = '1px solid black';
	document.getElementById("cell11").style.border = '2px solid ' + p.color;

	$("#landed").hide();
	p.jail = false;
	p.jailroll = 0;

	p.position = 10;

	doublecount = 0;

	if (p.communityChestJailCard) {
		p.communityChestJailCard = false;

		// Insert the get out of jail free card back into the community chest deck.
		communityChestCards.deck.splice(communityChestCards.index, 0, 0);

		communityChestCards.index++;

		if (communityChestCards.index >= communityChestCards.deck.length) {
			communityChestCards.index = 0;
		}
	} else if (p.chanceJailCard) {
		p.chanceJailCard = false;

		// Insert the get out of jail free card back into the chance deck.
		chanceCards.deck.splice(chanceCards.index, 0, 0);

		chanceCards.index++;

		if (chanceCards.index >= chanceCards.deck.length) {
			chanceCards.index = 0;
		}
	}

	addAlert(p.name + " used a \"Get Out of Jail Free\" card.");
	updateOwned();
	updatePosition();
}

function buyHouse(index) {
	// P2P INTERCEPTION
        if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
            var myIndex = window.MY_PLAYER_INDEX || 1;
            if (myIndex !== 1) {
                window.nostrManager.sendAction('BUY_HOUSE', { index: index });
                return false;
            }
        }
	
	var sq = square[index];
	var p = player[sq.owner];
	var houseSum = 0;
	var hotelSum = 0;

	if (p.money - sq.houseprice < 0) {
		if (sq.house == 4) {
			return false;
		} else {
			return false;
		}

	} else {
		for (var i = 0; i < 40; i++) {
			if (square[i].hotel === 1) {
				hotelSum++;
			} else {
				houseSum += square[i].house;
			}
		}

		if (sq.house < 4) {
			if (houseSum >= 32) {
				return false;

			} else {
				sq.house++;
				addAlert(p.name + " placed a house on " + sq.name + ".");
			}

		} else {
			if (hotelSum >= 12) {
				return;

			} else {
				sq.house = 5;
				sq.hotel = 1;
				addAlert(p.name + " placed a hotel on " + sq.name + ".");
			}
		}

		p.pay(sq.houseprice, 0);

		updateOwned();
		updateMoney();
	}
}

function sellHouse(index) {
	// P2P INTERCEPTION
        if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
            var myIndex = window.MY_PLAYER_INDEX || 1;
            if (myIndex !== 1) {
                window.nostrManager.sendAction('SELL_HOUSE', { index: index });
                return;
            }
        }
	
	var sq = square[index];
	var p = player[sq.owner];

	if (sq.hotel === 1) {
		sq.hotel = 0;
		sq.house = 4;
		addAlert(p.name + " sold the hotel on " + sq.name + ".");
	} else {
		sq.house--;
		addAlert(p.name + " sold a house on " + sq.name + ".");
	}

	p.money += Math.round(sq.houseprice * 0.5); 
	updateOwned();
	updateMoney();
}

function showStats() {
	var HTML, sq, p;
	var mortgagetext,
	housetext;
	var write;
	HTML = "<table align='center'><tr>";

	for (var x = 1; x <= pcount; x++) {
		write = false;
		p = player[x];
		if (x == 5) {
			HTML += "</tr><tr>";
		}
		HTML += "<td class='statscell' id='statscell" + x + "' style='border: 2px solid " + p.color + "' ><div class='statsplayername'>" + p.name + "</div>";

		for (var i = 0; i < 40; i++) {
			sq = square[i];

			if (sq.owner == x) {
				mortgagetext = "",
				housetext = "";

				if (sq.mortgage) {
					mortgagetext = "title='Mortgaged' style='color: grey;'";
				}

				if (!write) {
					write = true;
					HTML += "<table>";
				}

				if (sq.house == 5) {
					housetext += "<span style='float: right; font-weight: bold;'>1&nbsp;x&nbsp;<img src='/images/hotel.png' alt='' title='Hotel' class='hotel' style='float: none;' /></span>";
				} else if (sq.house > 0 && sq.house < 5) {
					housetext += "<span style='float: right; font-weight: bold;'>" + sq.house + "&nbsp;x&nbsp;<img src='/images/house.png' alt='' title='House' class='house' style='float: none;' /></span>";
				}

				HTML += "<tr><td class='statscellcolor' style='background: " + sq.color + ";";

				if (sq.groupNumber == 1 || sq.groupNumber == 2) {
					HTML += " border: 1px solid grey;";
				}

				HTML += "' onmouseover='showdeed(" + i + ");' onmouseout='hidedeed();'></td><td class='statscellname' " + mortgagetext + ">" + sq.name + housetext + "</td></tr>";
			}
		}

		if (p.communityChestJailCard) {
			if (!write) {
				write = true;
				HTML += "<table>";
			}
			HTML += "<tr><td class='statscellcolor'></td><td class='statscellname'>Get Out of Jail Free Card</td></tr>";

		}
		if (p.chanceJailCard) {
			if (!write) {
				write = true;
				HTML += "<table>";
			}
			HTML += "<tr><td class='statscellcolor'></td><td class='statscellname'>Get Out of Jail Free Card</td></tr>";

		}

		if (!write) {
			HTML += p.name + " dosen't have any properties.";
		} else {
			HTML += "</table>";
		}

		HTML += "</td>";
	}
	HTML += "</tr></table><div id='titledeed'></div>";

	document.getElementById("statstext").innerHTML = HTML;
	// Show using animation.
	$("#statsbackground").fadeIn(400, function() {
		$("#statswrap").show();
	});
}

function showdeed(property) {
	var sq = square[property];
	$("#deed").show();

	$("#deed-normal").hide();
	$("#deed-mortgaged").hide();
	$("#deed-special").hide();

    // FIX: Pre-calculate the rounded mortgage value
    var mortgageVal = Math.round(sq.price * 0.5);

	if (sq.mortgage) {
		$("#deed-mortgaged").show();
		document.getElementById("deed-mortgaged-name").textContent = sq.name;
        // FIX: Use rounded value
		document.getElementById("deed-mortgaged-mortgage").textContent = mortgageVal;

	} else {

		if (sq.groupNumber >= 3) {
			$("#deed-normal").show();
			document.getElementById("deed-header").style.backgroundColor = sq.color;
			document.getElementById("deed-name").textContent = sq.name;
			document.getElementById("deed-baserent").textContent = sq.baserent;
			document.getElementById("deed-rent1").textContent = sq.rent1;
			document.getElementById("deed-rent2").textContent = sq.rent2;
			document.getElementById("deed-rent3").textContent = sq.rent3;
			document.getElementById("deed-rent4").textContent = sq.rent4;
			document.getElementById("deed-rent5").textContent = sq.rent5;
            // FIX: Use rounded value
			document.getElementById("deed-mortgage").textContent = mortgageVal;
			document.getElementById("deed-houseprice").textContent = sq.houseprice;
			document.getElementById("deed-hotelprice").textContent = sq.houseprice;

		} else if (sq.groupNumber == 2) {
			$("#deed-special").show();
			document.getElementById("deed-special-name").textContent = sq.name;
			document.getElementById("deed-special-text").innerHTML = utiltext();
            // FIX: Use rounded value
			document.getElementById("deed-special-mortgage").textContent = mortgageVal;

		} else if (sq.groupNumber == 1) {
			$("#deed-special").show();
			document.getElementById("deed-special-name").textContent = sq.name;
			document.getElementById("deed-special-text").innerHTML = transtext();
            // FIX: Use rounded value
			document.getElementById("deed-special-mortgage").textContent = mortgageVal;
		}
	}
}

function hidedeed() {
	$("#deed").hide();
}

function buy() {
	var p = player[turn];
	var property = square[p.position];
	var cost = property.price;
        var myIndex = window.MY_PLAYER_INDEX || 1; // Host is 1
        
        if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
        
        // 1. If it is NOT my turn, do nothing.
        if (turn !== myIndex) {
            console.warn("Ignored click: Not your turn.");
            return; 
        }

        // 2. If I am the Joiner (not Host), send request to Host.
        if (myIndex !== 1) {
            window.nostrManager.sendAction('BUY');
            return;
        }
    }
	

	if (p.money >= cost) {
		p.pay(cost, 0);

		property.owner = turn;
		updateMoney();
		addAlert(p.name + " bought " + property.name + " for " + property.pricetext + ".");

		updateOwned();

		$("#landed").hide();
		broadcastGameState();

	} else {
		popup("<p>" + p.name + ", you need ⚡₿" + (property.price - p.money) + " more to buy " + property.name + ".</p>");
	}
}

function mortgage(index) {
	// P2P INTERCEPTION
        if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
            var myIndex = window.MY_PLAYER_INDEX || 1;
            // Only Joiners need to send actions. Host runs locally.
            if (myIndex !== 1) {
                window.nostrManager.sendAction('MORTGAGE', { index: index });
                return false; // Stop local execution
            }
        }
	
	var sq = square[index];
	var p = player[sq.owner];

	if (sq.house > 0 || sq.hotel > 0 || sq.mortgage) {
		return false;
	}

	var mortgagePrice = Math.round(sq.price * 0.5);
	var unmortgagePrice = Math.round(sq.price * 0.55);

	sq.mortgage = true;
	p.money += mortgagePrice;

	document.getElementById("mortgagebutton").value = "Unmortgage for ⚡₿" + unmortgagePrice;
	document.getElementById("mortgagebutton").title = "Unmortgage " + sq.name + " for ⚡₿" + unmortgagePrice + ".";

	addAlert(p.name + " mortgaged " + sq.name + " for ⚡₿" + mortgagePrice + ".");
	updateOwned();
	updateMoney();

	return true;
}

function unmortgage(index) {
	// P2P INTERCEPTION
        if (!window.isExecutingRemote && window.nostrManager && window.nostrManager.gameId) {
            var myIndex = window.MY_PLAYER_INDEX || 1;
            if (myIndex !== 1) {
                window.nostrManager.sendAction('UNMORTGAGE', { index: index });
                return false;
            }
        }
	
	var sq = square[index];
	var p = player[sq.owner];
	var unmortgagePrice = Math.round(sq.price * 0.55);
	var mortgagePrice = Math.round(sq.price * 0.5);

	if (unmortgagePrice > p.money || !sq.mortgage) {
		return false;
	}

	p.pay(unmortgagePrice, 0);
	sq.mortgage = false;
	document.getElementById("mortgagebutton").value = "Mortgage for ⚡₿" + mortgagePrice;
	document.getElementById("mortgagebutton").title = "Mortgage " + sq.name + " for ⚡₿" + mortgagePrice + ".";

	addAlert(p.name + " unmortgaged " + sq.name + " for ⚡₿" + unmortgagePrice + ".");
	updateOwned();
	return true;
}


function land(increasedRent, suppressAI) {
	increasedRent = !!increasedRent; // Cast increasedRent to a boolean value. It is used for the ADVANCE TO THE NEAREST RAILROAD/UTILITY Chance cards.
	suppressAI = !!suppressAI;       // Cast to boolean
	
	var p = player[turn];
	
	centerOnPlayer();
	var s = square[p.position];

	var die1 = game.getDie(1);
	var die2 = game.getDie(2);

	$("#landed").show();
	document.getElementById("landed").innerHTML = "You landed on " + s.name + ".";
	s.landcount++;
	addAlert(p.name + " landed on " + s.name + ".");

	// Allow player to buy the property on which he landed.
	if (s.price !== 0 && s.owner === 0) {

		if (!p.human) {

			if (p.AI.buyProperty(p.position)) {
				buy();
			}
		} else {
			document.getElementById("landed").innerHTML = "<div>You landed on <a href='javascript:void(0);' onmouseover='showdeed(" + p.position + ");' onmouseout='hidedeed();' class='statscellcolor'>" + s.name + "</a>.<input type='button' onclick='buy();' value='Buy (⚡₿" + s.price + ")' title='Buy " + s.name + " for " + s.pricetext + ".'/></div>";
		}


		game.addPropertyToAuctionQueue(p.position);
	}

	// Collect rent
	if (s.owner !== 0 && s.owner != turn && !s.mortgage) {
		var groupowned = true;
		var rent;

		// Railroads
		if (p.position == 5 || p.position == 15 || p.position == 25 || p.position == 35) {
			if (increasedRent) {
				rent = 25 * GAME_SCALE;
			} else {
				rent = 12.5 * GAME_SCALE; 
			}
			
			rent = Math.round(rent);

			if (s.owner == square[5].owner) {
				rent *= 2;
			}
			if (s.owner == square[15].owner) {
				rent *= 2;
			}
			if (s.owner == square[25].owner) {
				rent *= 2;
			}
			if (s.owner == square[35].owner) {
				rent *= 2;
			}

		} else if (p.position === 12) {
			if (increasedRent || square[28].owner == s.owner) {
				rent = (die1 + die2) * Math.round(10 * GAME_SCALE);
			} else {
				rent = (die1 + die2) * Math.round(4 * GAME_SCALE);
			}

		} else if (p.position === 28) {
			if (increasedRent || square[12].owner == s.owner) {
				rent = (die1 + die2) * Math.round(10 * GAME_SCALE);
			} else {
				rent = (die1 + die2) * Math.round(4 * GAME_SCALE);
			}

		} else {

			for (var i = 0; i < 40; i++) {
				var sq = square[i];
				if (sq.groupNumber == s.groupNumber && sq.owner != s.owner) {
					groupowned = false;
				}
			}

			if (!groupowned) {
				rent = s.baserent;
			} else {
				if (s.house === 0) {
					rent = s.baserent * 2;
				} else {
					rent = s["rent" + s.house];
				}
			}
		}

		addAlert(p.name + " paid ⚡₿" + rent + " rent to " + player[s.owner].name + ".");
		p.pay(rent, s.owner);
		player[s.owner].money += rent;

		document.getElementById("landed").innerHTML = "You landed on " + s.name + ". " + player[s.owner].name + " collected ⚡₿" + rent + " rent.";
	} else if (s.owner > 0 && s.owner != turn && s.mortgage) {
		document.getElementById("landed").innerHTML = "You landed on " + s.name + ". Property is mortgaged; no rent was collected.";
	}

	// City Tax
	if (p.position === 4) {
		citytax();
	}

	// Go to jail. Go directly to Jail. Do not pass GO. Do not collect ⚡₿200.
	if (p.position === 30) {
		updateMoney();
		updatePosition();
        
        // 1. Ensure camera looks at Square 30 (Top Right) first
        centerOnPlayer();

		if (p.human) {
            // FIX: Wait x ms BEFORE showing the popup
            // This lets the player see their token sitting on the "Go to Jail" square
            setTimeout(function() {
			    popup("<div>Go to jail. Go directly to Jail. Do not pass GO. Do not collect ⚡₿" + Math.round(200 * GAME_SCALE) + ".</div>", gotojail);
            }, 1500);
		} else {
            // AI: Wait 1.5s, then move
            setTimeout(gotojail, 800);
		}

		return;
	}

	// Luxury Tax
	if (p.position === 38) {
		luxurytax();
	}

	updateMoney();
	updatePosition();
	updateOwned();

	if (!p.human) {
        // FIX: If this landing is part of a card action (e.g. Advance to RR),
        // suppress this internal popup so the Card Action can show the full summary later.
        if (suppressAI) {
            return;
        }

		setTimeout(function() {
            var isChance = (p.position === 7 || p.position === 22 || p.position === 36);
            var isCommChest = (p.position === 2 || p.position === 17 || p.position === 33);

            if (isChance || isCommChest) {
                chanceCommunityChest();
            } else {
                if (p.AI.alertList !== "") {
                    popup(p.AI.alertList, chanceCommunityChest);
                    p.AI.alertList = "";
                } else {
                    chanceCommunityChest();
                }
            }
		}, 1000);
	} else {
		chanceCommunityChest();
	}
}

function roll() {
	var p = player[turn];

	$("#option").hide();
	$("#buy").show();
	$("#manage").hide();

	if (p.human) {
		document.getElementById("nextbutton").focus();
	}
	document.getElementById("nextbutton").value = "End turn";
	document.getElementById("nextbutton").title = "End turn and advance to the next player.";

	game.rollDice();
	var die1 = game.getDie(1);
	var die2 = game.getDie(2);

	doublecount++;

	if (die1 == die2) {
		addAlert(p.name + " rolled " + (die1 + die2) + " - doubles.");
	} else {
		addAlert(p.name + " rolled " + (die1 + die2) + ".");
	}

	if (die1 == die2 && !p.jail) {
		updateDice(die1, die2);

		if (doublecount < 3) {
			var nextBtn = document.getElementById("nextbutton");
			nextBtn.value = "Roll again";
			nextBtn.title = "You threw doubles. Roll again.";
			
			// FIX: Keep button disabled if AI rolled doubles
			if (!p.human) {
				nextBtn.disabled = true;
				nextBtn.style.opacity = "0.5";
			}

		// If player rolls doubles three times in a row, send him to jail
		} else if (doublecount === 3) {
			p.jail = true;
			doublecount = 0;
			addAlert(p.name + " rolled doubles three times in a row.");
			updateMoney();


			if (p.human) {
				popup("You rolled doubles three times in a row. Go to jail.", gotojail);
			} else {
				gotojail();
			}

			return;
		}
	} else {
		var nextBtn = document.getElementById("nextbutton");
		nextBtn.value = "End turn";
		nextBtn.title = "End turn and advance to the next player.";
		
		// FIX: Keep button disabled if AI just rolled
		if (!p.human) {
			nextBtn.disabled = true;
			nextBtn.style.opacity = "0.5";
		}
		
		doublecount = 0;
	}

	updatePosition();
	updateMoney();
	updateOwned();

	if (p.jail === true) {
		p.jailroll++;

		updateDice(die1, die2);
		if (die1 == die2) {
			document.getElementById("jail").style.border = "1px solid black";
			document.getElementById("cell11").style.border = "2px solid " + p.color;
			$("#landed").hide();

			p.jail = false;
			p.jailroll = 0;
			p.position = 10 + die1 + die2;
			doublecount = 0;

			addAlert(p.name + " rolled doubles to get out of jail.");

			land();
		} else {
			if (p.jailroll === 3) {
				var fine = Math.round(50 * GAME_SCALE);

				if (p.human) {
					popup("<p>You must pay the ⚡₿" + fine + " fine.</p>", function() {
						payfifty();
						player[turn].position=10 + die1 + die2;
						land();
					});
				} else {
					payfifty();
					p.position = 10 + die1 + die2;
					land();
				}
			} else {
				$("#landed").show();
				document.getElementById("landed").innerHTML = "You are in jail.";

				if (!p.human) {
					popup(p.AI.alertList, game.next);
					p.AI.alertList = "";
				}
			}
		}


	} else {
		updateDice(die1, die2);

		// Move player
		p.position += die1 + die2;

		// Collect salary as you pass GO
		if (p.position >= 40) {
			p.position -= 40;
			var salary = Math.round(200 * GAME_SCALE);
			p.money += salary;
			addAlert(p.name + " collected a ⚡₿" + salary + " salary for passing GO.");
		}

		land();
	}
	broadcastGameState();
}

function play() {
	if (game.auction()) {
		return;
	}

	turn++;
	if (turn > pcount) {
		turn -= pcount;
	}
	
	window.turn = turn;

	var p = player[turn];
	game.resetDice();

	document.getElementById("pname").innerHTML = p.name;

	addAlert("It is " + p.name + "'s turn.");

	// Check for bankruptcy.
	p.pay(0, p.creditor);

	$("#landed, #option, #manage").hide();
	$("#board, #control, #moneybar, #viewstats, #buy").show();

	doublecount = 0;
	if (p.human) {
		document.getElementById("nextbutton").focus();
	}
	var nextBtn = document.getElementById("nextbutton");
	var pIndex = p.index; // 1-based index of current player
    	var myIndex = window.MY_PLAYER_INDEX || 1; // Default to 1 if offline/local
    	
    	  // LOGIC: Is this MY turn?
         // It is my turn if:
          // 1. It is a local/AI game (myIndex is undefined or we assume local control)
         // 2. OR the current player matches my designated P2P index
        var isMyTurn = (pIndex === myIndex);
        
        // If I am Host playing against AI, I control both (unless strict AI mode is on)
    	if (!window.nostrManager || !window.nostrManager.gameId) {
        // Offline Mode: Always my turn unless it's AI
        isMyTurn = true;
    	}
	
	if (p.human && isMyTurn) {
		// HUMAN: Enable button, but with a tiny delay to prevent Ghost Clicks
		 // 1. Start disabled
		nextBtn.disabled = true;
		nextBtn.value = "Ready...";
        	nextBtn.style.opacity = "0.5";
        	nextBtn.style.cursor = "wait";

        	// 2. Enable after 500ms
		setTimeout(function() {
		    nextBtn.disabled = false;
		    nextBtn.value = "Roll Dice";
		    nextBtn.style.opacity = "1.0";
		    nextBtn.style.cursor = "pointer";
		    nextBtn.title = "Roll the dice and move your token accordingly.";
		    nextBtn.focus();
		}, 500);
	} else {
		// AI: Disable button and Gray it out
		nextBtn.disabled = true;
		nextBtn.value = p.name + " rolling...";
		nextBtn.style.opacity = "0.5";
		nextBtn.style.cursor = "not-allowed";
		nextBtn.title = "Please wait for " + p.name + " to finish.";
	}

	$("#die0").hide();
	$("#die1").hide();

	if (p.jail) {
		$("#landed").show();
		var fine = Math.round(50 * GAME_SCALE);
		
		// FIX: Determine if buttons should be disabled (AI Turn)
		var btnState = p.human ? "" : "disabled style='opacity: 0.5; cursor: not-allowed;'";

		document.getElementById("landed").innerHTML = "You are in jail.<input type='button' " + btnState + " title='Pay ⚡₿" + fine + " fine to get out of jail immediately.' value='Pay ⚡₿" + fine + " fine' onclick='payfifty();' />";

		if (p.communityChestJailCard || p.chanceJailCard) {
			document.getElementById("landed").innerHTML += "<input type='button' id='gojfbutton' " + btnState + " title='Use &quot;Get Out of Jail Free&quot; card.' onclick='useJailCard();' value='Use Card' />";
		}

		document.getElementById("nextbutton").title = "Roll the dice. If you throw doubles, you will get out of jail.";

		if (p.jailroll === 0)
			addAlert("This is " + p.name + "'s first turn in jail.");
		else if (p.jailroll === 1)
			addAlert("This is " + p.name + "'s second turn in jail.");
		else if (p.jailroll === 2) {
			document.getElementById("landed").innerHTML += "<div>NOTE: If you do not throw doubles after this roll, you <i>must</i> pay the ⚡₿" + fine + " fine.</div>";
			addAlert("This is " + p.name + "'s third turn in jail.");
		}

		if (!p.human && p.AI.postBail()) {
			if (p.communityChestJailCard || p.chanceJailCard) {
				useJailCard();
			} else {
				payfifty();
			}
		}
	}

	updateMoney();
	updatePosition();
	updateOwned();

	$(".money-bar-arrow").hide();
	$("#p" + turn + "arrow").show();

	centerOnPlayer();

	if (!p.human) {
		// AI: Wait X seconds so the user sees the camera move to the bot
		// BEFORE the bot actually rolls the dice.
		setTimeout(function() {
			if (!p.AI.beforeTurn()) {
				game.next();
			}
		}, 1000);
	} else {
        // Human: Focus the "Roll Dice" button
		if (document.getElementById("nextbutton")) {
            document.getElementById("nextbutton").focus();
        }
	}
	broadcastGameState();
}

function setup() {
    // 1. Grab dependencies explicitly
    var $ = window.jQuery || window.$;
    var AITest = window.AITest;
    
    // FIX: Declare 'p' and 'playerArray' here so they exist for both branches
    var p; 
    var playerArray;

    if (window.GAME_SCALE) {
        GAME_SCALE = window.GAME_SCALE;
    }

    if (!$) {
        alert("Error: jQuery not loaded.");
        return;
    }

    // ============================================================
    // BRANCH: P2P MULTIPLAYER SETUP
    // ============================================================
    if (window.nostrManager && window.nostrManager.gameId && window.connectedPlayers && window.connectedPlayers.length > 0) {
        
        // The user might have changed their name/color while waiting in the lobby.
        // We ensure the Host (Index 1) reflects the current HTML input values.
        var p1NameInput = document.getElementById("player1name");
        var p1ColorInput = document.getElementById("player1color");
        
        if (p1NameInput && p1ColorInput) {
            // Find the Host object in the connected list (Index 1)
            var hostEntry = window.connectedPlayers.find(function(p) { return p.index === 1; });
            
            if (hostEntry) {
                hostEntry.name = p1NameInput.value;
                hostEntry.color = p1ColorInput.value.toLowerCase();
                
                // Optional: Broadcast this name change so Joiners see it immediately 
                // in their lobby list before the game board loads.
                if (window.nostrManager) {
                    window.nostrManager.broadcastGameUpdate({ players: window.connectedPlayers }, 'LOBBY_UPDATE');
                }
            }
        }
        
        // 1. Check for Saved Game Data
        var saveKey = 'monopoly_state_' + window.nostrManager.gameId;
        var savedData = localStorage.getItem(saveKey);

        if (savedData) {
            console.log("📂 Found saved game! Checking integrity...");
            try {
                var parsed = JSON.parse(savedData);
                
                // --- INTEGRITY CHECKS ---
                
                // Fix 1: Never allow Turn 0 (The Bank)
                if (!parsed.turn || parsed.turn < 1) {
                    console.warn("⚠️ Corrupt Save: Turn was 0. Fixing to 1.");
                    parsed.turn = 1;
                }
                
                // Fix 2: Ensure Player Array exists
                if (!parsed.players || parsed.players.length < 2) {
                    throw new Error("Corrupt Save: Not enough players.");
                }

                // Fix 3: Ensure Player 1 is not "the bank" (Double check names)
                if (parsed.players[1] && parsed.players[1].name === "the bank") {
                     throw new Error("Corrupt Save: Player 1 is broken.");
                }

                // Restore
                console.log("✅ Save valid. Restoring...");
                window.loadRemoteGameState(parsed);
                
                // Force sync global turn
                window.turn = parsed.turn;
                
                // We are done! Exit setup early.
                return;

            } catch (e) {
                console.error("❌ Save file corrupted. Starting fresh.", e);
                // Delete the bad file so it doesn't happen again
                localStorage.removeItem(saveKey);
                // Fall through to normal fresh setup below...
            }
        }

        // 2. If no saved data, start fresh (Your existing loop)
        
        pcount = window.connectedPlayers.length;
        document.getElementById("playernumber").value = pcount;
        
        if (window.nostrManager.saveGameToHistory) {
            window.nostrManager.saveGameToHistory(window.nostrManager.gameId);
        }        

        for (var i = 0; i < pcount; i++) {
            var lobbyData = window.connectedPlayers[i];
            var pIndex = lobbyData.index; 
            
            p = player[pIndex]; 
            p.name = lobbyData.name;
            p.color = lobbyData.color.toLowerCase();
            p.money = Math.round(1500 * GAME_SCALE);
            p.human = true; 
            p.AI = null;
        }
    } 
    // ============================================================
    // BRANCH: LOCAL / AI SETUP
    // ============================================================
    else {
        pcount = parseInt(document.getElementById("playernumber").value, 10);
        playerArray = new Array(pcount);
        playerArray.randomize(); 

        for (var i = 1; i <= pcount; i++) {
            p = player[playerArray[i - 1]];
            p.money = Math.round(1500 * GAME_SCALE);
            
            var colorInput = document.getElementById("player" + i + "color");
            var nameInput = document.getElementById("player" + i + "name");
            var aiSelect = document.getElementById("player" + i + "ai");

            if (colorInput) p.color = colorInput.value.toLowerCase();
            
            if (aiSelect && aiSelect.value === "0") {
                p.name = nameInput ? nameInput.value : "Player " + i;
                p.human = true;
            } else if (aiSelect && aiSelect.value === "1") {
                p.human = false;
                if (AITest) p.AI = new AITest(p);
            }
        }
    }

    // ... (Common startup code remains the same) ...
	$("#board, #moneybar").show();
	$("#setup").hide();

	if (pcount === 2) {
		document.getElementById("stats").style.width = "454px";
	} else if (pcount === 3) {
		document.getElementById("stats").style.width = "686px";
	}

	document.getElementById("stats").style.top = "0px";
	document.getElementById("stats").style.left = "0px";

	play();
	
	setTimeout(function() {
        if (window.centerOnPlayer) centerOnPlayer();
    }, 100);

    if (window.broadcastGameState) window.broadcastGameState();
}

// function togglecheck(elementid) {
	// element = document.getElementById(elementid);

	// if (window.event.srcElement.id == elementid)
		// return;

	// if (element.checked) {
		// element.checked = false;
	// } else {
		// element.checked = true;
	// }
// }

function getCheckedProperty() {
	for (var i = 0; i < 42; i++) {
		if (document.getElementById("propertycheckbox" + i) && document.getElementById("propertycheckbox" + i).checked) {
			return i;
		}
	}
	return -1; // No property is checked.
}

// function propertycell_onclick(element, num) {
	// togglecheck("propertycheckbox" + num);
	// if (document.getElementById("propertycheckbox" + num).checked) {

		// // Uncheck all other boxes.
		// for (var i = 0; i < 40; i++) {
			// if (i !== num && document.getElementById("propertycheckbox" + i)) {
				// document.getElementById("propertycheckbox" + i).checked = false;
			// }
		// }
	// }

	// updateOption();
// }

function playernumber_onchange() {
	pcount = parseInt(document.getElementById("playernumber").value, 10);

	$(".player-input").hide();

	for (var i = 1; i <= pcount; i++) {
		$("#player" + i + "input").show();
	}
}

function menuitem_onmouseover(element) {
	element.className = "menuitem menuitem_hover";
	return;
}

function menuitem_onmouseout(element) {
	element.className = "menuitem";
	return;
}


function copyToken() {
    const tokenBox = document.getElementById("token-display");
    const copyBtn = document.getElementById("copy-btn");

    // 1. Select the text (Required for the fallback method)
    tokenBox.select();
    tokenBox.setSelectionRange(0, 99999); // For mobile devices

    // 2. Check if the modern Clipboard API is available
    if (navigator.clipboard && window.isSecureContext) {
        // --- MODERN METHOD (HTTPS / Localhost) ---
        navigator.clipboard.writeText(tokenBox.value).then(() => {
            showCopySuccess(copyBtn);
        }).catch(err => {
            console.error("Clipboard API failed, trying fallback...", err);
            fallbackCopyText(copyBtn);
        });
    } else {
        // --- FALLBACK METHOD (HTTP / Local Network) ---
        // This is deprecated but is the ONLY way to copy on insecure connections
        fallbackCopyText(copyBtn);
    }
}

function fallbackCopyText(btn) {
    try {
        // This copies whatever is currently selected (which we did with tokenBox.select())
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess(btn);
        } else {
            alert("Copy failed. Please copy the text manually.");
        }
    } catch (err) {
        console.error('Fallback copy failed', err);
        alert("Browser blocked copying. Please copy manually.");
    }
}

function updateBorderColor(playerNum) {
    const inputDiv = document.getElementById(`player${playerNum}input`);
    const colorSelect = document.getElementById(`player${playerNum}color`);
    
    if (inputDiv && colorSelect) {
        // Get the value (e.g., "Blue") and convert to lowercase for CSS ("blue")
        const color = colorSelect.value.toLowerCase();
        inputDiv.style.borderLeftColor = color;
    }
}

// List of all available colors in your dropdowns
const ALL_COLORS = ['Yellow', 'Blue', 'Red', 'Lime', 'Green', 'Aqua', 'Orange', 'Purple'];

function handleColorChange(playerNum) {
    var changedSelect = document.getElementById("player" + playerNum + "color");
    if (!changedSelect) return;
    
    var newColor = changedSelect.value;

    // 1. Check for conflicts with other players
    for (var i = 1; i <= 8; i++) {
        // Skip the player who just changed their color
        if (i === playerNum) continue;

        var otherSelect = document.getElementById("player" + i + "color");
        
        // SAFETY CHECK: If Player 3-8 doesn't exist in HTML, skip them!
        if (!otherSelect) continue;
        
        // If we found a conflict (another player has the same color)
        if (otherSelect.value === newColor) {
            
            // A. Find out which colors are currently taken by EVERYONE
            var takenColors = new Set();
            for (var j = 1; j <= 8; j++) {
                var el = document.getElementById("player" + j + "color");
                if (el) takenColors.add(el.value);
            }

            // B. Find the first color in the master list that ISN'T taken
            var freeColor = ALL_COLORS.find(function(c) { return !takenColors.has(c); });

            // C. Assign that free color to the OTHER player
            if (freeColor) {
                otherSelect.value = freeColor;
                updateBorderColor(i); 
            }
        }
    }

    // 2. Update the border for the player who actually clicked
    updateBorderColor(playerNum);
}

function showCopySuccess(btn) {
    btn.innerText = "✅ Copied!";
    btn.style.background = "#2E7D32"; // Darker green
    
    // Reset button text after 3 seconds
    setTimeout(() => {
        btn.innerText = "📋 Copy Token";
        btn.style.background = "#4CAF50";
    }, 3000);
}

function initMonopoly() {
    // Ensure jQuery is available
    var $ = window.jQuery || window.$; 

	game = new Game();
    
    // CRITICAL: Expose the new game instance to the window
    window.game = game;

	for (var i = 0; i <= 8; i++) {
		player[i] = new Player("", "");
		player[i].index = i;
	}

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

	AITest.count = 0;

	player[1].human = true;
	player[0].name = "the bank";

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

	$("#playernumber").on("change", playernumber_onchange);
	playernumber_onchange();

	$("#nextbutton").click(game.next);
	$("#noscript").hide();
	$("#setup, #noF5").show();

	var enlargeWrap = document.body.appendChild(document.createElement("div"));

	enlargeWrap.id = "enlarge-wrap";

	var HTML = "";
	for (var i = 0; i < 40; i++) {
		HTML += "<div id='enlarge" + i + "' class='enlarge'>";
		HTML += "<div id='enlarge" + i + "color' class='enlarge-color'></div><br /><div id='enlarge" + i + "name' class='enlarge-name'></div>";
		HTML += "<br /><div id='enlarge" + i + "price' class='enlarge-price'></div>";
		HTML += "<br /><div id='enlarge" + i + "token' class='enlarge-token'></div></div>";
	}

	enlargeWrap.innerHTML = HTML;

	var currentCell;
	var currentCellAnchor;
	var currentCellPositionHolder;
	var currentCellName;
	var currentCellOwner;

	for (var i = 0; i < 40; i++) {
        // --- FIX IS HERE: Added 'var' ---
		var s = square[i]; 

		currentCell = document.getElementById("cell" + i);

		currentCellAnchor = currentCell.appendChild(document.createElement("div"));
		currentCellAnchor.id = "cell" + i + "anchor";
		currentCellAnchor.className = "cell-anchor";

		currentCellPositionHolder = currentCellAnchor.appendChild(document.createElement("div"));
		currentCellPositionHolder.id = "cell" + i + "positionholder";
		currentCellPositionHolder.className = "cell-position-holder";
		currentCellPositionHolder.enlargeId = "enlarge" + i;

		currentCellName = currentCellAnchor.appendChild(document.createElement("div"));
		currentCellName.id = "cell" + i + "name";
		currentCellName.className = "cell-name";
		currentCellName.textContent = s.name;

		if (square[i].groupNumber) {
			currentCellOwner = currentCellAnchor.appendChild(document.createElement("div"));
			currentCellOwner.id = "cell" + i + "owner";
			currentCellOwner.className = "cell-owner";
		}

		document.getElementById("enlarge" + i + "color").style.backgroundColor = s.color;
		document.getElementById("enlarge" + i + "name").textContent = s.name;
		document.getElementById("enlarge" + i + "price").textContent = s.pricetext;
	}


	// Add images to enlarges.
	document.getElementById("enlarge0token").innerHTML += '<img src="/images/arrow_icon.png" height="40" width="136" alt="" />';
	document.getElementById("enlarge20price").innerHTML += "<img src='/images/free_parking_icon.png' height='80' width='72' alt='' style='position: relative; top: -20px;' />";
	document.getElementById("enlarge38token").innerHTML += '<img src="/images/tax_icon.png" height="60" width="70" alt="" style="position: relative; top: -20px;" />';

	corrections();

	// Jail corrections
	$("<div>", {id: "jailpositionholder" }).appendTo("#jail");
	$("<span>").text("Jail").appendTo("#jail");

	document.getElementById("jail").enlargeId = "enlarge40";

	document.getElementById("enlarge-wrap").innerHTML += "<div id='enlarge40' class='enlarge'><div id='enlarge40color' class='enlarge-color'></div><br /><div id='enlarge40name' class='enlarge-name'>Jail</div><br /><div id='enlarge40price' class='enlarge-price'><img src='/images/jake_icon.png' height='80' width='80' alt='' style='position: relative; top: -20px;' /></div><br /><div id='enlarge40token' class='enlarge-token'></div></div>";

	document.getElementById("enlarge40name").innerHTML = "Jail";

	// Create event handlers for hovering and draging.

	var drag, dragX, dragY, dragObj, dragTop, dragLeft;

	$(".cell-position-holder, #jail").on("mouseover", function(){
		$("#" + this.enlargeId).show();

	}).on("mouseout", function() {
		$("#" + this.enlargeId).hide();

	}).on("mousemove", function(e) {
		var element = document.getElementById(this.enlargeId);

		if (e.clientY + 20 > window.innerHeight - 204) {
			element.style.top = (window.innerHeight - 204) + "px";
		} else {
			element.style.top = (e.clientY + 20) + "px";
		}

		element.style.left = (e.clientX + 10) + "px";
	});


	$("body").on("mousemove", function(e) {
		var object;

		if (e.target) {
			object = e.target;
		} else if (window.event && window.event.srcElement) {
			object = window.event.srcElement;
		}


		if (object.classList.contains("propertycellcolor") || object.classList.contains("statscellcolor")) {
			if (e.clientY + 20 > window.innerHeight - 279) {
				document.getElementById("deed").style.top = (window.innerHeight - 279) + "px";
			} else {
				document.getElementById("deed").style.top = (e.clientY + 20) + "px";
			}
			document.getElementById("deed").style.left = (e.clientX + 10) + "px";


		} else if (drag) {
			if (e) {
				dragObj.style.left = (dragLeft + e.clientX - dragX) + "px";
				dragObj.style.top = (dragTop + e.clientY - dragY) + "px";

			} else if (window.event) {
				dragObj.style.left = (dragLeft + window.event.clientX - dragX) + "px";
				dragObj.style.top = (dragTop + window.event.clientY - dragY) + "px";
			}
		}
	});


	$("body").on("mouseup", function() {

		drag = false;
	});
	document.getElementById("statsdrag").onmousedown = function(e) {
		dragObj = document.getElementById("stats");
		dragObj.style.position = "relative";

		dragTop = parseInt(dragObj.style.top, 10) || 0;
		dragLeft = parseInt(dragObj.style.left, 10) || 0;

		if (window.event) {
			dragX = window.event.clientX;
			dragY = window.event.clientY;
		} else if (e) {
			dragX = e.clientX;
			dragY = e.clientY;
		}

		drag = true;
	};

	document.getElementById("popupdrag").onmousedown = function(e) {
		dragObj = document.getElementById("popup");
		dragObj.style.position = "relative";

		dragTop = parseInt(dragObj.style.top, 10) || 0;
		dragLeft = parseInt(dragObj.style.left, 10) || 0;

		if (window.event) {
			dragX = window.event.clientX;
			dragY = window.event.clientY;
		} else if (e) {
			dragX = e.clientX;
			dragY = e.clientY;
		}

		drag = true;
	};

	$("#mortgagebutton").click(function() {
		var checkedProperty = getCheckedProperty();
		var s = square[checkedProperty];

		if (s.mortgage) {
			if (player[s.owner].money < Math.round(s.price * 0.55)) {
				popup("<p>You need ⚡₿" + (Math.round(s.price * 0.55) - player[s.owner].money) + " more to unmortgage " + s.name + ".</p>");

			} else {
				popup("<p>" + player[s.owner].name + ", are you sure you want to unmortgage " + s.name + " for ⚡₿" + Math.round(s.price * 0.55) + "?</p>", function() {
					unmortgage(checkedProperty);
				}, "Yes/No");
			}
		} else {
			popup("<p>" + player[s.owner].name + ", are you sure you want to mortgage " + s.name + " for ⚡₿" + Math.round(s.price * 0.5) + "?</p>", function() {
				mortgage(checkedProperty);
			}, "Yes/No");
		}

	});

	$("#buyhousebutton").on("click", function() {
		var checkedProperty = getCheckedProperty();
		var s = square[checkedProperty];
		var p = player[s.owner];
		var houseSum = 0;
		var hotelSum = 0;

		if (p.money < s.houseprice) {
			if (s.house === 4) {
				popup("<p>You need ⚡₿" + (s.houseprice - player[s.owner].money) + " more to buy a hotel for " + s.name + ".</p>");
				return;
			} else {
				popup("<p>You need ⚡₿" + (s.houseprice - player[s.owner].money) + " more to buy a house for " + s.name + ".</p>");
				return;
			}
		}

		for (var i = 0; i < 40; i++) {
			if (square[i].hotel === 1) {
				hotelSum++;
			} else {
				houseSum += square[i].house;
			}
		}

		if (s.house < 4 && houseSum >= 32) {
			popup("<p>All 32 houses are owned. You must wait until one becomes available.</p>");
			return;
		} else if (s.house === 4 && hotelSum >= 12) {
			popup("<p>All 12 hotels are owned. You must wait until one becomes available.</p>");
			return;
		}

		buyHouse(checkedProperty);

	});

	$("#sellhousebutton").click(function() { sellHouse(getCheckedProperty()); });

	$("#viewstats").on("click", showStats);
	$("#statsclose, #statsbackground").on("click", function() {
		$("#statswrap").hide();
		$("#statsbackground").fadeOut(400);
	});

	$("#buy-menu-item").click(function() {
		$("#buy").show();
		$("#manage").hide();

		// Scroll alerts to bottom.
		$("#alert").scrollTop($("#alert").prop("scrollHeight"));
	});


	$("#manage-menu-item").click(function() {
		$("#manage").show();
		$("#buy").hide();
	});


	$("#trade-menu-item").click(game.trade);
	
	$("#proposetradebutton").click(function() { game.proposeTrade(); });
    	$("#canceltradebutton").click(function() { game.cancelTrade(); });
    	$("#accepttradebutton").click(function() { game.acceptTrade(); });
    	$("#rejecttradebutton").click(function() { game.cancelTrade(); });
    	$("#resignbutton").click(function() { game.resign(); });
    	
    	makeDraggable(document.getElementById("control"));
	makeDraggable(document.getElementById("moneybarwrap"));

    	// --- FIX: Re-bind Trade Input Fields ---
    	// (These ensure you can type numbers in the trade window)
    	var leftMoney = document.getElementById("trade-leftp-money");
    	var rightMoney = document.getElementById("trade-rightp-money");
    
    	if (leftMoney) {
        leftMoney.onkeydown = tradeMoneyOnKeyDown;
        leftMoney.onfocus = tradeMoneyOnFocus;
        leftMoney.onchange = tradeMoneyOnChange;
    	}
    	if (rightMoney) {
        rightMoney.onkeydown = tradeMoneyOnKeyDown;
        rightMoney.onfocus = tradeMoneyOnFocus;
        rightMoney.onchange = tradeMoneyOnChange;
    	}
};

window.initMonopoly = initMonopoly;

// Function to make an element draggable
function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    // --- 1. MOUSE EVENTS (Desktop) ---
    element.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        
        // FIX: Allow interacting with inputs, buttons, and the scrollable alert box
        if (shouldPreventDrag(e.target)) {
            return; // Allow default browser behavior (clicking/scrolling)
        }

        e.preventDefault();
        // Get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // Calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        updateElementPosition();
    }

    // --- 2. TOUCH EVENTS (Mobile) ---
    element.ontouchstart = dragTouchStart;

    function dragTouchStart(e) {
        // FIX: Allow scrolling inside the alert box on mobile
        if (shouldPreventDrag(e.target)) {
            // Do NOT preventDefault here. Let the scroll happen.
            return; 
        }

        const touch = e.touches[0];
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        
        // Use event listeners for touch to prevent conflicts
        document.addEventListener('touchend', closeDragElement, {once: true});
        document.addEventListener('touchmove', elementDragTouch, {passive: false});
    }

    function elementDragTouch(e) {
        // Stop the screen from scrolling while dragging the panel
        if(e.cancelable) { e.preventDefault(); }

        const touch = e.touches[0];
        pos1 = pos3 - touch.clientX;
        pos2 = pos4 - touch.clientY;
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        updateElementPosition();
    }

    // --- HELPER: Identify "No Drag" Zones ---
    function shouldPreventDrag(target) {
        // If we touched the alert box (or text inside it), let it scroll!
        if (target.id === "alert" || $(target).closest("#alert").length > 0) {
            return true;
        }
        
        // If we touched an input, button, or menu link, let it click!
        const tagName = target.tagName.toUpperCase();
        if (tagName === 'INPUT' || tagName === 'BUTTON' || tagName === 'A' || tagName === 'SELECT') {
            return true;
        }
        
        // Also check if inside the trade window inputs
        if ($(target).closest("#trade").length > 0) {
            return true;
        }

        return false;
    }

    // --- SHARED LOGIC ---
    function updateElementPosition() {
        // Set the element's new position:
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
        // Critical: Unset 'right' so it doesn't fight with 'left'
        element.style.right = "auto";
    }

    function closeDragElement() {
        // Stop moving when mouse button/finger is released:
        document.onmouseup = null;
        document.onmousemove = null;
        
        // Clean up touch listeners
        document.removeEventListener('touchmove', elementDragTouch);
        document.removeEventListener('touchend', closeDragElement);
    }
}

function centerOnPlayer() {
    if (!isMobile()) return;

    var p = player[turn];
    var targetId = p.jail ? "jail" : "cell" + p.position;
    autoDodgeControlPanel(p.position);

    var element = document.getElementById(targetId);
    if (!element) return;

    // Get current scroll and target position
    var rect = element.getBoundingClientRect();
    var targetX = window.scrollX + rect.left + rect.width / 2 - window.innerWidth / 2;
    var targetY = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;

    // Smooth scroll manually
    smoothScrollTo(targetX, targetY, 400); // 400ms duration
}

// Smooth scroll helper (works everywhere)
function smoothScrollTo(targetX, targetY, duration = 800) {
    const startX = window.scrollX;
    const startY = window.scrollY;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    const startTime = performance.now();

    function animateScroll(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Use ease-out for natural feel
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        window.scrollTo(
            startX + deltaX * easeProgress,
            startY + deltaY * easeProgress
        );

        if (progress < 1) {
            requestAnimationFrame(animateScroll);
        }
    }

    requestAnimationFrame(animateScroll);
}

window.smoothScrollTo = smoothScrollTo;

// --- FIX: Handle Screen Rotation / Resize ---
window.addEventListener('resize', function() {
    // Wait 100ms for rotation to finish
    setTimeout(function() {
        const control = document.getElementById("control");
        const setupScreen = document.getElementById("setup"); 
        if (!control) return;
        
        if (setupScreen.style.display !== "none") {
            control.style.display = "none";
            return; 
        }

        // Check if we are in Desktop Mode
        if (!isMobile()) {
            // DESKTOP MODE
            // 1. Remove ONLY the positioning/sizing styles we added for mobile
            control.style.position = "";
            control.style.top = "";
            control.style.left = "";
            control.style.bottom = "";
            control.style.right = "";
            control.style.width = "";
            control.style.height = "";
            control.style.zIndex = "";
            control.style.touchAction = "";
            
            // 2. CRITICAL FIX: Do NOT remove 'display'. 
            // If the game logic set 'display: block' or 'display: none', we must respect it.
            // However, if the style is 'display: flex' (from our mobile logic), we might want to let it revert.
            if (control.style.display === 'flex') {
                control.style.display = ''; // Revert to stylesheet or jQuery default
            }
            
            // Safety: If it became hidden but should be visible (game is active), force show it.
            // (You can rely on jQuery if loaded, or check computed style)
            if (window.jQuery && $(control).css('display') === 'none') {
                 $(control).show();
            }
            
        } else {
            // MOBILE MODE
            // 1. Force the Floating Widget layout
            control.style.position = "fixed";
            control.style.display = "flex"; // Ensure it uses Flexbox for mobile layout
            control.style.zIndex = "5000";
            control.style.width = "fit-content";
            control.style.height = "fit-content";
            control.style.touchAction = "none"; // Required for dragging
            
            // 2. Snap to default position IF it has no coordinates
            // (Prevents it from disappearing off-screen if switching views)
            if (!control.style.top && !control.style.bottom) {
                control.style.bottom = "10px";
                control.style.left = "10px";
                control.style.top = "";
                control.style.right = "";
            }
        }
    }, 100);
});

function autoDodgeControlPanel(playerPos) {
    // 1. Only run on Mobile
    if (!isMobile()) return;

    const control = document.getElementById("control");
    if (!control) return;

    // 2. Get screen and panel dimensions
    const panelHeight = control.offsetHeight;
    const windowHeight = window.innerHeight;

    // 3. Determine Player Location on the Board
    // Bottom Row: 0 to 10 (Go, Properties, Jail)
    // Left Row: 11 to 19
    // Top Row: 20 to 30 (Free Parking, Go To Jail)
    // Right Row: 31 to 39
    
    let targetTop;

    // IF Player is on the Bottom Row (0-10) OR in Jail
    // The camera will look at the bottom.
    // -> Move Panel to the TOP.
    if (player[turn].jail || (playerPos >= 0 && playerPos <= 10)) {
        targetTop = 20; // 20px from top
    } 
    // ELSE (Player is Top, Left, or Right)
    // The camera will look Top/Center.
    // -> Move Panel to the BOTTOM.
    else {
        targetTop = windowHeight - panelHeight - 20; // 20px from bottom
    }

    // 4. Animate the Move
    // Enable CSS transition for smooth gliding
    control.style.transition = "top 0.6s cubic-bezier(0.25, 1, 0.5, 1)";
    control.style.top = targetTop + "px";
    
    // Critical: Unset bottom so 'top' takes priority
    control.style.bottom = "auto";

    // 5. Cleanup
    // Remove the transition after movement finishes so manual dragging feels responsive again
    setTimeout(() => {
        control.style.transition = "";
    }, 700);
}

function isMobile() {
    return window.innerWidth <= 1000 || window.innerHeight <= 900;
}


// ==================================================================
// EXPOSE FUNCTIONS TO WINDOW
// Critical for HTML 'onclick' events to work in the Vite environment
// ==================================================================

window.handleColorChange = handleColorChange;
window.updateBorderColor = updateBorderColor;



// 1. Core Game Objects
window.game = game;
window.setup = setup;
window.player = player;
window.square = square;

// 2. Actions (Roll, Buy, Jail)
window.buy = buy;
window.payfifty = payfifty;
window.useJailCard = useJailCard;
window.Trade = Trade;
window.roll = roll; // Sometimes used for debug or AI calls

// 3. Property Management (Mortgages & Houses)
window.mortgage = mortgage;
window.unmortgage = unmortgage;
window.buyHouse = buyHouse;
window.sellHouse = sellHouse;

// 4. UI Helpers (Deeds, Colors, Setup)
window.showdeed = showdeed;
window.hidedeed = hidedeed;
window.playernumber_onchange = playernumber_onchange;
window.handleColorChange = handleColorChange;

// 5. Card Action Helpers (Required for Chance/Community Chest)
window.addamount = addamount;
window.subtractamount = subtractamount;
window.collectfromeachplayer = collectfromeachplayer;
window.payeachplayer = payeachplayer;
window.advance = advance;
window.advanceToNearestUtility = advanceToNearestUtility;
window.advanceToNearestRailroad = advanceToNearestRailroad;
window.streetrepairs = streetrepairs;
window.gotojail = gotojail;
window.gobackthreespaces = gobackthreespaces;

// 6. UI Updates & Alerts
window.updateOwned = updateOwned;
window.addAlert = addAlert;
window.popup = popup; // (Just in case cards use popups)

// 7. Sync State Variables
// We explicitly expose player and turn for classicedition.js to read
window.player = player;
window.turn = turn;

window.loadRemoteGameState = function(remoteState) {
    console.log("📥 Applying Remote State...");

    // 1. Force switch to board view if needed
    if (document.getElementById("setup").style.display !== "none") {
        $("#setup").hide();
        $("#board, #moneybar").show();
    }

    // 2. RE-HYDRATE PLAYERS (Critical Fix)
    // We must rebuild the Player objects to restore their .pay() methods
    if (remoteState.players) {
        player = []; 
        
        for (var i = 0; i < remoteState.players.length; i++) {
            var raw = remoteState.players[i];
            
            // --- FIX START: Self-Heal Name/Color from Lobby ---
            var finalName = raw.name;
            var finalColor = raw.color;

            // If the saved name is generic or color is missing, try to fetch from Lobby
            if (window.connectedPlayers && window.connectedPlayers.length > 0) {
                // Find the lobby member corresponding to this index
                // (Note: connectedPlayers stores 1-based index, loop 'i' is the actual index)
                var lobbyMember = window.connectedPlayers.find(function(p) { return p.index === i; });
                
                if (lobbyMember) {
                    // Prefer Lobby data if Save data looks broken
                    if (!finalName || finalName.indexOf("Player") === 0) {
                        finalName = lobbyMember.name;
                    }
                    if (!finalColor) {
                        finalColor = lobbyMember.color;
                    }
                }
            }
            
            // Create a fresh Player instance (this restores .pay, .AI, etc.)
            var newP = new Player(finalName, finalColor);
            
            // Copy remaining data (money, position, etc.)
            for (var key in raw) {
                if (raw.hasOwnProperty(key) && key !== "name" && key !== "color") {
                    newP[key] = raw[key];
                }
            }
            
            // If it's an AI, we might need to re-attach the AI brain
            if (!raw.human && !newP.AI && window.AITest) {
                 newP.AI = new window.AITest(newP);
            }

            player[i] = newP;
        }
    }

    // 3. Sync other globals
    // We do NOT blindly copy square[] because Square objects might also have logic.
    // Instead, we just update ownership/houses on the existing squares.
    if (remoteState.squares) {
        for (var i = 0; i < 40; i++) {
            var rawSq = remoteState.squares[i];
            var localSq = square[i];
            
            localSq.owner = rawSq.owner;
            localSq.mortgage = rawSq.mortgage;
            localSq.house = rawSq.house;
            localSq.hotel = rawSq.hotel;
            // Add other synced properties if needed
        }
    }

    turn = remoteState.turn;
    pcount = remoteState.pcount || remoteState.players.length - 1; // pcount usually excludes bank (index 0)

    // 4. Refresh UI
    updatePosition();
    updateMoney();
    updateOwned();
    
    // --- FIX: Apply Synced UI HTML ---
    
    // A. Sync Alerts (Logs)
    if (remoteState.alertHTML) {
        var alertBox = document.getElementById("alert");
        // Only update if different to prevent jitter/scroll issues
        if (alertBox.innerHTML !== remoteState.alertHTML) {
            alertBox.innerHTML = remoteState.alertHTML;
            alertBox.scrollTop = alertBox.scrollHeight; 
        }
    }

    // B. Sync "Landed" Box (The Buy Button)
    var landedBox = document.getElementById("landed");
    if (remoteState.landedHTML !== undefined) {
        landedBox.innerHTML = remoteState.landedHTML;
        landedBox.style.display = remoteState.landedVis;
    }
    
     if (player[turn]) {
        var pNameDiv = document.getElementById("pname");
        var pMoneyDiv = document.getElementById("pmoney");
        
        if (pNameDiv) pNameDiv.innerHTML = player[turn].name;
        if (pMoneyDiv) pMoneyDiv.innerHTML = "⚡₿" + player[turn].money;
        
        // Also update the border color of the stats box
        var quickStats = document.getElementById("quickstats");
        if (quickStats) quickStats.style.borderColor = player[turn].color;
    }

    // C. Sync "Roll Dice" Button Text
    var nextBtn = document.getElementById("nextbutton");
    if (remoteState.nextBtnVal) {
        nextBtn.value = remoteState.nextBtnVal;
    }
    
    //D. Apply Dice Visuals
    if (remoteState.diceData) {
        var d0 = document.getElementById("die0");
        var d1 = document.getElementById("die1");
        
        if (d0) {
            d0.innerHTML = remoteState.diceData.d0_html;
            d0.className = remoteState.diceData.d0_class;
            d0.style.display = remoteState.diceData.d0_display;
            d0.title = remoteState.diceData.d0_title;
        }
        
        if (d1) {
            d1.innerHTML = remoteState.diceData.d1_html;
            d1.className = remoteState.diceData.d1_class;
            d1.style.display = remoteState.diceData.d1_display;
            d1.title = remoteState.diceData.d1_title;
        }
    }
    
    // E. Sync Popups (Cards)
    var popupWrap = document.getElementById("popupwrap");
    var popupBg = document.getElementById("popupbackground");
    
    if (remoteState.popupVis !== undefined) {
        // 1. Update Content
        if (remoteState.popupHTML) {
            document.getElementById("popuptext").innerHTML = remoteState.popupHTML;
        }
        
        // 2. Show/Hide
        // Use 'flex' for mobile centering if visible
        if (remoteState.popupVis !== 'none' && window.innerWidth <= 1000) {
            popupWrap.style.display = 'flex';
        } else {
            popupWrap.style.display = remoteState.popupVis;
        }
        popupBg.style.display = remoteState.overlayVis;

        // 3. Wire up the "OK" / "Yes" / "No" buttons
        // The HTML we just injected has <input id='popupclose'> but no listeners.
        // We attach a listener that sends the action to the Host.
        
        var myIndex = window.MY_PLAYER_INDEX || 2;
        var isMyTurn = (turn === myIndex);

        if (isMyTurn && remoteState.popupVis !== 'none') {
            // It's my turn, so I should be able to click OK.
            
            // The Host might have sent them as "disabled" because it wasn't the Host's turn.
            // We must unlock them for the player whose turn it actually is.
            $("#popupclose, #popupyes, #popupno")
                .prop("disabled", false)
                .css("opacity", "1.0")
                .css("cursor", "pointer");
            
            $("#popupclose, #popupyes, #popupno").off("click").on("click", function() {
                // Hide locally immediately for better UX
                $(popupWrap).hide();
                $(popupBg).hide();
                // Tell Host to proceed
                window.nostrManager.sendAction('POPUP_CLOSE');
            });
        } else {
            // Not my turn? Keep them disabled.
            $("#popupclose, #popupyes, #popupno").prop("disabled", true).css("opacity", 0.5);
        }
    }
    
    // F. Auction UI Locking
    if (remoteState.auctionData && remoteState.auctionData.property > -1) {
        // An auction is running
        
        // 1. Update internal game state
        if (game && game.setAuctionState) {
            game.setAuctionState(remoteState.auctionData);
        }
        
        var bidInput = document.getElementById("bid");
        if (bidInput && remoteState.auctionInputVal !== undefined) {
            // We overwrite the value so the Joiner sees the error message generated by the Host
            bidInput.value = remoteState.auctionInputVal;
            bidInput.style.color = remoteState.auctionInputColor;
        }
        
        var myIndex = window.MY_PLAYER_INDEX || 2;
        var currentBidder = remoteState.auctionData.bidder;
        var bidInput = document.getElementById("bid");
        var bidBtns = $("#popuptext").find("input[type='button']"); // Bid, Pass, Exit

        if (currentBidder === myIndex) {
            // My Turn to Bid: Enable
            if(bidInput) bidInput.disabled = false;
            bidBtns.prop("disabled", false).css("opacity", 1.0);
        } else {
            // Not My Turn: Disable
            if(bidInput) bidInput.disabled = true;
            bidBtns.prop("disabled", true).css("opacity", 0.5);
        }
    }
    
    // G. Trade Sync
    if (remoteState.tradeData) {
        // --- ACTIVE TRADE ---
        
        // 1. Reconstruct Object
        var remoteTrade = window.deserializeTrade(remoteState.tradeData);
        
        // 2. Write to DOM
        if (window.writeTrade) {
            window.writeTrade(remoteTrade);
        }
        
        // 3. Show Window / Hide Board
        $("#board").hide();
        $("#control").hide();
        $("#trade").show();
        
        // 4. Manage Buttons
        var myIndex = window.MY_PLAYER_INDEX || 2;
        var initiatorIndex = remoteTrade.getInitiator().index;
        var recipientIndex = remoteTrade.getRecipient().index;

        if (myIndex === recipientIndex) {
            // Recipient: Accept/Reject
            $("#proposetradebutton, #canceltradebutton").hide();
            $("#accepttradebutton").show().prop("disabled", false);
            $("#rejecttradebutton").show().prop("disabled", false);
        } else if (myIndex === initiatorIndex) {
            // Proposer: Cancel only
            $("#proposetradebutton, #accepttradebutton, #rejecttradebutton").hide();
            $("#canceltradebutton").show().prop("disabled", false);
        } else {
            // Spectator
            $("#trade input").prop("disabled", true);
        }

    } else {
        // --- NO TRADE (Game Board Mode) ---
        
        // FIX: Force Close Trade Window
        $("#trade").hide();
        
        // FIX: Force Open Board (Only if we are actually in the game, not lobby)
        var setupDiv = document.getElementById("setup");
        if (setupDiv && setupDiv.style.display === "none") {
            $("#board").show();
            $("#control").show();
        }
        
        // Cleanup global trade reference
        window.currentActiveTrade = null;
    }

    // H. Manage Button States based on "Is it my turn?"
    var myIndex = window.MY_PLAYER_INDEX || 2; // Joiner is usually 2
    var isMyTurn = (turn === myIndex);

    if (isMyTurn) {
        // IT IS MY TURN.
        
        var remoteText = remoteState.nextBtnVal; 

        // 1. Force Enable "Landed" Buttons (Buy/Pay)
        // We must remove the attribute AND reset the inline CSS style sent by the Host
        $(landedBox).find("input, button")
            .prop("disabled", false)
            .css("opacity", "1.0")
            .css("cursor", "pointer");

        // 2. Logic to determine Main Button State
        if (remoteText.indexOf("Waiting") !== -1 || remoteText.indexOf("rolling") !== -1) {
             nextBtn.value = "Roll Dice";
             nextBtn.disabled = false;
             nextBtn.style.opacity = "1.0";
             nextBtn.style.cursor = "pointer";
             nextBtn.title = "Roll the dice.";
        } else {
             nextBtn.value = remoteText;
             nextBtn.disabled = false; 
             nextBtn.style.opacity = "1.0";
             nextBtn.style.cursor = "pointer";
        }

    } else {
        // ... (Not my turn logic remains same) ...
        nextBtn.disabled = true;
        nextBtn.style.opacity = "0.5";
        nextBtn.style.cursor = "not-allowed";
        nextBtn.value = "Waiting for " + player[turn].name + "...";
        
        $(landedBox).find("input, button")
            .prop("disabled", true)
            .css("opacity", "0.5");
    }
    
    //Force re-center on player (optional)
    centerOnPlayer(); 
};

// === MULTIPLAYER HELPER ===
function broadcastGameState() {
    if (window.nostrManager && window.nostrManager.isHost) {
        console.log("📤 Broadcasting Game State + UI...");
        
        var bidInput = document.getElementById("bid");

        var state = {
            players: player,
            squares: square,
            turn: turn,
            pcount: pcount,
            
            // Sync the HTML content of the game controls
            alertHTML: document.getElementById("alert").innerHTML,
            landedHTML: document.getElementById("landed").innerHTML,
            landedVis: document.getElementById("landed").style.display,
            
            diceData: {
                d0_html: die0 ? die0.innerHTML : "",
                d0_class: die0 ? die0.className : "",
                d0_display: die0 ? die0.style.display : "none",
                d0_title: die0 ? die0.title : "",
                
                d1_html: die1 ? die1.innerHTML : "",
                d1_class: die1 ? die1.className : "",
                d1_display: die1 ? die1.style.display : "none",
                d1_title: die1 ? die1.title : ""
            },
            
            // Sync the Card Popup
            popupHTML: document.getElementById("popuptext").innerHTML,
            popupVis: document.getElementById("popupwrap").style.display || "none",
            overlayVis: document.getElementById("popupbackground").style.display,
            
            // Sync the main button state
            nextBtnVal: document.getElementById("nextbutton").value,
            nextBtnDisabled: document.getElementById("nextbutton").disabled,
            
            // FIX: Sync Trade Data
            tradeData: window.currentActiveTrade ? window.serializeTrade(window.currentActiveTrade) : null,
            tradeVis: document.getElementById("trade").style.display,
            
            //Add auction info
            auctionInputVal: bidInput ? bidInput.value : "",
            auctionInputColor: bidInput ? bidInput.style.color : "black",
            
            auctionData: game.getAuctionState ? game.getAuctionState() : null,
        };
        
        var saveKey = 'monopoly_state_' + window.nostrManager.gameId;
        localStorage.setItem(saveKey, JSON.stringify(state));

        window.nostrManager.broadcastGameUpdate(state, 'STATE');
    }
}

// Helper to broadcast state (Internal use, but exposed for debug)
window.broadcastGameState = broadcastGameState;


// === P2P HANDLERS (Host Side) ===

window.handlePlayerJoin = function(data) {
    // 1. Initialize Host if empty
    if (window.connectedPlayers.length === 0) {
        var hostName = document.getElementById("player1name").value || "Host";
        var hostColor = document.getElementById("player1color").value || "Yellow";
        window.connectedPlayers.push({ index: 1, name: hostName, color: hostColor.toLowerCase(), pubkey: window.nostrManager.pk });
    }

    // 2. Check if player exists
    var existing = window.connectedPlayers.find(function(p) { return p.pubkey === data.pubkey; });
    var playerObj = existing;

    if (!existing) {
        if (window.connectedPlayers.length >= 8) return; // Full

        var newIndex = window.connectedPlayers.length + 1;
        playerObj = {
            index: newIndex,
            name: data.name,
            color: data.color.toLowerCase(),
            pubkey: data.pubkey
        };
        window.connectedPlayers.push(playerObj);
        console.log("👋 New Player Joining:", data.name);
    } else {
        // Update basic info for existing player
        playerObj.name = data.name;
        playerObj.color = data.color.toLowerCase();
    }

    // --- CONFLICT RESOLUTION ---
    // We check THIS player against all OTHERS to ensure uniqueness.
    
    // A. Fix Color Conflict
    var takenColors = new Set();
    window.connectedPlayers.forEach(function(p) {
        if (p.index !== playerObj.index) takenColors.add(p.color);
    });

    if (takenColors.has(playerObj.color)) {
        // Color taken! Find a free one.
        var ALL_COLORS = ['yellow', 'blue', 'red', 'lime', 'green', 'aqua', 'orange', 'purple'];
        var freeColor = ALL_COLORS.find(function(c) { return !takenColors.has(c); });
        
        if (freeColor) {
            console.log("⚠️ Color conflict! Changing " + playerObj.name + " to " + freeColor);
            playerObj.color = freeColor;
        }
    }

    // B. Fix Name Conflict
    var takenNames = new Set();
    window.connectedPlayers.forEach(function(p) {
        if (p.index !== playerObj.index) takenNames.add(p.name);
    });

    if (takenNames.has(playerObj.name)) {
        console.log("⚠️ Name conflict! Appending ID.");
        playerObj.name = playerObj.name + " " + playerObj.index;
    }
    // ---------------------------

    // 3. Broadcast Update
    if (window.nostrManager) {
        window.nostrManager.broadcastGameUpdate({ players: window.connectedPlayers }, 'LOBBY_UPDATE');
    }
    
    if (window.updateLobbyUI) window.updateLobbyUI(window.connectedPlayers);
};

// 2. Handle Actions (Remote Control)
window.handleRemoteAction = function(action, payload) {
    console.log("🤖 Executing Remote Action:", action);
    
    // FLAG: Tell game functions to bypass "My Turn" checks
    window.isExecutingRemote = true; 
    
    try {
        switch(action) {
            case 'NEXT':
                game.next();
                break;
            case 'BUY':
                buy();
                break;
            case 'MORTGAGE':
                if (window.mortgage) window.mortgage(payload.index);
                break;
            case 'UNMORTGAGE':
                if (window.unmortgage) window.unmortgage(payload.index);
                break;
            case 'BUY_HOUSE':
                if (window.buyHouse) window.buyHouse(payload.index);
                break;
            case 'SELL_HOUSE':
                if (window.sellHouse) window.sellHouse(payload.index);
                break;    
            case 'PAY_FINE':
                payfifty();
                break;
            case 'USE_CARD':
                useJailCard();
                break;
            case 'POPUP_CLOSE':
                // FIX: Use .hide() instead of .fadeOut() to instantly remove it 
                // BEFORE broadcasting. This prevents sending "display: block" to the Joiner.
                $("#popupwrap").hide();
                $("#popupbackground").hide();
            
                if (window.currentPopupAction) {
                    window.currentPopupAction();
                    window.currentPopupAction = null;
                }
                // Broadcast matches the visual state (Hidden)
                setTimeout(broadcastGameState, 200);
                break;
            case 'AUCTION_BID':
            	game.auctionBid(payload.amount);
            	break;
            case 'AUCTION_PASS':
            	game.auctionPass();
            	break;
            case 'AUCTION_EXIT':
            	game.auctionExit();
            	break;
    	    case 'TRADE_PROPOSE':
                console.log("📩 Host received Trade Proposal");
                var tradeObj = window.deserializeTrade(payload);
                
                if (window.writeTrade) {
                    window.writeTrade(tradeObj);
                
                    // Save state
                    window.currentActiveTrade = tradeObj;
            
                    // UI Logic: Show Accept/Reject buttons
                    $("#proposetradebutton, #canceltradebutton").hide();
                    $("#accepttradebutton").show();
                    $("#rejecttradebutton").show();
            
                    // Open window if closed
                    $("#trade").show();
                    $("#board").hide();
                    $("#control").hide();
            
                    setTimeout(broadcastGameState, 200);
            	} else {
                    console.error("❌ writeTrade function not found!");
                }
                break;
            case 'TRADE_CANCEL':
                console.log("🚫 Remote Trade Cancel/Reject");
            
                // 1. Run standard cancel logic (Resets UI on Host)
                game.cancelTrade();
            
                // 2. Clear Global State (Critical)
                window.currentActiveTrade = null;
            
                // 3. Broadcast (Sends tradeData: null to Joiner so their window closes)
                setTimeout(broadcastGameState, 200);
                break;

            case 'TRADE_ACCEPT':
                console.log("✅ Remote Trade Accept");
            
                if (window.currentActiveTrade) {
                    // 1. Run standard accept logic (Swaps assets, updates money)
                    // Note: game.acceptTrade usually calls cancelTrade internally to close the UI
                    game.acceptTrade(window.currentActiveTrade);
                
                    // 2. Clear Global State
                    window.currentActiveTrade = null;
                }
            
                // 3. Broadcast (Sends new Money/Property owners + tradeData: null)
                setTimeout(broadcastGameState, 200);
                break;
            case 'RESIGN':
                game.resign();
                break;
        }
    } catch(e) {
        console.error("Remote Action Failed:", e);
    } finally {
        // RESET FLAG: Back to normal local protection
        window.isExecutingRemote = false;
    }
    
    // Force a broadcast after the action completes
    // (Except POPUP_CLOSE which handles it internally above)
    if (action !== 'POPUP_CLOSE') {
        setTimeout(broadcastGameState, 200);
    }
};

// === LOBBY CONFLICT SOLVER ===
window.resolveLobbyConflicts = function() {
    var players = window.connectedPlayers;
    if (!players || players.length === 0) return;

    // 1. Identify Host (Authority)
    var host = players.find(function(p) { return p.index === 1; });
    if (!host) return;

    var ALL_COLORS = ['yellow', 'blue', 'red', 'lime', 'green', 'aqua', 'orange', 'purple'];

    // 2. Iterate through Joiners to ensure they don't clash with Host (or each other)
    // We sort by index so P2 gets priority over P3, etc.
    players.sort(function(a, b) { return a.index - b.index; });

    players.forEach(function(p) {
        if (p.index === 1) return; // Never change the Host

        // A. Check Color Conflict
        // We check against Host AND any players processed before this one
        var takenColors = new Set();
        players.forEach(function(other) {
            if (other.index !== p.index) takenColors.add(other.color);
        });

        if (takenColors.has(p.color)) {
            // Conflict found! Find a free color.
            var freeColor = ALL_COLORS.find(function(c) { return !takenColors.has(c); });
            if (freeColor) {
                console.log("⚠️ Host took " + p.color + ". Moving Player " + p.index + " to " + freeColor);
                p.color = freeColor;
            }
        }

        // B. Check Name Conflict
        var takenNames = new Set();
        players.forEach(function(other) {
            if (other.index !== p.index) takenNames.add(other.name);
        });

        if (takenNames.has(p.name)) {
            p.name = p.name + " " + p.index;
        }
    });
};

// === TRADE SERIALIZER ===
window.serializeTrade = function(tradeObj) {
    if (!tradeObj) return null;
    
    var props = [];
    for (var i = 0; i < 40; i++) {
        props.push(tradeObj.getProperty(i));
    }

    return {
        initiatorIndex: tradeObj.getInitiator().index,
        recipientIndex: tradeObj.getRecipient().index,
        money: tradeObj.getMoney(),
        properties: props,
        communityChestJail: tradeObj.getCommunityChestJailCard(),
        chanceJail: tradeObj.getChanceJailCard()
    };
};

// === TRADE DESERIALIZER ===
window.deserializeTrade = function(data) {
    if (!data) return null;
    return new Trade(
        player[data.initiatorIndex],
        player[data.recipientIndex],
        data.money,
        data.properties,
        data.communityChestJail,
        data.chanceJail
    );
};
