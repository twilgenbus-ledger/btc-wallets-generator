# btc-wallets-generator

This is a simple generator of BIP49 wallets in testnet

Usage:
```
?> npx ts-node src/index.ts --nb_addresses 1 --transactions 1
```
The output gives a transaction to fund the wallet. You can broadcast it from here: https://live.blockcypher.com/btc-testnet/pushtx/
