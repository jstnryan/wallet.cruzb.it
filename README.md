# wallet.cruzb.it
In-browser cryptocurrency wallet for the cruzbit blockchain. [https://wallet.cruzb.it](https://wallet.cruzb.it)

## Summary
This is a self-contained, single-page website which provides basic cryptocurrency wallet functions for the [cruzbit blockchain](https://cruzb.it). It accepts either a public key (44 characters, ending in a single equals symbol - "=") or private key (88 characters, ending in two equals symbols - "=="). Providing a public key shows the last 10 transactions associated with the given key, and shows any pending, unconfirmed transactions to or from that key. Providing a private key allows the aforementioned monitoring, as well as the ability to generate (view signed tx code) and send transactions to the network.

## Installation
The site requires no installation. All files are included in the repository, and no further download nor compilation is necessary. The files in the [public](public) directory can be served by a webserver, or loaded into a browser directly from the cloned repository (for most GUI operating systems, double-clicking [index.html](public/index.html) will load the site in the default browser).

### Files
#### Libraries
The wallet relies on third-party libraries to provide certain functions, and reduce new code.
* [jQuery](https://jquery.com) - jQuery was chosen to reduce total lines of code, and provide easier human-comprehension of DOM manipulation functions. There are no functions which explicitly require the jQuery library, and the code could be converted to vanilla JavaScript with a small amount of effort.
* [TweetNaCl.js](https://tweetnacl.js.org/) -A proven and independently reviewed library used to encode/decode public and private keys
* [tweetnacl-util-js](https://github.com/dchest/tweetnacl-util-js) -  A helper library for TweetNaCl used for conversions
* [emn/178/js-sha3](https://github.com/emn178/js-sha3) - SHA-3/Keccak hashing library used to sign transactions
#### Front-End
The site itself is limited to three files, with obvious purpose based on their file extensions: [index.html](public/index.html), [wallet.css](public/wallet.css), and [wallet.js](public/wallet.js). A [favicon](public/favicon.ico) is also included.

## Usage
1. Copy and paste (**NEVER HAND TYPE CRYPTOCURRENCY KEYS**) a cruzbit public or private key into the text input and click the 'UPDATE' button.
2. The pending and confirmed transactions associated with this key will be loaded in the appropriate sections. As blocks are found by miners in the network, this information will be updated automatically.
3. If you have provided a private key, send a transaction by copy/pasting a recipient public key into the appropriate text input, type an amount, and optionally enter a transaction memo. The standard (minimum) transaction fee will be automatically added to the transaction. Click the 'SEND' button. Alternately, click the "down arrow" on the 'SEND' button to show a pop-up menu with links to generate the transaction details or complete 'push_transaction' message (but not send the transaction).

A constant connection to the network peer (upstream network client) will be maintained. In the event of a disconnection, a dialog box will be presented with the option to reconnect. Additionally, a page refresh will reconnect (but requires resubmission of public or private key).

## Security
* NEVER GIVE YOUR PRIVATE KEYS TO ANYONE. Anyone with a private key has complete access to the funds associated with it.
* This code does not send, nor store any keys. They are retained in the browser's memory only for the duration that the page is loaded. They are lost completely when the browser window or tab is closed. Keys are never sent away from your computer.
* HOWEVER, this code can be used to create malicious copies which do malicious things. Always ensure you are using the wallet from a website you trust, OR host the code (download it) and run it from your own computer.
* It is YOUR responsibility to ensure your keys are safe. Please do so.
