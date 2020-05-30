'use strict';
$(function() {
    /** ************************************************************************************************************* */
    /** "Globals" (only inside this closure) ************************************************************************ */

    const GENESIS_BLOCK_ID = "00000000e29a7850088d660489b7b9ae2da763bc3bd83324ecc54eee04840adb";
    /**
     * any peer can be used, but some browsers will reject unsigned connections
     * other known, SSL-signed options:
     *  -  wallet.cruzbit.xyz:8831
     *  -  one.cruzb.it:8831
     *  -  dns.cruzb.it:8831
     */
    const PEER_STRING = "two.cruzb.it:8831";
    const CRUZBITS_PER_CRUZ = 100000000;
    const BLOCKS_UNTIL_NEW_SERIES = 1008;
    const TX_FEE = Math.floor(0.01 * CRUZBITS_PER_CRUZ);

    let ws = undefined;
    let wallet = {
        publicKey: null,
        secretKey: null
    };
    let wallet_balance = 0;
    let tip_height = 0;

    /** ************************************************************************************************************* */
    /** WebSocket Functionality ************************************************************************************* */

    let socketSend = function(type, body) {
        let message = {
            type: type
        };
        if (body !== undefined || body !== '') {
            message.body = body;
        }
        try {
            ws.send(JSON.stringify(message));
        } catch (e) {
            // console.log("WebSocket error: " + e.message);
            if (window.confirm("The connection to cruzbit network was lost. Would you like to reconnect?")) {
                setTimeout(function () {
                    socketCreate()
                }, 5000);
            }
        }
    };
    let socketCreate = function() {
        ws = new WebSocket(
            "wss://" + PEER_STRING + "/" + GENESIS_BLOCK_ID,
            ["cruzbit.1"]
        );
        ws.addEventListener('message', function(event) {
            let message = JSON.parse(event.data);
            switch (message.type) {
                case 'balance':
                    if (message.body.public_key === nacl.util.encodeBase64(wallet.publicKey)) {
                        setBalance(message.body.balance);
                    }
                    break;
                case 'block':
                case 'filter_block':
                    // requested block info, or a new block has been mined
                    updateTipHeight(message.body.header.height);
                    checkBalance();
                    requestPendingTransactions();
                    requestConfirmedTransactions();
                    break;
                case 'filter_result':
                    if (!message.hasOwnProperty('body')) requestPendingTransactions();
                    break;
                case 'filter_transaction_queue':
                    // a new (pending) transaction pertaining to the public key
                    // body.transactions is an array of transaction
                    populatePendingTransactions(message.body.transactions);
                    break;
                case 'inv_block':
                    // a new block has been mined (probably)
                    updateTipHeight(tip_height + 1); // assume a new block to force transaction updates
                    checkBalance();
                    requestPendingTransactions();
                    requestConfirmedTransactions();
                    socketSend('get_tip_header'); // get the actual tip height
                    break;
                case 'push_transaction':
                    // new transaction (potential unconfirmed bet)
                    // ensure we only show bets, not payouts
                    let pubKey = nacl.util.encodeBase64(wallet.publicKey);
                    if (message.body.transaction.to === pubKey || message.body.transaction.from === pubKey) {
                        addPendingTransaction(message.body.transaction);
                    }
                    break;
                case 'push_transaction_result':
                    // this is our own push_transaction from a send (message.body.transaction_id)
                    if (message.body.hasOwnProperty('error')) {
                        alert("There was an error; your transaction was not successfully sent!\nThe error message is: "
                            + message.body.error);
                        //get actual balance
                        checkBalance();
                    }
                    // one option would be to request the individual transaction details, and amend the existing list,
                    // but if we're going to make a request anyway, may as well get the entire queue.
                    requestPendingTransactions();
                    break;
                case 'public_key_transactions':
                    // a list of block headers containing an array of transactions relevant to the public key
                    if (message.body.hasOwnProperty('filter_blocks') && message.body.filter_blocks != null) {
                        if (message.body.filter_blocks.length > 0) {
                            let tx = [];
                            message.body.filter_blocks.forEach(function(blockHeader) {
                                tx = tx.concat(blockHeader.transactions);
                            });
                            populateConfirmedTransactions(tx);
                        }
                    }
                    break;
                case 'tip_header':
                    updateTipHeight(message.body.header.height);
                    break;
            }
        });
        ws.addEventListener('open', function(event) {
            socketSend('get_tip_header');

            if (wallet.publicKey !== null) {
                socketSend(
                    'filter_add',
                    {
                        'public_keys': [nacl.util.encodeBase64(wallet.publicKey)]
                    }
                );
            }
        });
        ws.onclose = function() {
            ws = null;
            if (window.confirm("The connection to cruzbit network was lost. Would you like to reconnect?")) {
                setTimeout(function () {
                    socketCreate()
                }, 5000);
            }
        };
        return ws;
    };

    /** ************************************************************************************************************* */
    /** WebSocket Message Helper Functions ************************************************************************** */

    function updateTipHeight(height) {
        tip_height = height;
    }

    function setFilter() {
        socketSend(
            'filter_add',
            {
                'public_keys': [nacl.util.encodeBase64(wallet.publicKey)]
            }
        );
    }

    function checkBalance(pubKey = null) {
        if (pubKey === null && wallet.publicKey === null) return;
        socketSend(
            "get_balance",
            {
                public_key: (pubKey === null) ? nacl.util.encodeBase64(wallet.publicKey) : pubKey
            }
        );
    }

    function setBalance(balance) { // balance in CRUZBIT units
        wallet_balance = parseInt(balance);
        $('#wallet-balance').text(amountInCruz(wallet_balance));
    }

    function adjustBalance(amount) { // amount in CRUZBIT units
        setBalance(wallet_balance + parseInt(amount));
    }

    function requestPendingTransactions() {
        socketSend('get_filter_transaction_queue');
    }

    function requestConfirmedTransactions() {
        if (wallet.publicKey === null) return;

        socketSend(
            'get_public_key_transactions',
            {
                'public_key': nacl.util.encodeBase64(wallet.publicKey),
                'start_height': tip_height + 1, // start at the latest block plus one
                // 'start_index': 0, // skip this many
                'end_height': 0, // continue to this block
                'limit': 10, // return this many total
            }
        );
    }

    /** ************************************************************************************************************* */
    /** Page/HTML Manipulation ************************************************************************************** */

    function populatePendingTransactions(transactions) {
        let pendingElm = $('#wallet-transactions-pending');
        if (transactions === null || transactions.length < 1) {
            pendingElm.html('<tr class="no-results"><td colspan="3">No pending transactions.</td></tr>');
            return;
        }

        let pubKey = nacl.util.encodeBase64(wallet.publicKey);
        let pendingHtml = '';
        transactions.forEach(function(tx) {
            // calculate the transaction ID (hash); doesn't include signature
            if (tx.hasOwnProperty('signature')) delete tx.signature;
            let txId = sha3_256(JSON.stringify(tx));
            pendingHtml += '<tr><td><span title="' + txId + '">' + truncateString(txId, 8, 8);
            pendingHtml += '</span></td><td><a href="https://cruzbase.com/#/address/';
            if (tx.to === pubKey) {
                // this is an "incoming" transaction (credit)
                // note that the "from" property can be omitted, but is only relevant for coinbase transactions
                //  which do not appear in FilterTransactionQueue messages
                pendingHtml += tx.from + '" title="' + tx.from + '">' + tx.from + '</a></td>';
                pendingHtml += '<td><span class="amt-positive">' + amountInCruz(tx.amount) + '</span></td></tr>';
            } else {
                // this is an "outgoing" transaction (debit)
                pendingHtml += tx.to + '" title="' + tx.to + '">' + tx.to + '</a></td>';
                pendingHtml += '<td><span class="amt-negative">'
                    + amountInCruz(tx.amount + tx.fee) + '</span></td></tr>';
            }
        });
        pendingElm.html(pendingHtml);
    }

    function addPendingTransaction(transaction) {
        $('#wallet-transactions-pending .no-results').remove();
        let pendingHtml = '';
        if (tx.hasOwnProperty('signature')) delete tx.signature;
        let txId = sha3_256(JSON.stringify(tx));
        pendingHtml += '<tr><td><span title="' + txId + '">' + truncateString(txId, 8, 8);
        pendingHtml += '</span></td><td><a href="https://cruzbase.com/#/address/';
        if (tx.to === nacl.util.encodeBase64(wallet.publicKey)) {
            // this is an "incoming" transaction (credit)
            // note that the "from" property can be omitted, but is only relevant for coinbase transactions
            //  which do not appear in FilterTransactionQueue messages
            pendingHtml += tx.from + '" title="' + tx.from + '">' + tx.from + '</a></td>';
            pendingHtml += '<td><span class="amt-positive">' + amountInCruz(tx.amount) + '</span></td></tr>';
        } else {
            // this is an "outgoing" transaction (debit)
            pendingHtml += tx.to + '" title="' + tx.to + '">' + tx.to + '</a></td>';
            pendingHtml += '<td><span class="amt-negative">'
                + amountInCruz(tx.amount + tx.fee) + '</span></td></tr>';
        }
        $('#wallet-transactions-pending').append(pendingHtml);
    }

    function populateConfirmedTransactions(transactions) {
        let confirmedElm = $('#wallet-transactions-confirmed');
        if (transactions.length < 1) {
            confirmedElm.html('<tr class="no-results"><td colspan="3">No transactions found.</td></tr>');
            return;
        }

        let pubKey = nacl.util.encodeBase64(wallet.publicKey);
        let confirmedHtml = '';
        //transactions.slice().reverse().forEach(function(tx) {
        transactions.forEach(function(tx) {
            // calculate the transaction ID (hash); doesn't include signature
            if (tx.hasOwnProperty('signature')) delete tx.signature;
            let txId = sha3_256(JSON.stringify(tx));
            confirmedHtml += '<tr><td><a href="https://cruzbase.com/#/transaction/' + txId;
            confirmedHtml += '" title="' + txId + '">' + truncateString(txId, 8, 8);
            confirmedHtml += '</a></td><td>';
            if (tx.to === pubKey) {
                // this is an "incoming" transaction (credit)
                if (tx.hasOwnProperty('from')) {
                    // regular transaction
                    confirmedHtml += '<a href="https://cruzbase.com/#/address/' + tx.from
                        + '" title="' + tx.from + '">' + tx.from + '</a></td>';
                    confirmedHtml += '<td><span class="amt-positive">' + amountInCruz(tx.amount) + '</span></td></tr>';
                } else {
                    // coinbase (block reward) transaction
                    confirmedHtml += 'coinbase reward</td>' + '<td><span class="amt-positive">'
                        + amountInCruz(tx.amount) + '</span></td></tr>';
                }
            } else {
                // this is an "outgoing" transaction (debit)
                confirmedHtml += '<a href="https://cruzbase.com/#/address/' + tx.to
                    + '" title="' + tx.to + '">' + tx.to + '</a></td>';
                confirmedHtml += '<td><span class="amt-negative">'
                    + amountInCruz(tx.amount + tx.fee) + '</span></td></tr>';
            }
        });
        confirmedElm.html(confirmedHtml);
    }

    let sectionToggle = function(action = 'open') {
        if (action === 'open') {
            document.getElementById('wallet-update').classList.add('u-hidden');
            document.getElementById('wallet-info').classList.remove('u-hidden');
            if (wallet.secretKey !== null) {
                document.getElementById('wallet-send').classList.remove('u-hidden');
            }
            document.getElementById('wallet-ledger').classList.remove('u-hidden');
        } else {
            document.getElementById('wallet-info').classList.add('u-hidden');
            document.getElementById('wallet-send').classList.add('u-hidden');
            document.getElementById('wallet-ledger').classList.add('u-hidden');
            document.getElementById('wallet-update').classList.remove('u-hidden');
        }
    }

    // check submitted key and populate form
    $('#wallet-key-update').on('click', function(e) {
        let key = document.getElementById('wallet-key');
        if (key.value.length === 44) {
            // https://github.com/dchest/tweetnacl-util-js#naclutildecodebase64string
            wallet.publicKey = nacl.util.decodeBase64(key.value);
        } else if (key.value.length === 88) {
            try {
                // https://github.com/dchest/tweetnacl-js/blob/master/README.md#signatures
                wallet = nacl.sign.keyPair.fromSecretKey(nacl.util.decodeBase64(key.value));
            } catch(error) {
                alert("Please enter a valid cruzbit private key.\nError: " + error.message);
                $('#wallet-key').focus();
                return;
            }
        } else {
            alert("Please enter a valid cruzbit public or private key.");
            $('#wallet-key').focus();
        }
        let pubElm = document.getElementById('wallet-pubkey');
        let pubKey = nacl.util.encodeBase64(wallet.publicKey);
        pubElm.innerText = pubKey;
        pubElm.href = "https://cruzbase.com/#/address/" + pubKey;
        sectionToggle('open');
        setFilter(); // automatically gets pending transactions
        checkBalance(pubKey);
        requestConfirmedTransactions();
    });

    // reset form and request new key
    $('#wallet-key-change').on('click', function(e) {
        sectionToggle('close');
        populatePendingTransactions([]);
        populateConfirmedTransactions([]);
        wallet = {
            publicKey: null,
            secretKey: null
        };
        $('#wallet-key').focus();
    });

    // generate and send transaction
    $('#wallet-submit').on('click', function(e) {
        // some checks
        let elmAmount = $('#wallet-amount');
        let amount = parseFloat(elmAmount.val());
        if (amount < 1 || elmAmount.is(':invalid')) {
            alert("Please input a valid bet amount.");
            elmAmount.focus();
            return;
        }
        // create the transaction
        let transaction = generateSignedTransaction(
            $('#wallet-recipient').val(),
            amount,
            $('#wallet-memo').val()
        );
        // send it
        socketSend(
            "push_transaction",
            {
                transaction: transaction
            }
        );
        // 'artificially' adjust balance display
        // actual balance will be updated upon tx confirmation, and upon new block
        adjustBalance((transaction.amount + transaction.fee) * -1);
    });

    // show pop-up menu
    $('#wallet-option').on('click', function(e) {
        $('#wallet-send-options').toggleClass('show');
    });

    // hide pop-up menu if focus went elsewhere
    window.onclick = function(e) {
        if (!e.target.matches('.button-option-right')) {
            $('#wallet-send-options').removeClass('show');
        }
    }

    // generate and display transaction JSON, don't send transaction
    $('#option-generate-tx').on('click', function(e) {
        // some checks
        let elmAmount = $('#wallet-amount');
        let amount = parseFloat(elmAmount.val());
        if (amount < 1 || elmAmount.is(':invalid')) {
            alert("Please input a valid bet amount.");
            elmAmount.focus();
            return;
        }
        // create the transaction
        let transaction = generateSignedTransaction(
            $('#wallet-recipient').val(),
            amount,
            $('#wallet-memo').val()
        );
        alert(JSON.stringify(transaction));
    });

    // generate and display push_transaction_message, don't send transaction
    $('#option-generate-mx').on('click', function(e) {
        // some checks
        let elmAmount = $('#wallet-amount');
        let amount = parseFloat(elmAmount.val());
        if (amount < 1 || elmAmount.is(':invalid')) {
            alert("Please input a valid bet amount.");
            elmAmount.focus();
            return;
        }
        // create the transaction
        let transaction = generateSignedTransaction(
            $('#wallet-recipient').val(),
            amount,
            $('#wallet-memo').val()
        );
        let message = {
            'type': 'push_transaction',
            'body': {
                transaction: transaction
            }
        };
        alert(JSON.stringify(message));
    });

    /** ************************************************************************************************************* */
    /** Helper, Convenience Functions ******************************************************************************* */

    function amountInCruz(amount) {
        return amount / CRUZBITS_PER_CRUZ;
    }

    function amountInCruzbit(amount) {
        return amount * CRUZBITS_PER_CRUZ;
    }

    function generateSignedTransaction(recipient, amount, memo) {
        let transaction = {
            time: Math.floor(Date.now() / 1000),
            nonce: Math.floor(Math.random() * (2 ** 31 - 1)),
            from: nacl.util.encodeBase64(wallet.publicKey),
            to: recipient,
            amount: amountInCruzbit(amount),
            fee: TX_FEE,
            memo: memo,
            expires: parseInt(tip_height) + 3, // must be mined within the next 3 blocks
            series: Math.floor(tip_height / BLOCKS_UNTIL_NEW_SERIES) + 1,
        };
        // compute the hash
        let tx_hash = sha3_256(JSON.stringify(transaction));
        // sign it
        let tx_byte = new Uint8Array(tx_hash.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        let sig = nacl.sign.detached(tx_byte, wallet.secretKey);
        transaction["signature"] = nacl.util.encodeBase64(sig);
        return transaction;
    }

    // https://medium.com/@johnumarattil/truncating-middle-portion-of-a-string-in-javascript-173bfe1f9ae3
    function truncateString(str, firstCharCount = str.length, endCharCount = 0, dotCount = 3) {
        var convertedStr="";
        convertedStr+=str.substring(0, firstCharCount);
        convertedStr += ".".repeat(dotCount);
        convertedStr+=str.substring(str.length-endCharCount, str.length);
        return convertedStr;
    }

    /** ************************************************************************************************************* */
    /** document.ready Actions ************************************************************************************** */

   socketCreate();

    /** ************************************************************************************************************* */
    /** Debugging *************************************************************************************************** */

    /** create an object of references for easy inspection
     *  https://stackoverflow.com/a/29514310
     */
    // $.exposed = {
    //     ws: ws,
    //     tip_height: tip_height,
    // };
});
